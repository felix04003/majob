## Kplan (Next.js App Router + Supabase)

Modules:
- **Planner** (admin)
- **Client** (éditeur invités via workflow de validation)
- **Invité** (RSVP + QR)
- **Jour J** (scan QR)

Règle clé: le client **ne modifie jamais** directement la table `guests`. Il soumet des demandes dans `guest_changes` (pending) que le planner valide sous 4h.

### Variables d’environnement

Créer un `.env.local` (modèle dans `env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
KPLAN_ADMIN_EMAIL=ablaye1107@gmail.com
```

- `SUPABASE_SERVICE_ROLE_KEY`: **server-only** (Route Handlers).
- `KPLAN_ADMIN_EMAIL` (optionnel): si défini, **seul cet email** Supabase Auth peut accéder aux endpoints planner.

### Developer Setup

After cloning the repo, install the pre-commit hooks to enable automatic secret scanning on every commit:

```bash
# Install pre-commit (once, globally)
pip install pre-commit
# or on macOS:
brew install pre-commit

# Install hooks in this repo
cd kplan
pre-commit install
```

From now on, every `git commit` will automatically run gitleaks to prevent accidental secret commits.

### Base de données

- SQL: `sql/schema.sql`
- Note RLS: `sql/rls.md`

### Dev

```bash
npm run dev
```

### Endpoints (v1)

- Client:
  - `GET /api/client/event?token=...`
  - `GET /api/client/guests?token=...`
  - `GET /api/client/changes?token=...`
  - `POST /api/client/guest-change` `{ clientToken, action, guestId?, payload? }`
- Planner (protégés via `Authorization: Bearer <KPLAN_PLANNER_API_KEY>`):
- Planner (protégés par session Supabase Auth + cookies):
  - `GET /api/planner/requests`
  - `POST /api/planner/requests/:id/approve`
  - `POST /api/planner/requests/:id/reject` `{ comment }`
  - `POST /api/planner/seed` `{ title?, startAt?, guestsCount? }` (outil démo)
- Public:
  - `POST /api/rsvp` `{ inviteToken, rsvp }`
  - `POST /api/scan` `{ qrToken }`
  - `GET /api/invite?token=...` (données invitation + rsvp + qr)

### Pages (v1)

- `/` accueil
- `/login` connexion planner (Supabase Auth)
- `/dashboard` planner
- `/requests` demandes (UI à brancher)
- `/dayof` scan (caméra + fallback manuel)
- `/c/[clientToken]/guests` client (officiel + demandes)
- `/i/[inviteToken]` invité (RSVP)
- `/p/[inviteToken]` pass invité (QR)

### Flux de test (recommandé)

1) Connecte-toi en planner sur `/login`
2) Va sur `/dashboard` → **Setup rapide (démo)** → crée un event de démo
3) Ouvre le lien “côté client”, crée une demande (ajout invité)
4) Reviens sur `/requests` pour approuver/refuser
5) Va sur `/dayof` et scanne un QR (ou colle un `qrToken` d’exemple)
