# Credential Security Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sécuriser les credentials du projet KPLAN avant le premier push GitHub et le déploiement Vercel.

**Architecture:** Nettoyage de `env.example`, renforcement du `.gitignore`, installation d'un pre-commit hook gitleaks pour scanner chaque commit, et création d'une checklist de déploiement.

**Tech Stack:** gitleaks v8.21.2, pre-commit framework (Python), Next.js/Vercel

**Spec:** `docs/superpowers/specs/2026-03-11-credential-security-design.md`

---

## Chunk 1: Fichiers de configuration statique

### Task 1: Nettoyer env.example

**Files:**
- Modify: `env.example`

- [ ] **Step 1: Lire le fichier actuel**

```bash
cat kplan/env.example
```

Valeur actuelle à problème : `KPLAN_ADMIN_EMAIL=ablaye1107@gmail.com`

- [ ] **Step 2: Remplacer l'email réel par un placeholder**

Dans `kplan/env.example`, changer la ligne :
```
KPLAN_ADMIN_EMAIL=ablaye1107@gmail.com
```
par :
```
KPLAN_ADMIN_EMAIL=you@example.com
```

- [ ] **Step 3: Vérifier la présence et la validité des variables Sentry**

Les quatre variables Sentry (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) sont déjà présentes dans le fichier actuel avec des placeholders. Confirmer qu'elles sont bien là et qu'aucune n'a été remplacée par une vraie valeur.

Ensuite, inspecter visuellement l'ensemble du fichier : aucune valeur ne doit ressembler à une clé réelle (ex: `eyJ...`, `re_...`, `sntrys_...`, un email personnel). Tous les champs doivent avoir des placeholders génériques.

- [ ] **Step 4: Commit**

```bash
cd kplan
git add env.example
git commit -m "security: remove real email from env.example"
```

---

### Task 2: Renforcer le .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Lire le .gitignore actuel**

```bash
cat kplan/.gitignore
```

La règle `.env*` est déjà présente — c'est la principale protection. On va ajouter des variants supplémentaires et des patterns d'éditeur.

Note : `env.example` (sans point de début) ne correspond PAS à `.env*`, il sera donc toujours tracké par git. Aucune règle d'exception `!env.example` n'est nécessaire.

- [ ] **Step 2: Ajouter les patterns manquants**

Ajouter à la fin de `kplan/.gitignore` :

```gitignore
# Env variants explicites (couverts par .env* mais lisibles)
.env.production
.env.production.local
.env.staging
.env.staging.local
.env.test.local

# Editor backups et fichiers temporaires
*.orig
*.bak
*~

# Secrets exportés manuellement
secrets.json
secrets.yaml
secrets.yml
```

- [ ] **Step 3: Vérifier que .env.local est bien ignoré**

```bash
cd kplan
git check-ignore -v .env.local
```

Sortie attendue :
```
.gitignore:34:.env*    .env.local
```

- [ ] **Step 4: Vérifier que env.example n'est PAS ignoré (il doit être tracké)**

```bash
cd kplan
git check-ignore -v env.example
```

