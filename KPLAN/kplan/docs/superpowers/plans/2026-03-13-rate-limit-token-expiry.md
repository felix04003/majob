# Rate Limiting + Client Token Expiry — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un rate limit sur `/api/scan`, forcer l'expiration des `client_token` à `event.start_at`, et centraliser la validation du token client dans un helper.

**Architecture:** In-memory rate limiter (`lib/rate-limit.ts`) branché en tête de `/api/scan`. Helper `requireClientAccess()` (`lib/server/client.ts`) extrait des 8 routes client. Route `rotate` mise à jour pour poser `expires_at = event.start_at`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (admin), Vitest. Zéro nouvelle dépendance npm.

**Spec :** `docs/superpowers/specs/2026-03-13-rate-limit-token-expiry-design.md`

---

## Chunk 1 : Rate Limiting `/api/scan`

### Task 1 : `lib/rate-limit.ts` (TDD)

**Files:**
- Create: `lib/rate-limit.ts`
- Create: `tests/lib/rate-limit.test.ts`

---

- [ ] **Step 1.1 : Écrire les tests (fichier entier)**

Créer `tests/lib/rate-limit.test.ts` :

```ts
import { describe, it, expect, beforeEach } from "vitest"
import { rateLimit, _resetStore } from "@/lib/rate-limit"

describe("rateLimit", () => {
  beforeEach(() => {
    _resetStore()
  })

  it("allows first request", () => {
    const result = rateLimit("ip-1", { limit: 3, windowMs: 60_000 })
    expect(result.ok).toBe(true)
  })

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 3; i++) {
      const result = rateLimit("ip-2", { limit: 3, windowMs: 60_000 })
      expect(result.ok).toBe(true)
    }
  })

  it("blocks the request exceeding the limit", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-3", { limit: 3, windowMs: 60_000 })
    const result = rateLimit("ip-3", { limit: 3, windowMs: 60_000 })
    expect(result.ok).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it("isolates different IPs", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-4", { limit: 3, windowMs: 60_000 })
    const result = rateLimit("ip-5", { limit: 3, windowMs: 60_000 })
    expect(result.ok).toBe(true)
  })

  it("resets after window expires", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-6", { limit: 3, windowMs: 1 })
    // Attendre que la fenêtre expire (1ms)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = rateLimit("ip-6", { limit: 3, windowMs: 1 })
        expect(result.ok).toBe(true)
        resolve()
      }, 5)
    })
  })
})
```

- [ ] **Step 1.2 : Vérifier que le test échoue**

```bash
cd /Users/A.BEYE/KPLAN/kplan
npx vitest run tests/lib/rate-limit.test.ts
```

Attendu : `FAIL` — `Cannot find module '@/lib/rate-limit'`

- [ ] **Step 1.3 : Implémenter `lib/rate-limit.ts`**

```ts
interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): { ok: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { ok: true }
  }

  if (entry.count >= options.limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { ok: true }
}

/** Réservé aux tests — vide le store en mémoire */
export function _resetStore(): void {
  store.clear()
}
```

- [ ] **Step 1.4 : Vérifier que les tests passent**

```bash
npx vitest run tests/lib/rate-limit.test.ts
```

Attendu : `5 passed`

- [ ] **Step 1.5 : Commit**

```bash
cd /Users/A.BEYE
git add KPLAN/kplan/lib/rate-limit.ts KPLAN/kplan/tests/lib/rate-limit.test.ts
git commit -m "feat: add in-memory rate limiter with tests"
```

---

### Task 2 : Brancher le rate limit sur `/api/scan`

**Files:**
- Modify: `app/api/scan/route.ts`
- Modify: `tests/api/scan.test.ts`

---

- [ ] **Step 2.1 : Ajouter les tests de rate limit dans `tests/api/scan.test.ts`**

Ajouter ce bloc à la suite des tests existants (après le dernier `it(...)`, avant la fermeture du `describe`) :

