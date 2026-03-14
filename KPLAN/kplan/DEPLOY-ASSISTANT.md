# Déployer le module Assistant Planner

Guide en 3 étapes : **SQL dans Supabase** → **Resend (emails)** → **Test du flow**. Checklist finale en bas.

---

## En résumé

1. **Exécuter le SQL dans Supabase** : ouvre le SQL Editor, copie-colle le contenu de `sql/assistant-planner-tables.sql`, clique **Run**. Les 6 tables sont créées d’un coup.
2. **Resend** : `npm install resend`, crée un compte sur resend.com, ajoute `RESEND_API_KEY` et `KPLAN_FROM_EMAIL` dans `.env.local`.
3. **Lancer et tester** : `npm run dev`, puis suivre le parcours de test ci‑dessous (créer un événement → tâches / RDV → portail client avec le token → commenter et valider → vérifier les notifications côté planner).

---

## Étape 1 — Créer les tables dans Supabase

1. Ouvre le **SQL Editor** de ton projet Supabase (Dashboard → SQL Editor → New query).
2. Ouvre dans Cursor le fichier **`sql/assistant-planner-tables.sql`**, sélectionne tout (Cmd+A), copie.
3. Colle dans l’éditeur Supabase et clique **Run**.
4. Vérifie le résultat : tu dois voir une liste de tables (les existantes + les 6 nouvelles).

Tables attendues après exécution :
- `appointments` (nouveau)
- `checkins`
- `client_access`
- `events`
- `guest_changes`
- `guests`
- `invitations`
- `milestones` (nouveau)
- `notifications` (nouveau)
- `qr_passes`
- `task_comments` (nouveau)
- `task_validations` (nouveau)
- `tasks` (nouveau)

---

## Étape 2 — Installer Resend (emails)

### 2a. Installer le package

```bash
cd kplan
npm install resend
```

### 2b. Créer un compte Resend

1. Va sur **https://resend.com/signup**
2. Crée un compte gratuit (100 emails/jour inclus)
3. Va dans **API Keys** → crée une nouvelle clé

### 2c. Configurer l'environnement

Ajoute ces lignes à ton `.env.local` :

```env
# Resend (emails)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
KPLAN_FROM_EMAIL=Kplan <noreply@tondomaine.com>
```

> **Note** : Si tu n'as pas de domaine vérifié dans Resend, tu peux utiliser leur adresse par défaut `onboarding@resend.dev` pour tester.

### 2d. Vérifier (optionnel)

Les emails sont envoyés quand :
- Un client commente une tâche → email au planner
- Un client valide ou refuse une tâche → email au planner

Si `RESEND_API_KEY` n'est pas configuré, les emails sont simplement ignorés (log en console). L'app fonctionne sans.

---

## Étape 3 — Tester le flow complet

### 3a. Lancer le dev server

```bash
npm run dev
```

### 3b. Test du planner

1. **Dashboard** → http://localhost:3000/dashboard
   - Vérifie que les nouvelles stats apparaissent (Tâches, Validations, RDV)
   - Vérifie les boutons "Rendez-vous" et "Notifications"

2. **Créer un événement** (ou utiliser le Seed Panel)
   - Note le `client_token` généré

3. **Rendez-vous** → http://localhost:3000/appointments
   - Crée un RDV (ex: "RDV traiteur", type Prestataire)
   - Vérifie qu'il apparaît dans le calendrier et la liste
   - Modifie-le, puis supprime-le

4. **Tâches** → va dans le détail d'un événement → onglet "Tâches"
   - Crée un jalon (ex: "Phase 1 — Préparation")
   - Crée une tâche simple (ex: "Réserver la salle", priorité Haute)
   - Crée une tâche avec `Nécessite la validation du client` cochée
   - Change le statut d'une tâche (À faire → En cours → Fait)
   - Vérifie que la barre de progression se met à jour
   - Ajoute un commentaire sur une tâche

5. **Notifications** → http://localhost:3000/notifications
   - Vérifie qu'une notification "Nouvelle tâche à valider" est apparue
   - Marque-la comme lue

### 3c. Test du portail client

1. **Tâches client** → http://localhost:3000/c/{CLIENT_TOKEN}/tasks
   - Vérifie la barre de progression
   - Vérifie la section "Actions requises" (tâches à valider)
   - Clique sur une tâche → ajoute un commentaire
   - Valide ou refuse une tâche (le refus nécessite un commentaire)

2. **RDV client** → http://localhost:3000/c/{CLIENT_TOKEN}/appointments
   - Vérifie que les RDV s'affichent en lecture seule

3. **Retour planner** — vérifie que :
   - Le commentaire client apparaît dans les commentaires de la tâche
   - La validation/refus est visible dans l'onglet Tâches
   - Une notification a été créée pour le planner

### 3d. Checklist finale

Coche au fur et à mesure :

- [ ] **SQL** : Tables créées dans Supabase (6 nouvelles : appointments, milestones, tasks, task_comments, task_validations, notifications)
- [ ] **App** : `npm run dev` lancé sans erreur
- [ ] **Dashboard** : Stats Assistant Planner visibles (Tâches, Validations, RDV)
- [ ] **Rendez-vous** : CRUD + calendrier sur `/events/[id]` ou page RDV
- [ ] **Tâches** : CRUD + jalons + barre de progression dans le détail événement
- [ ] **Portail client** (`/c/{clientToken}/tasks`) : tâches, commentaires, validation/refus
- [ ] **Portail client** : RDV en lecture seule
- [ ] **Notifications** : listées et marquables comme lues
- [ ] **Emails** (optionnel) : Resend configuré et emails reçus lors d’un commentaire ou validation client

---

**Rappel des 3 étapes** : (1) Exécuter le SQL dans Supabase → (2) `npm install resend` + variables dans `.env.local` → (3) `npm run dev` et parcours de test ci‑dessus.
