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
