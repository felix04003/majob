# CLAUDE.md — Kplan

> Ce fichier est la mémoire du projet. Lis-le en entier au début de chaque session.

---

## 🎯 C'est quoi Kplan ?

**Kplan** est un outil de gestion d'événements (mariages, soirées, galas) conçu pour les **wedding planners et organisateurs d'événements professionnels**.

Il y a **4 types d'utilisateurs** :

| Rôle | Accès | Description |
|------|-------|-------------|
| **Planner** | `/dashboard`, `/events`, `/dayof` | L'organisateur. Gère tout : événements, invités, tâches, RDV, clients |
| **Client** | `/client/[eventId]/` | Le marié / commanditaire. Voit ses tâches, valide, consulte ses invités et RDV |
| **Invité** | `/i/[inviteToken]` | Reçoit une invitation, fait son RSVP |
| **Jour J** | `/dayof/[eventId]` | Scan QR à l'entrée le jour de l'événement |

---

## 📦 Ce qui a été construit (historique complet)

### Phase 1 — Base (session initiale)
- App Next.js 16 App Router + Supabase Auth + TypeScript
- Authentification planner (email/password Supabase)
- Gestion des événements (CRUD)
- Gestion des invités avec workflow de validation :
  - Les clients soumettent des demandes dans `guest_changes` (jamais directement dans `guests`)
  - Le planner approuve ou refuse sous 4h
- RSVP invités via lien unique (`/i/[inviteToken]`)
- Pass QR invité (`/p/[inviteToken]`)
- Scan QR le jour J (`/dayof`)

### Phase 2 — Assistant Planner (sessions intermédiaires)
- **Tâches** : jalons + tâches avec priorités, statuts, barre de progression
- **Tâches avec validation client** : le planner peut marquer une tâche "nécessite validation client"
- **Commentaires** sur les tâches (planner ↔ client)
- **Rendez-vous** (appointments) : CRUD + calendrier, types (prestataire, client, interne)
- **Notifications** : le planner reçoit des alertes quand un client commente/valide
- **Emails** via Resend (optionnel) — notifie le planner des actions client

### Phase 3 — Auth client email/password (session 2026-03-14)
**Avant :** les clients accédaient via un token URL (`/c/[clientToken]/`)
**Après :** les clients ont un vrai compte Supabase

- Migration DB : `client_access` passe de `client_token`/`expires_at` → `user_id`/`email`/`is_revoked`/`invited_at`
- Index unique partiel : `unique where user_id is not null`
- Nouveau helper `requireClientSession(eventId)` dans `lib/server/client.ts`
- Middleware protège `/client/*` → redirige vers `/client/login?next=<path>`
- Pages client : login, forgot-password, reset-password, set-password
- Dashboard client (`/client/`) : liste des événements accessibles
- API client session-based : `/api/client/[eventId]/*` (8 routes)
- API planner : invite via `inviteUserByEmail` + révocation (`is_revoked: true`)
- Onglet "Comptes clients" dans la fiche événement planner

### Phase 4 — Design Liquid Glass (session 2026-03-14)
Refonte visuelle complète du site :

- **Fond** : deep space gradient (`#080810` → `#0f0f1f`)
- **3 orbs ambiants** animés en CSS (`float1`, `float2`, `float3`)
- **Accent** : or `#C9A96E`
- **Typographie** : Dancing Script (alias `--font-dancing`) pour les titres
- **Composants** dans `components/ui/` :
  - `GlassCard` — 5 variants (default/strong/subtle/gold/danger), backdrop-blur 24px
  - `KplanButton` — gold/glass/ghost-gold/danger, minHeight 44px (Apple HIG), forwardRef
  - `StatusBadge` — active/jour-j/completed/pending/cancelled
  - `SkeletonGlass` — loading states
  - `gallery.tsx` — PhotoGallery avec Framer Motion (drag + fan animation)
- **Pages redessinées** : landing, login (tab switcher Planner/Client), navbar, dashboard, events

---

## 🗂️ Structure des fichiers clés

```
app/
  (auth)/login/           → Login planner (tab switcher verre)
  (planner)/
    dashboard/            → KPI cards, stats
    events/[eventId]/     → Fiche événement (tâches, invités, RDV, comptes clients)
    dayof/[eventId]/      → Scan QR jour J
    appointments/         → Liste RDV planner
    notifications/        → Alertes planner
  (public)/page.tsx       → Landing page
  (invite)/i/[token]/     → Page RSVP invité
  (invite)/p/[token]/     → Pass QR invité
  client/
    page.tsx              → Dashboard client (liste événements)
    login/                → Login client
    forgot-password/      → Reset password client
    reset-password/       → Échange code pour session
    set-password/         → Définit le mot de passe après invite
    [eventId]/tasks/      → Tâches client
    [eventId]/guests/     → Invités client
    [eventId]/appointments/ → RDV client (lecture seule)
  api/
    client/[eventId]/     → 8 routes API (session-based)
    planner/events/[id]/client-accounts/ → Invite + révoke clients

components/ui/
  glass-card.tsx          → GlassCard
  kplan-button.tsx        → KplanButton
  status-badge.tsx        → StatusBadge
  skeleton-glass.tsx      → SkeletonGlass
  gallery.tsx             → PhotoGallery

lib/server/
  client.ts               → requireClientSession(eventId)
  supabase.ts             → createServerClient()

sql/
  schema.sql              → Schéma complet (source de vérité)
  migrations/             → Migrations numérotées (007 = auth client)
```