```ts
describe("rate limiting", () => {
  it("returns 429 after too many requests from same IP", async () => {
    // Dépasser la limite (30 req/60s) en mockant rateLimit
    vi.mock("@/lib/rate-limit", () => ({
      rateLimit: vi.fn(() => ({ ok: false, retryAfter: 45 })),
    }))

    // Re-import POST après mock
    vi.resetModules()
    const { POST: POSTLimited } = await import("@/app/api/scan/route")

    const req = createRequest("http://localhost/api/scan", {
      json: { qrToken: "some-valid-qr-token-1234" },
      headers: { "x-forwarded-for": "1.2.3.4" },
    })
    const res = await POSTLimited(req)
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("45")

    vi.unmock("@/lib/rate-limit")
    vi.resetModules()
  })
})
```

- [ ] **Step 2.2 : Vérifier que le test échoue**

```bash
npx vitest run tests/api/scan.test.ts
```

Attendu : `FAIL` — le rate limit n'existe pas encore dans la route

- [ ] **Step 2.3 : Modifier `app/api/scan/route.ts`**

Ajouter l'import et le check au début du handler POST. Fichier complet après modification :

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/rate-limit"

const Body = z.object({ qrToken: z.string().min(10) })

export async function POST(req: Request) {
  // Rate limiting — 30 requêtes / 60s par IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rl = rateLimit(ip, { limit: 30, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    )
  }

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Missing qrToken" }, { status: 400 })

  const db = supabaseAdmin()
  const qrToken = parsed.data.qrToken

  const { data: pass } = await db
    .from("qr_passes")
    .select("event_id, guest_id, is_active")
    .eq("qr_token", qrToken)
    .maybeSingle()

  if (!pass) {
    await db.from("checkins").insert({ qr_token: qrToken, result: "invalid", event_id: null, guest_id: null })
    return NextResponse.json({ result: "invalid" }, { status: 200 })
  }

  if (!pass.is_active) {
    await db
      .from("checkins")
      .insert({ qr_token: qrToken, result: "revoked", event_id: pass.event_id, guest_id: pass.guest_id })
    return NextResponse.json({ result: "revoked" }, { status: 200 })
  }

  const { data: already } = await db
    .from("checkins")
    .select("id")
    .eq("event_id", pass.event_id)
    .eq("guest_id", pass.guest_id)
    .eq("result", "valid")
    .maybeSingle()

  if (already) {
    await db
      .from("checkins")
      .insert({ qr_token: qrToken, result: "already_checked_in", event_id: pass.event_id, guest_id: pass.guest_id })
    return NextResponse.json({ result: "already_checked_in" }, { status: 200 })
  }

  await db.from("checkins").insert({ qr_token: qrToken, result: "valid", event_id: pass.event_id, guest_id: pass.guest_id })
  return NextResponse.json({ result: "valid" }, { status: 200 })
}
```

- [ ] **Step 2.4 : Vérifier que tous les tests scan passent**

```bash
npx vitest run tests/api/scan.test.ts
```

Attendu : tous les tests `PASS`

- [ ] **Step 2.5 : Lancer la suite complète — pas de régression**

```bash
npm test
```

Attendu : tous les tests `PASS`

- [ ] **Step 2.6 : Commit**

```bash
cd /Users/A.BEYE
git add KPLAN/kplan/app/api/scan/route.ts KPLAN/kplan/tests/api/scan.test.ts
git commit -m "feat: rate limit /api/scan at 30 req/60s per IP"
```

---

## Chunk 2 : Client Token Expiry + Helper Centralisé

### Task 3 : `lib/server/client.ts` (TDD)

**Files:**
- Create: `lib/server/client.ts`
- Create: `tests/lib/client-access.test.ts`

---

- [ ] **Step 3.1 : Écrire les tests**

Créer `tests/lib/client-access.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock supabaseAdmin ────────────────────────────────────────────────────────
let mockAccessResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(mockAccessResult)),
    })),
  }),
}))

const { requireClientAccess } = await import("@/lib/server/client")

