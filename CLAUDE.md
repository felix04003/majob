# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This is a home directory (`/Users/A.BEYE`) tracked as a git repository. It contains several independent projects coexisting at the top level. Work on each project within its own subdirectory.

---

## Projects Overview

### 1. `majob_complet_site/` — AI Job Matching Platform

A recruitment platform connecting employers and job seekers via AI matching.

- **Frontend**: Next.js / React (TypeScript) in `frontend/`
- **Backend**: FastAPI (Python) in `backend/`
- **Deployment**: Render (`render.yaml`) for backend, Vercel (`vercel.json`) for frontend

**Backend commands:**
```bash
cd majob_complet_site
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 10000 --reload
```

---

### 2. `KPLAN/kplan/` — Event Planning App

Next.js + Supabase app for event planning (planners, guests, invitations).

**Git root :** `/Users/A.BEYE` (home dir) — pas `KPLAN/kplan/`. Le hook pre-commit est dans `/Users/A.BEYE/.git/hooks/`, configuré pour utiliser `KPLAN/kplan/.pre-commit-config.yaml`.

**Statut :** Développement local uniquement. Pas encore de repo GitHub KPLAN. Déploiement prévu sur **Vercel**. Voir `KPLAN/kplan/docs/deployment-checklist.md` avant le premier push.

**Stack**: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase, Zod, QR codes

**Commands:**
```bash
cd KPLAN/kplan
npm install
npm run dev      # development server
npm run build    # production build
npm run lint     # ESLint
```

**Environment (`.env.local`):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-side only, never expose to client
```

**Architecture implémentée (14 tables Supabase, 5 route groups) :**
```
app/
  (public)/         # landing page
  (auth)/login/     # authentication
  (planner)/        # dashboard, events, requests, dayof
  (client)/c/       # client portal via token
  (invite)/i/ p/    # guest invitation flow
lib/
  supabase/browser.ts   # client-side Supabase
  supabase/admin.ts     # server-side Supabase (service role)
  tokens.ts
  workflow/
sql/
  schema.sql
  rls.md
docs/
  deployment-checklist.md   # checklist avant prod
  superpowers/specs/        # design docs
  superpowers/plans/        # implementation plans
```

**Sécurité :** gitleaks v8.21.2 actif via pre-commit. Tout commit est scanné automatiquement. `.env*` gitignorés. Voir `KPLAN/kplan/.pre-commit-config.yaml` et `.gitleaks.toml`.

**Audit 2026-03-11 — Blockers restants avant prod :**
- Rate limiting sur `/api/scan` (QR scan jour-J, pas de limite actuelle)
- Pagination sur `/api/planner/events` et autres list endpoints (pas de limit/offset)
- Expiration `client_token` (champ `expires_at` existe mais non enforced)
- Tests d'intégration manquants pour workflows critiques
- RLS policies Supabase prévues en V2 (tout passe par server-side API actuellement)

---

### 3. `bot_trading.py` / `bot_alert_trading/` / `solana-trading-bot/` — Solana Trading Bots

Python bots that monitor Solana tokens and automate trades via Telegram commands.

- Data sources: DexScreener API, TweetScout API
- ML analysis: XGBoost classifier on price/volume/sentiment features
- Trade execution: Telegram commands sent to GMGN bot

**Required environment variables (`.env`):**
```
BOT_TOKEN=
GMGN_CHAT_ID=
TWEETSCOUT_API= # gitleaks:allow
ANTI_SPAM_DELAY=30
```

**Setup (use the appropriate venv per project):**
```bash
# bot_alert_trading
cd bot_alert_trading
source venv_solana_bot/bin/activate
pip install python-telegram-bot pandas scikit-learn xgboost python-dotenv requests

# root-level bot
source .venv/bin/activate
python bot_trading.py
```

**Deployment (Docker, root-level Solana bot):**
```bash
bash deploy_solana.sh   # requires .env.production
```

---

### 4. Root `package.json` — Node.js Scripts

Root-level Node.js package with dependencies for LangChain, Solana, Firebase, Mongoose.

```bash
npm install
```

Key dependencies: `@langchain/community`, `@langchain/openai`, `@solana/web3.js`, `firebase`, `mongoose`, `resend`

---

## Key Architecture Notes

- **`configuration.py`** (root and `bot_alert_trading/`): Defines a `Configuration` class with priority-ordered overrides. The `OVERRIDE_ORDER` list controls which config layer takes precedence.
- **Trading bot flow**: fetch tokens → `analyze_with_ai()` (XGBoost) → `automate_trades()` → send Telegram commands → wait for anti-spam delay.
- **KPLAN Supabase access**: `SUPABASE_SERVICE_ROLE_KEY` must only be used in Server Actions / Route Handlers, never in client components.
- **`bot.log`** (root): Running log file for the trading bot, written via Python `logging` module.