---

## 🔐 Auth & Sécurité

### Planner
- Supabase Auth email/password
- `KPLAN_ADMIN_EMAIL` optionnel : restreint l'accès à un seul email
- Session via cookies SSR (`@supabase/ssr`)

### Client
- Supabase Auth email/password (invite via `inviteUserByEmail`)
- `requireClientSession(eventId)` vérifie : session valide + row dans `client_access` + non révoqué
- `PGRST116` = "no rows found" → **403** (pas 500)
- `is_revoked: true` → **403**
- Pas de session → **401** → middleware redirige vers `/client/login`

### Invité
- Token URL unique dans la table `invitations`
- Pas d'authentification Supabase

---

## 🗄️ Base de données — Tables principales

| Table | Rôle |
|-------|------|
| `events` | Événements (titre, date, status) |
| `guests` | Invités (lecture seule pour clients) |
| `guest_changes` | Demandes de modification des invités (pending → approved/rejected) |
| `invitations` | Liens RSVP uniques par invité |
| `qr_passes` | Tokens QR pour le scan jour J |
| `checkins` | Scans effectués |
| `client_access` | Accès client (user_id, email, is_revoked, invited_at) |
| `tasks` | Tâches (avec jalons, priorités, statuts) |
| `task_comments` | Commentaires planner ↔ client |
| `task_validations` | Validation/refus des tâches par le client |
| `appointments` | Rendez-vous |
| `milestones` | Jalons |
| `notifications` | Alertes planner |

**Règle critique :** les clients ne modifient **jamais** `guests` directement. Tout passe par `guest_changes`.

---

## ⚙️ Commandes essentielles

```bash
npm run dev              # Lancer le dev server (port 3000)
npm test                 # Vitest — doit passer 0 échecs (47 tests)
npm run migrate          # Appliquer les migrations SQL
npm run migrate:status   # Voir quelles migrations sont appliquées
npm run check-env        # Vérifier les variables d'env
npm run build            # Build production
```

---

## 🎨 Design System — Règles

### Tailwind v4
- **Pas** de `tailwind.config.ts`
- Config dans `app/globals.css` : `@import "tailwindcss"` + `@theme inline {}`
- Tokens : `--color-kplan-gold: #C9A96E`, `--font-dancing: var(--font-handwriting)`

### Composants UI
- Toujours utiliser `GlassCard` pour les conteneurs principaux
- Toujours utiliser `KplanButton` pour les actions (pas `<button>` brut)
- `minHeight: 44` sur tous les boutons (Apple HIG touch target)
- `prefers-reduced-motion` : toutes les animations doivent respecter cette media query

### Images externes (next/image)
- Déjà configuré dans `next.config.ts` : `images.pexels.com`, `images.unsplash.com`
- Ajouter tout nouveau hostname dans `next.config.ts` sous `images.remotePatterns`

---

## 🐛 Gotchas connus

| Problème | Solution |
|----------|----------|
| `type: "spring"` TypeScript error Framer Motion | Caster : `"spring" as const` |
| `PGRST116` retourne 500 par défaut | Intercepter et retourner 403 |
| `schema.sql` désynchronisé avec migrations | Toujours mettre à jour `schema.sql` après chaque migration |
| `unique(user_id, event_id)` bloque les NULLs | Utiliser `create unique index ... where user_id is not null` |
| `next/image` hostname non configuré | Ajouter dans `next.config.ts` > `remotePatterns` |
| Pre-commit hook gitleaks | `pip install pre-commit && pre-commit install` — ne jamais `--no-verify` |
| Tests routes supprimées | Supprimer les fichiers de test correspondants |

---

## 📝 Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=           # URL de ton projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Clé publique Supabase
SUPABASE_SERVICE_ROLE_KEY=          # Clé service (server-only, jamais dans le client)
KPLAN_ADMIN_EMAIL=                  # (optionnel) restreint l'accès planner
RESEND_API_KEY=                     # (optionnel) pour les emails de notification
KPLAN_FROM_EMAIL=                   # (optionnel) ex: Kplan <noreply@tondomaine.com>
```

---

## 🚀 État actuel du projet (mars 2026)

✅ Auth planner (Supabase)
✅ Auth client email/password (Supabase invite flow)
✅ CRUD événements
✅ Gestion invités + workflow guest_changes
✅ RSVP invités + pass QR
✅ Scan QR jour J
✅ Tâches + jalons + barre de progression
✅ Validation tâches par client
✅ Commentaires tâches
✅ Rendez-vous (CRUD)
✅ Notifications planner
✅ Emails (Resend, optionnel)
✅ Design Liquid Glass complet
✅ Landing page
✅ 47 tests Vitest passants

⏳ À venir / en réflexion :
- Refonte palette couleur landing page (or vs blush vs sage vs ardoise)
- Intégration composants galerie étendue (ExpandableGallery, 3D Marquee)
- Menu bottom mobile (BottomMenu)
- "Let's Work Together" section de contact

---

## 🌿 Branches Git

- `main` — branche principale
- `feat/client-auth-liquid-glass` — PR ouverte : auth client + design Liquid Glass (22 commits)
