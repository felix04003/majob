## RLS (v1) — stratégie safe et simple

### Principe

- **Planner (admin)**: accès via Supabase Auth (pages `(planner)`), avec des policies RLS strictes.
- **Client / Invité / Jour J**: **aucun accès direct** aux tables via clé anon; tout passe par les **Route Handlers** côté serveur, qui utilisent la **service role key** après **vérification de tokens**.

Cette approche évite d’exposer des policies “public read/write” trop larges.

### Recommandations

- Activer RLS sur toutes les tables.
- Pour V1, tu peux laisser les policies “admin-only” (via Supabase Auth) et garder les opérations publiques via API server:
  - `client_access` + `invite_token` + `qr_token` sont des secrets. Ils doivent être:
    - générés aléatoirement (32 bytes base64url),
    - transmis via liens dédiés,
    - vérifiés côté serveur.
- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` côté client.

### TODO (V2)

- Remplacer la garde `KPLAN_PLANNER_API_KEY` par une vraie auth planner (Supabase Auth + cookie session + RLS).
- Ajouter éventuellement un `scanner_access` par event si tu veux protéger davantage `/api/scan`.


