# Deployment Guide

This guide takes you from a fresh clone to a **fully functional deployment** on
**Supabase + Railway + Vercel**. No Doppler required — every backend image runs
directly on plain environment variables (Doppler is auto-used only if you set
`DOPPLER_TOKEN`).

For the full annotated list of every variable, see [`.env.example`](.env.example).
For architecture details, see the [README](README.md#deployment-topology).

---

## Architecture at a glance

| Component | Runs on | Required? | Build context → Dockerfile |
|-----------|---------|-----------|-----------------------------|
| **Frontend** (Next.js) | Vercel | ✅ Required | (Vercel auto-detects Next.js) |
| **Backend API** (FastAPI) | Railway | ✅ Required | root `backend/` → `Dockerfile` |
| **Queue Worker** (arq) | Railway | ✅ Required for live bot cycles | **repo root** → `worker/Dockerfile` |
| **Postgres + Auth** | Supabase | ✅ Required | — |
| **Redis** (job queue) | Railway plugin / Upstash | ✅ Required for the worker | — |
| **Wiki Scheduler** | Railway | ⬜ Optional (trade-intelligence pipeline) | root `backend/` → `wiki-worker.Dockerfile` |
| **Twitter/X Poster** | Railway | ⬜ Optional (auto-tweets trades) | root `backend/` → `twitter_poster/Dockerfile` |

> **Minimal viable deploy** = Frontend + Backend API + Worker + Redis + Supabase.
> That gets you a working app where you can sign up, connect exchange keys, and
> run bots. The Wiki and Twitter services are optional extras.

> ⚠️ **Build-context gotcha (important):** the **Worker** builds from the **repository
> root** (it copies `bots/` and `backend/`), while the **API / Wiki / Twitter**
> images build from the **`backend/` directory**. Set each Railway service's *Root
> Directory* accordingly (tables below), or the Docker build will fail to find files.

---

## Prerequisites

**Accounts:** [Supabase](https://supabase.com), [Railway](https://railway.app), [Vercel](https://vercel.com).

**API keys you'll need (entered later in the app UI, not at deploy time):**
- [OpenRouter](https://openrouter.ai) API key — powers Council V2 / Superforecaster analysis + Perplexity research.
- Exchange credentials, depending on what you want to trade:
  - **Kalshi**: API key ID + RSA private key ([Kalshi API docs](https://trading-api.readme.io/)). Start in **demo**.
  - **Polymarket**: an EVM wallet private key + funder address ([Polymarket docs](https://docs.polymarket.com/)).

> You can deploy and explore the whole app in **training/demo mode** with only an
> OpenRouter key — no real exchange funds required.

---

## Step 1 — Supabase (database + auth)

1. Create a new Supabase project. Choose a strong DB password and save it.
2. Open **SQL Editor** → paste the contents of [`backend/schema.sql`](backend/schema.sql) → **Run**.
   This creates all tables, RLS policies, the `bot_types` seed data, and the
   new-user signup trigger. (The backend also runs idempotent migrations on
   startup, but `schema.sql` is the authoritative one-shot setup.)
3. From **Project Settings → API**, collect:
   - `Project URL` → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**secret**)
   - **JWT Secret** (Settings → API → JWT Settings) → `SUPABASE_JWT_SECRET`
4. From **Project Settings → Database → Connection string → Transaction pooler**,
   copy the pooler URI (host contains `pooler.supabase` / port `6543`) →
   `DATABASE_URL`. The backend auto-disables the statement cache for pooler URLs.

---

## Step 2 — Redis (job queue)

Add a Redis instance and note its connection string as `REDIS_URL`:
- **Railway**: in your project, **New → Database → Add Redis**. Railway exposes
  `REDIS_URL` you can reference from other services.
- or **Upstash** / any Redis provider (`redis://…` / `rediss://…`).

---

## Step 3 — Generate the backend secrets

```bash
# 32+ char AES key that encrypts stored exchange/LLM credentials
python -c "import secrets; print('MASTER_KEY=' + secrets.token_urlsafe(48))"

# shared secret authenticating worker → backend calls
python -c "import secrets; print('WORKER_SHARED_SECRET=' + secrets.token_urlsafe(32))"
```

> The backend **refuses to boot in production** with a default/short/weak
> `MASTER_KEY` (must be 32+ chars, no words like `password`/`secret`/`changeme`).

---

## Step 4 — Railway: Backend API service

Create a new Railway service from your GitHub repo, then set:

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Dockerfile Path** | `Dockerfile` |
| **Networking** | Generate a public domain (this is your API URL) |

**Environment variables:**

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Supabase pooler URI (Step 1) |
| `MASTER_KEY` | generated (Step 3) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `REDIS_URL` | from Step 2 |
| `WORKER_SHARED_SECRET` | generated (Step 3) |
| `FRONTEND_URL` | your Vercel URL (fill in after Step 7; used for CORS) |
| `KALSHI_ENVIRONMENT` | `demo` (or `production`) |
| `SENTRY_DSN` | optional |

Deploy. Check `https://<api-domain>/api/health` → should return `{"status":"ok", ...}`.

---

## Step 5 — Railway: Queue Worker service

Add another service from the **same repo**:

| Setting | Value |
|---------|-------|
| **Root Directory** | *(leave empty = repository root)* |
| **Dockerfile Path** | `worker/Dockerfile` |
| **Networking** | none (no public port) |

**Environment variables:**

| Variable | Value |
|----------|-------|
| `REDIS_URL` | same as the API |
| `DATABASE_URL` | same as the API |
| `MASTER_KEY` | **same value** as the API |
| `WORKER_SHARED_SECRET` | **same value** as the API |
| `AGENT_FUND_BACKEND_URL` | the API's public URL (e.g. `https://<api-domain>`) |
| `AGENT_FUND_INTERCEPT_URL` | same as `AGENT_FUND_BACKEND_URL` |

The worker image installs the exchange SDKs (`py-clob-client-v2`, `web3`) and all
bot dependencies, and runs each bot cycle as an isolated subprocess.

---

## Step 6 — (Optional) Wiki Scheduler & Twitter Poster

Only if you want the trade-intelligence pipeline and/or auto-tweeting. Each is a
separate Railway service **from the same repo**:

| Service | Root Directory | Dockerfile Path | Key env |
|---------|----------------|------------------|---------|
| Wiki Scheduler | `backend` | `wiki-worker.Dockerfile` | `DATABASE_URL`, `MASTER_KEY`, `OPENROUTER_API_KEY` |
| Twitter Poster | `backend` | `twitter_poster/Dockerfile` | `DATABASE_URL`, `MASTER_KEY`, `OPENROUTER_API_KEY`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_REDIRECT_URI` |

---

## Step 7 — Vercel: Frontend

1. **New Project → Import** your GitHub repo. Vercel auto-detects Next.js
   (root of the repo). Framework: Next.js. No special build settings needed.
2. **Environment Variables:**

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | your Railway API URL (`https://<api-domain>`) |
   | `NEXT_PUBLIC_WS_URL` | `wss://<api-domain>` |
   | `BACKEND_URL` | your Railway API URL (server-side `/api/*` rewrite) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `NEXT_PUBLIC_SENTRY_DSN` | optional |

3. Deploy. Then go back to the **Railway API** service and set `FRONTEND_URL` to
   your Vercel URL (for CORS), and redeploy the API.

---

## Step 8 — First run (make it fully functional)

1. Open your Vercel URL and **sign up**. The signup trigger auto-creates your
   profile, default rules, and one agent per bot type.
2. In **Settings → Connect exchange**, paste your **OpenRouter** key and your
   **Kalshi** and/or **Polymarket** credentials. These are encrypted at rest
   with `MASTER_KEY` (AES-256-GCM) — they are never stored in plaintext.
3. Pick a bot (e.g. **Council V2**), keep it in **Training mode**, and **Deploy**.
4. Within a few minutes the scheduler enqueues a cycle, the worker runs it, and
   you'll see logs, decisions, and (paper) trades stream into the dashboard.
5. When you're confident, switch a bot to **Live mode** and set
   `KALSHI_ENVIRONMENT=production` on the API service to trade real funds.

---

## Verify & troubleshoot

| Symptom | Likely cause / fix |
|---------|--------------------|
| API build fails: file not found | Wrong **Root Directory**. API = `backend`; Worker = repo root. |
| API boots then exits in prod | `MASTER_KEY` too short/weak, or missing `SUPABASE_JWT_SECRET`/`SUPABASE_URL`. See README → *Production Security Enforcement*. |
| `/api/health` shows `database: unavailable` | Wrong `DATABASE_URL`; use the **pooler** URI (`:6543`). |
| Bots never run | Worker service down, or `REDIS_URL` mismatch between API and Worker. |
| Frontend calls fail with CORS | `FRONTEND_URL` on the API doesn't match the Vercel origin. |
| WebSocket won't connect | `NEXT_PUBLIC_WS_URL` must be `wss://` (not `https://`). |
| "credential decrypt failed" after redeploy | `MASTER_KEY` differs between API and Worker — they must match. |

---

## Security reminders

- Never commit real secrets. Set them in Railway/Vercel env (or Doppler).
- `MASTER_KEY` and `WORKER_SHARED_SECRET` must be **identical** on the API and Worker.
- Rotate `MASTER_KEY` via `OLD_MASTER_KEY` (see README → *Master Key Rotation*).
- Start on Kalshi **demo** and bot **training** mode before risking real funds.
