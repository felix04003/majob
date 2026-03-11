# Credential Security — Design Spec

**Date:** 2026-03-11
**Statut:** Approuvé
**Scope:** Sécurisation proactive avant premier push GitHub + déploiement Vercel

---

## Contexte

- Projet KPLAN en développement local uniquement (pas encore de repo GitHub)
- `.env.local` jamais commité (protégé par `.gitignore` via règle `.env*`)
- Déploiement Vercel prévu dès que le projet est prêt
- Risque actuel : nul côté git. Risque futur : fuite accidentelle au moment du premier push

## Objectif

Mettre en place des garde-fous avant que le code parte sur GitHub, et préparer un déploiement Vercel propre.

---

## Livrables

### 1. `env.example` nettoyé

**Fichier :** `kplan/env.example`

**Changements :**
- Remplacer `KPLAN_ADMIN_EMAIL=ablaye1107@gmail.com` par `KPLAN_ADMIN_EMAIL=you@example.com`
- Ajouter les variables Sentry manquantes avec placeholders corrects (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)
- S'assurer qu'aucune vraie valeur n'est présente dans ce fichier

### 2. Pre-commit hook avec gitleaks

**Fichier :** `kplan/.pre-commit-config.yaml`

Utilise [gitleaks](https://github.com/gitleaks/gitleaks) via le framework `pre-commit` pour scanner chaque commit local avant qu'il parte dans l'historique git.

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks
```

**Fichier :** `kplan/.gitleaks.toml` (optionnel, pour whitelister des faux positifs)

**Instructions d'installation :** documentées dans le README et la checklist.

### 3. `.gitignore` renforcé

**Fichier :** `kplan/.gitignore`

Ajouts :
```
# Env variants
.env.production
.env.production.local
.env.staging
.env.staging.local
.env.test.local

# Editor backups
*.orig
*.bak
*~
```

### 4. Checklist pré-déploiement

**Fichier :** `kplan/docs/deployment-checklist.md`

Checklist en markdown couvrant :

**Avant le premier `git push` :**
- [ ] Installer pre-commit + gitleaks localement
- [ ] Lancer `pre-commit run --all-files` une fois pour valider
- [ ] Vérifier que `.env.local` n'apparaît pas dans `git status`
- [ ] Vérifier `env.example` ne contient aucune vraie valeur
- [ ] Créer le repo GitHub en **privé**

**Configuration GitHub :**
- [ ] Activer "Secret scanning" dans Settings → Security → Code security
- [ ] Activer "Push protection" pour bloquer les pushes avec secrets
- [ ] Ajouter branch protection sur `main` (require PR, require review)

**Configuration Vercel :**
- [ ] Ajouter toutes les variables de `env.example` dans Vercel → Settings → Environment Variables
- [ ] Séparer les valeurs par environnement (Production / Preview / Development)
- [ ] Ne jamais coller `SUPABASE_SERVICE_ROLE_KEY` dans une variable `NEXT_PUBLIC_*`
- [ ] Vérifier que le build passe avec les env vars Vercel (pas de `.env.local`)

**Rotation des clés (recommandé avant la première mise en prod) :**
- [ ] Supabase → Project Settings → API → Reset service role key
- [ ] Resend → API Keys → Créer une nouvelle clé, supprimer l'ancienne
- [ ] Mettre à jour `.env.local` et Vercel avec les nouvelles clés

---

## Ce qui n'est PAS dans ce scope (V2)

- Secrets manager (Doppler, Infisical)
- Rotation automatisée des clés
- CI/CD GitHub Actions avec secrets
- Environnement staging séparé

---

## Critères de succès

- `git log --all -- "*.env*"` ne retourne aucun résultat dans le repo KPLAN
- `pre-commit run --all-files` passe sans erreur sur le codebase actuel
- `env.example` ne contient aucune valeur réelle
- La checklist est complète et actionnée avant le premier déploiement
