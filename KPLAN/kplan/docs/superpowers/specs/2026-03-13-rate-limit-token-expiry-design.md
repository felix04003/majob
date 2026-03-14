# Design : Rate Limiting `/api/scan` + Expiration `client_token`

**Date :** 2026-03-13
**Statut :** Approuvé
**Priorités audit :** #2 (rate limiting) + #4 (expiration client_token)

---

## Contexte

Deux blockers sécurité avant mise en production :

1. **`/api/scan`** — endpoint public sans aucune protection. Un attaquant peut spammer le QR scan sans limite, surchargeant Supabase et exposant l'API à des abus.
2. **`client_token`** — les tokens sont créés avec `expires_at: null` et ne meurent jamais. De plus, la logique de validation est dupliquée dans 6+ routes sans helper centralisé.

**Contraintes :**
- Déploiement Vercel (serverless, pas de Redis natif)
- Zéro nouvelle dépendance npm
- Zéro changement de schéma DB (`expires_at` existe déjà sur `client_access`)
- Usage réel `/api/scan` : une tablette/phone (IP fixe), scans manuels jour-J
- Durée de vie souhaitée du `client_token` : jusqu'à la date de l'événement (`start_at`)

---

## Architecture

### Fichiers créés

```
lib/
  rate-limit.ts          ← store in-memory, fenêtre glissante 60s
  server/
    client.ts            ← requireClientAccess() helper
```

### Fichiers modifiés

```
app/api/
  scan/route.ts                                    ← + rate limit
  planner/events/[id]/client-access/rotate/route.ts ← + expires_at = event.start_at
  client/
    event/route.ts           ← délègue à requireClientAccess()
    tasks/route.ts           ← délègue à requireClientAccess()
    tasks/[taskId]/comments/route.ts
    tasks/[taskId]/validate/route.ts
    guests/route.ts
    appointments/route.ts
    changes/route.ts
    guest-change/route.ts
```

---

## Feature 1 — Rate Limiting `/api/scan`

### Composant : `lib/rate-limit.ts`

Store in-memory avec fenêtre glissante :

```ts
interface RateLimitStore {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitStore>()

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): { ok: boolean; retryAfter?: number }
```

**Comportement :**
- Clé = adresse IP (depuis `x-forwarded-for`, Vercel la pose automatiquement)
- Limite : **30 requêtes / 60 secondes** par IP
- À chaque appel : si `resetAt` est dépassé, on recrée une entrée fraîche
- Si `count >= limit` : retourne `{ ok: false, retryAfter: secondes restantes }`
- Sinon : incrémente `count`, retourne `{ ok: true }`

**Limites connues :**
- Le store se réinitialise sur cold start Vercel — acceptable pour le cas d'usage (tablette jour-J, cold start = ms)
- Pas partagé entre instances Vercel simultanées — acceptable (one scanner, one IP)

### Modification : `app/api/scan/route.ts`

```ts
// Avant tout traitement :
const ip = req.headers.get("x-forwarded-for") ?? "unknown"
const rl = rateLimit(ip, { limit: 30, windowMs: 60_000 })
if (!rl.ok) {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
  )
}
```

**Réponse si bloqué :** `429 Too Many Requests` + header `Retry-After: <secondes>`

---

## Feature 2 — Expiration `client_token` + Helper centralisé

### Composant : `lib/server/client.ts`

Helper symétrique à `requirePlannerSession()` dans `lib/server/planner.ts` :

```ts
export async function requireClientAccess(token: string): Promise<
  | { ok: true; eventId: string }
  | { ok: false; response: NextResponse }
>
```

**Comportement :**
1. Valide le format du token (zod, min 10 chars)
2. Cherche le token en DB (`client_access` table)
3. Si introuvable : `401 Invalid token`
4. Si `expires_at` présent et dépassé : `401 Token expired`
5. Sinon : retourne `{ ok: true, eventId }`

**Centralise la logique dupliquée** dans ces 8 routes :
- `/api/client/event`
- `/api/client/tasks`
- `/api/client/tasks/[taskId]/comments`
- `/api/client/tasks/[taskId]/validate`
- `/api/client/guests`
- `/api/client/appointments`
- `/api/client/changes`
- `/api/client/guest-change`

**Pattern de migration dans chaque route :**

```ts
// AVANT (~10 lignes répétées)
const Query = z.object({ token: z.string().min(10) })
const parsed = Query.safeParse(...)
if (!parsed.success) return NextResponse.json({ error: "..." }, { status: 400 })
const { data: access } = await db.from("client_access").select(...).eq("client_token", token).single()
if (!access) return NextResponse.json({ error: "Invalid token" }, { status: 401 })
if (access.expires_at && new Date(access.expires_at) < new Date()) return 401

// APRÈS (3 lignes)
const gate = await requireClientAccess(token)
if (!gate.ok) return gate.response
const { eventId } = gate
```

### Modification : `rotate/route.ts`

À la création d'un nouveau token, on fetch l'événement pour récupérer `start_at` :

```ts
// Fetch start_at de l'événement
const { data: event } = await db
  .from("events")
  .select("start_at")
  .eq("id", eventId)
  .single()

// Le nouveau token expire à la date de l'événement
const expiresAt = event?.start_at ?? null

await db.from("client_access").insert({
  event_id: eventId,
  client_token: newToken,
  expires_at: expiresAt,   // ← était toujours null avant
})
```

**Tokens existants :** les tokens déjà créés avec `expires_at: null` restent valides jusqu'à rotation manuelle — pas de migration SQL nécessaire. Le planner peut forcer l'expiration via "Regénérer le lien".

---

## Error Handling

| Situation | Code | Message |
|-----------|------|---------|
| Trop de scans (rate limit) | 429 | `Too many requests` + `Retry-After` header |
| Token manquant/invalide | 400 | `Missing/invalid token` |
| Token introuvable en DB | 401 | `Invalid token` |
| Token expiré | 401 | `Token expired` |
| Event introuvable (rotate) | 404 | `Event not found` |

---

## Tests

Deux fonctions pures, testables sans mock Supabase complexe :

**`lib/rate-limit.test.ts` :**
- Première requête : `ok: true`
- 30 requêtes successives : toutes `ok: true`
- 31ème : `ok: false` + `retryAfter` > 0
- Après reset (windowMs écoulé) : `ok: true` à nouveau

**`lib/server/client.test.ts` :**
- Token valide sans `expires_at` : `{ ok: true }`
- Token valide avec `expires_at` futur : `{ ok: true }`
- Token avec `expires_at` passé : `{ ok: false, 401 }`
- Token inconnu : `{ ok: false, 401 }`

---

## Ce qui n'est PAS dans ce PR

- Pas de migration SQL (schéma inchangé)
- Pas de changement UI côté dashboard planner
- Pas de Vercel KV (peut être ajouté en V2 si besoin de persistance cross-instances)
- Pas d'expiration automatique des tokens existants (null → date)