Sortie attendue : aucune sortie (le fichier n'est pas ignoré).

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "security: strengthen .gitignore with additional env and backup patterns"
```

---

## Chunk 2: Pre-commit hook gitleaks

### Task 3: Installer pre-commit et gitleaks

**Files:**
- Create: `kplan/.pre-commit-config.yaml`
- Create: `kplan/.gitleaks.toml`

- [ ] **Step 1: Vérifier que pre-commit est installé**

```bash
pre-commit --version
```

Si la commande échoue, l'installer :
```bash
pip install pre-commit
# ou avec brew sur macOS :
brew install pre-commit
```

- [ ] **Step 2: Vérifier que gitleaks est installé (optionnel, pre-commit le télécharge)**

```bash
gitleaks version
```

Si absent, ne pas bloquer — pre-commit télécharge automatiquement gitleaks lors du premier run.

- [ ] **Step 3: Créer .pre-commit-config.yaml**

Créer `kplan/.pre-commit-config.yaml` :

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks
```

- [ ] **Step 4: Créer .gitleaks.toml pour whitelister les faux positifs**

Ce fichier est optionnel selon la spec, mais on le crée proactivement pour éviter les faux positifs sur `env.example` (qui contient des patterns de clés comme `eyJ...` en commentaire ou placeholder).

Syntaxe correcte pour gitleaks v8 (utiliser `[allowlist]` au singulier) :

Créer `kplan/.gitleaks.toml` :

```toml
title = "KPLAN gitleaks config"

[allowlist]
description = "Ignore placeholder values in env.example and test fixtures"
paths = [
  '''env\.example''',
  '''tests/''',
  '''__tests__/''',
]
```

- [ ] **Step 5: Installer le hook dans le repo git local**

```bash
cd kplan
pre-commit install
```

Sortie attendue :
```
pre-commit installed at .git/hooks/pre-commit
```

- [ ] **Step 6: Lancer un scan sur tout le codebase existant**

```bash
cd kplan
pre-commit run --all-files
```

Sortie attendue : `gitleaks....Passed` (ou warnings gérables). Si des secrets réels sont détectés, les corriger avant de continuer.

- [ ] **Step 7a: Créer et stager le fichier de test**

```bash
cd kplan
echo 'SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test' > test-secret-DO-NOT-COMMIT.txt # gitleaks:allow
git add test-secret-DO-NOT-COMMIT.txt
```

- [ ] **Step 7b: Tenter un commit et vérifier que gitleaks le bloque**

```bash
git commit -m "test: should be blocked by gitleaks"
```

Sortie attendue : le commit est **bloqué** avec un message du type `gitleaks: Secret detected`. Si le commit passe sans blocage, passer à l'étape de diagnostic ci-dessous avant de continuer.

**Diagnostic si le hook ne bloque pas :**
```bash
# Vérifier que le hook est bien installé
cat .git/hooks/pre-commit

# Vérifier que le fichier .pre-commit-config.yaml est valide
pre-commit validate-config .pre-commit-config.yaml

# Relancer l'installation si nécessaire
pre-commit install
```

- [ ] **Step 7c: Nettoyer le fichier de test**

```bash
cd kplan
git restore --staged test-secret-DO-NOT-COMMIT.txt
rm test-secret-DO-NOT-COMMIT.txt
```

- [ ] **Step 8: Commit les fichiers de configuration**

```bash
cd kplan
git add .pre-commit-config.yaml .gitleaks.toml
git commit -m "security: add gitleaks pre-commit hook to prevent secret commits"
```

---

## Chunk 3: Documentation de déploiement

### Task 4: Mettre à jour le README avec les instructions de setup développeur

**Files:**
- Modify: `README.md`

La spec indique que les instructions d'installation de gitleaks doivent être documentées dans le README.

- [ ] **Step 1: Lire le README existant**

```bash
cat kplan/README.md
```

- [ ] **Step 2: Ajouter une section "Developer Setup"**

Ajouter la section suivante dans `kplan/README.md`, après la section d'installation initiale (juste avant ou après la section "Environment") :

```markdown
## Developer Setup

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
```

- [ ] **Step 3: Commit**

```bash
cd kplan
git add README.md
git commit -m "docs: add developer setup instructions for pre-commit/gitleaks"
```

---

### Task 5: Créer la checklist de déploiement

**Files:**
- Create: `docs/deployment-checklist.md`

- [ ] **Step 1: Créer le dossier docs si absent**

```bash
mkdir -p kplan/docs
```

- [ ] **Step 2: Créer docs/deployment-checklist.md**

Créer `kplan/docs/deployment-checklist.md` :

```markdown
# Checklist de Déploiement KPLAN

À compléter **dans l'ordre** avant et pendant le premier déploiement en production.

---

## Avant le premier `git push`

- [ ] `pre-commit` est installé localement (`pre-commit --version`)
- [ ] Le hook est actif dans le repo (`cat .git/hooks/pre-commit` doit exister)
- [ ] `pre-commit run --all-files` passe sans erreur
- [ ] `git check-ignore -v .env.local` confirme que le fichier est ignoré
- [ ] `env.example` ne contient aucune valeur réelle (clés, tokens, emails perso)
- [ ] Lancer `git log --all -- "*.env*"` — aucune ligne dans les résultats

## Création du repo GitHub

- [ ] Créer le repo en **PRIVÉ** (jamais public pour un projet contenant des tokens)
- [ ] Activer **Secret scanning** : Settings → Security → Code security → Secret scanning → Enable
- [ ] Activer **Push protection** : Settings → Security → Code security → Push protection → Enable
- [ ] Configurer branch protection sur `main` :
  - Require a pull request before merging
  - Require at least 1 approval
  - Require status checks to pass

## Configuration Vercel

- [ ] Créer le projet Vercel et le connecter au repo GitHub
- [ ] Dans Vercel → Settings → Environment Variables, ajouter **toutes** les variables de `env.example` :
  - `NEXT_PUBLIC_SUPABASE_URL` → tous les environnements
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → tous les environnements
  - `SUPABASE_SERVICE_ROLE_KEY` → Production uniquement (jamais Preview)
  - `RESEND_API_KEY` → Production uniquement
  - `KPLAN_FROM_EMAIL` → Production uniquement
  - `KPLAN_ADMIN_EMAIL` → tous les environnements
  - `NEXT_PUBLIC_SENTRY_DSN` → tous les environnements (si Sentry utilisé)
  - `SENTRY_AUTH_TOKEN` → Production uniquement (build-time)
  - `SENTRY_ORG` → Production uniquement
  - `SENTRY_PROJECT` → Production uniquement
- [ ] **Ne jamais** préfixer `SUPABASE_SERVICE_ROLE_KEY` avec `NEXT_PUBLIC_`
- [ ] Faire un premier build Vercel et vérifier que `lib/env.ts` ne lève pas d'erreur

## Rotation des clés (recommandé avant la première mise en prod)

- [ ] **Supabase** : Project Settings → API → "Reset" le service role key → mettre à jour `.env.local` et Vercel
- [ ] **Resend** : API Keys → créer une nouvelle clé avec un nom explicite (`kplan-production`) → supprimer l'ancienne → mettre à jour `.env.local` et Vercel
- [ ] **Sentry** (si utilisé) : vérifier que le DSN de prod est distinct du DSN de dev

## Post-déploiement

- [ ] Vérifier que l'app fonctionne en production (login, création événement, envoi email)
- [ ] Vérifier que les logs Sentry remontent correctement
- [ ] Vérifier que les variables d'environnement Preview sont différentes de Production (clés distinctes recommandées)
```

- [ ] **Step 3: Commit**

```bash
cd kplan
git add docs/deployment-checklist.md
git commit -m "docs: add pre-deployment security checklist"
```

---

## Vérification finale

- [ ] **Lancer un scan gitleaks sur tout le repo une dernière fois**

```bash
cd kplan
pre-commit run --all-files
```

Sortie attendue : tous les hooks passent.

- [ ] **Vérifier l'historique git**

```bash
cd kplan
git log --oneline
```

Sortie attendue : 5 commits liés à ce plan, dans l'ordre :
1. `security: remove real email from env.example`
2. `security: strengthen .gitignore with additional env and backup patterns`
3. `security: add gitleaks pre-commit hook to prevent secret commits`
4. `docs: add developer setup instructions for pre-commit/gitleaks`
5. `docs: add pre-deployment security checklist`

- [ ] **Vérifier que .env.local n'est pas dans git**

```bash
git ls-files .env.local
```

Sortie attendue : aucune sortie (fichier non tracké).