describe("requireClientAccess", () => {
  beforeEach(() => {
    mockAccessResult = { data: null, error: null }
  })

  it("returns 400 for empty token", async () => {
    const result = await requireClientAccess("")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it("returns 400 for token shorter than 10 chars", async () => {
    const result = await requireClientAccess("short")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it("returns 401 for unknown token", async () => {
    mockAccessResult = { data: null, error: { message: "not found" } }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body.error).toBe("Invalid token")
    }
  })

  it("returns ok for valid token without expires_at", async () => {
    mockAccessResult = { data: { event_id: "evt-123", expires_at: null }, error: null }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.eventId).toBe("evt-123")
  })

  it("returns ok for valid token with future expires_at", async () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    mockAccessResult = { data: { event_id: "evt-456", expires_at: future }, error: null }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.eventId).toBe("evt-456")
  })

  it("returns 401 for expired token", async () => {
    const past = new Date(Date.now() - 86400_000).toISOString()
    mockAccessResult = { data: { event_id: "evt-789", expires_at: past }, error: null }
    const result = await requireClientAccess("valid-token-length-ok")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body.error).toBe("Token expired")
    }
  })
})
```

- [ ] **Step 3.2 : Vérifier que les tests échouent**

```bash
npx vitest run tests/lib/client-access.test.ts
```

Attendu : `FAIL` — `Cannot find module '@/lib/server/client'`

- [ ] **Step 3.3 : Implémenter `lib/server/client.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

type ClientAccessResult =
  | { ok: true; eventId: string }
  | { ok: false; response: NextResponse }

export async function requireClientAccess(token: string): Promise<ClientAccessResult> {
  if (!token || token.length < 10) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing/invalid token" }, { status: 400 }),
    }
  }

  const db = supabaseAdmin()
  const { data: access } = await db
    .from("client_access")
    .select("event_id, expires_at")
    .eq("client_token", token)
    .single()

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    }
  }

  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Token expired" }, { status: 401 }),
    }
  }

  return { ok: true, eventId: access.event_id }
}
```

- [ ] **Step 3.4 : Vérifier que les tests passent**

```bash
npx vitest run tests/lib/client-access.test.ts
```

Attendu : `6 passed`

- [ ] **Step 3.5 : Commit**

```bash
cd /Users/A.BEYE
git add KPLAN/kplan/lib/server/client.ts KPLAN/kplan/tests/lib/client-access.test.ts
git commit -m "feat: add requireClientAccess() helper with tests"
```

---

### Task 4 : Expiration `client_token` dans `rotate/route.ts`

**Files:**
- Modify: `app/api/planner/events/[id]/client-access/rotate/route.ts`

---

- [ ] **Step 4.1 : Modifier `rotate/route.ts`**

Remplacer le fichier entier :

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { randomToken } from "@/lib/tokens"

const Params = z.object({ id: z.string().uuid() })

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()
  const eventId = parsed.data.id

  // Fetch event pour récupérer start_at (sert d'expiration au nouveau token)
  const { data: event, error: eventErr } = await db
    .from("events")
    .select("start_at")
    .eq("id", eventId)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  // Expire les tokens précédents sans expires_at
  const { data: prev } = await db
    .from("client_access")
    .select("id, expires_at")
    .eq("event_id", eventId)
    .is("expires_at", null)
    .order("created_at", { ascending: false })

  if (prev && prev.length > 0) {
    await db
      .from("client_access")
      .update({ expires_at: new Date().toISOString() })
      .in("id", prev.map((p: any) => p.id))
  }

  const clientToken = randomToken(24)
  const { data: access, error: ae } = await db
    .from("client_access")
    .insert({
      event_id: eventId,
      client_token: clientToken,
      expires_at: event.start_at,  // ← expire à la date de l'événement
    })
    .select("*")
    .single()

  if (ae || !access) {
    return NextResponse.json({ error: ae?.message ?? "Create client access failed" }, { status: 500 })
  }

  return NextResponse.json({ clientAccess: access })
}
```

- [ ] **Step 4.2 : Vérifier le build TypeScript**

```bash
cd /Users/A.BEYE/KPLAN/kplan
npx tsc --noEmit
```

Attendu : aucune erreur

- [ ] **Step 4.3 : Lancer la suite de tests — pas de régression**

```bash
npm test
```

Attendu : tous les tests `PASS`

- [ ] **Step 4.4 : Commit**

```bash
cd /Users/A.BEYE
git add KPLAN/kplan/app/api/planner/events/[id]/client-access/rotate/route.ts
git commit -m "feat: set client_token expires_at = event.start_at on creation"
```

---

### Task 5 : Migrer les 8 routes client vers `requireClientAccess()`

**Files:**
- Modify: `app/api/client/event/route.ts`
- Modify: `app/api/client/tasks/route.ts`
- Modify: `app/api/client/tasks/[taskId]/comments/route.ts`
- Modify: `app/api/client/tasks/[taskId]/validate/route.ts`
- Modify: `app/api/client/guests/route.ts`
- Modify: `app/api/client/appointments/route.ts`
- Modify: `app/api/client/changes/route.ts`
- Modify: `app/api/client/guest-change/route.ts`

**Pattern de migration — identique pour toutes les routes GET à token dans query params :**

Dans chaque route, remplacer le bloc de validation dupliqué :

```ts
// AVANT — supprimer ces lignes (~10 lignes)
const Query = z.object({ token: z.string().min(10) })

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Missing/invalid token" }, { status: 400 })

  const db = supabaseAdmin()
  const { data: access, error: ae } = await db
    .from("client_access")
    .select("event_id, expires_at")
    .eq("client_token", parsed.data.token)
    .single()

  if (ae || !access) return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  if (access.expires_at && new Date(access.expires_at) < new Date())
    return NextResponse.json({ error: "Token expired" }, { status: 401 })

  // SUITE: utilisait access.event_id
```

```ts
// APRÈS — remplacer par ces lignes (~5 lignes)
import { requireClientAccess } from "@/lib/server/client"

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { eventId } = gate  // remplace access.event_id partout dans la suite
```

> **Note :** remplacer aussi toutes les occurrences de `access.event_id` par `eventId` dans la suite du handler.

---

- [ ] **Step 5.1 : Migrer `app/api/client/event/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientAccess } from "@/lib/server/client"

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: event, error: ee } = await db
    .from("events")
    .select("*")
    .eq("id", gate.eventId)
    .single()

  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  return NextResponse.json({ event })
}
```

- [ ] **Step 5.2 : Migrer `app/api/client/guests/route.ts`**

```ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireClientAccess } from "@/lib/server/client"

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const gate = await requireClientAccess(token)
  if (!gate.ok) return gate.response

  const db = supabaseAdmin()
  const { data: guests, error } = await db
    .from("guests")
    .select("*")
    .eq("event_id", gate.eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guests })
}
```

- [ ] **Step 5.3 : Migrer les 6 routes restantes**

Appliquer le même pattern (voir ci-dessus) aux fichiers suivants. Pour chacun :
1. Retirer l'import `z` et la const `Query` si plus utilisés dans le fichier
2. Ajouter l'import `requireClientAccess`
3. Remplacer le bloc de validation par les 3 lignes du pattern
4. Remplacer `access.event_id` par `gate.eventId`

Fichiers :
- `app/api/client/tasks/route.ts`
- `app/api/client/tasks/[taskId]/comments/route.ts`
- `app/api/client/tasks/[taskId]/validate/route.ts`
- `app/api/client/appointments/route.ts`
- `app/api/client/changes/route.ts`
- `app/api/client/guest-change/route.ts`

- [ ] **Step 5.4 : Vérifier le build TypeScript**

```bash
cd /Users/A.BEYE/KPLAN/kplan
npx tsc --noEmit
```

Attendu : aucune erreur

- [ ] **Step 5.5 : Lancer la suite complète de tests**

```bash
npm test
```

Attendu : tous les tests `PASS`

- [ ] **Step 5.6 : Vérifier le build Next.js**

```bash
npm run build
```

Attendu : build réussi, aucune erreur TypeScript

- [ ] **Step 5.7 : Commit final**

```bash
cd /Users/A.BEYE
git add KPLAN/kplan/app/api/client/
git commit -m "refactor: centralize client token validation via requireClientAccess()

- Removes ~70 lines of duplicated validation across 8 routes
- All client routes now delegate auth to lib/server/client.ts"
```

---

## Vérification finale

- [ ] `npm test` — tous les tests passent
- [ ] `npx tsc --noEmit` — zéro erreur TypeScript
- [ ] `npm run build` — build Next.js propre
- [ ] Tester manuellement en dev : scanner un QR valide, puis dépasser 30 scans/min (simuler avec curl)
- [ ] Tester un token expiré : créer un token avec `expires_at` dans le passé, vérifier `401 Token expired`
