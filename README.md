<div align="center">

# Infra for Trading Agents

### Deploy, test, and compare autonomous trading agents on prediction markets

Spin up AI trading agents on **Kalshi** and **Polymarket**, run them in paper or live mode, and benchmark strategies side by side — from a multi-model **Council** debate to single-model superforecasters and pure mechanical plays.

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e)
![Deploy](https://img.shields.io/badge/Deploy-Railway%20%2B%20Vercel-7c3aed)

<a href="https://youtu.be/rehvNpq0XD4"><img src="docs/images/demo-thumbnail.jpg" width="640" alt="Watch the demo — Infra for Trading Agents" /></a>

<sub>▶ <a href="https://youtu.be/rehvNpq0XD4">Watch the demo on YouTube</a></sub>

</div>

---

**Everyone has a theory about prediction markets. Almost no one has a clean way to _test_ it.**

"Fade the longshots." "The crowd overreacts to news." "An LLM could forecast these better than the market prices them." The ideas are everywhere — the infrastructure to actually **prove them on live markets** is not.

**Prediction Market Agents is that infrastructure.** Turn a trading strategy into an autonomous agent, run it in paper mode against real-time **Kalshi** and **Polymarket** data, and watch it research → decide → trade — then let the platform keep score with per-trade post-mortems, calibration tracking, and side-by-side benchmarking. Test as many strategies as you want, compare them on the same markets, and promote only the ones that actually work to live trading — before a dollar is ever at risk.

## Key features

- 🧠 **Strategies as deployable agents.** Ship a trading idea as an autonomous bot that scans markets, reasons about them, sizes positions, and places orders on a schedule — no glue code to write.
- 🧪 **Test before you risk.** Every agent runs in **training / paper mode** against **live** market data first; flip to **live mode** only when you're convinced. Training and live are tracked as separate books.
- ⚖️ **Compare strategies head-to-head.** A benchmarking suite, leaderboard, and evaluations views score agents on the same markets — so *"which strategy is actually better?"* finally has an answer.
- 🏛️ **Council V2 — the flagship strategy.** A 5-agent adversarial debate (Forecaster → Bull → Bear → Risk Manager → Trader) over live Perplexity research, **price-blinded** to prevent anchoring, with a Trader agent as the final decision gate. → [deep dive](#council-v2-kalshi-v2-polymarket-v2)
- 🔀 **Two exchanges, one pipeline.** Trade **Kalshi** (CFTC-regulated event contracts) and **Polymarket** (on-chain, Polygon) through a single, identical validation and execution path.
- 🛡️ **Hard risk guardrails.** A deterministic rules engine enforces per-agent *and* account-level limits — max position size, daily-loss kill switch, confidence floors, cooldowns, AI-budget caps — on **every** order before it reaches an exchange. No AI in the safety layer.
- 🔐 **Encrypted by default.** Exchange API keys and wallet keys are stored **AES-256-GCM** encrypted and decrypted only into short-lived `0400` temp files for bot subprocesses — never in plaintext, never in the app's environment.
- 📚 **Trade intelligence that compounds.** An AI "wiki" pipeline runs post-mortems on settled trades, detects behavioral patterns, tracks calibration, and surfaces what to tune next.
- 📈 **Real-time dashboard.** Live logs, open positions, P&L, and settlement stream over WebSocket as your agents trade.
- 🏢 **Multi-tenant & self-hostable.** Per-user isolation via Supabase Auth + row-level security; deploy the whole stack on Railway + Vercel. MIT licensed.

> **Under the hood:** Next.js + FastAPI + Supabase Postgres + Redis/arq queue · LLMs via OpenRouter (Claude Opus, GPT, Grok) + Perplexity Sonar for research · 6 built-in bots across 3 strategies (Council V2, Superforecaster, Tail Buyer).

<details>
<summary><b>📸 Screenshots</b> — the product UI (click to expand)</summary>

<br/>

**Council V2 — the flagship 5-agent debate**

![Council V2 strategy documentation](docs/images/about-council-v2.png)

**How it works — every trade flows through one validated pipeline**

![How it works](docs/images/about-how-it-works.png)

**Compare strategies side by side**

![Strategies](docs/images/about-strategies.png)

</details>

---

## Quick Start

- 🚀 **Deploy the full stack** (Supabase + Railway + Vercel) → **[DEPLOYMENT.md](DEPLOYMENT.md)** — turnkey, step-by-step, **no Doppler required**.
- 💻 **Run locally** → [Getting Started (Local Dev)](#getting-started-local-dev).
- ⚙️ **Configure** → every environment variable is documented in [`.env.example`](.env.example).

> **Minimal viable deploy** = Frontend (Vercel) + Backend API + Worker + Redis + Supabase. The Wiki and Twitter services are optional.

---

## System Architecture

### Service Topology

```
                          +------------------+
                          |   Next.js (Vercel)  |
                          |   Frontend / BFF    |
                          +---------+----------+
                                    |
                    /api/:path* rewrite (next.config.mjs)
                                    |
                          +---------v----------+
                          | FastAPI (Railway)   |
                          | Backend API :8000   |
                          +--+----+----+---+---+
                             |    |    |   |
            +----------------+    |    |   +----------------+
            |                     |    |                    |
   +--------v--------+  +--------v----v----+  +------------v----------+
   | arq Worker       |  |   Supabase       |  |  Wiki Scheduler       |
   | (Railway)        |  | Postgres + Auth  |  |  (Railway, no port)   |
   | bot subprocesses |  | + RLS            |  |  APScheduler cron     |
   +--------+---------+  +---------+--------+  +-----------------------+
            |                      |
   +--------v--------+   +--------v--------+   +----------------------+
   | Redis            |   | Exchange APIs   |   | Twitter Poster       |
   | (job queue)      |   | Kalshi, Poly,   |   | (Railway, no port)   |
   |                  |   | Polymarket CLOB |   | OAuth 2.0 PKCE       |
   +-----------------+   +-----------------+   +----------------------+
```

### Data Flow: Trade Lifecycle

```
 Bot Subprocess          Backend API             Supabase DB
 ─────────────          ───────────             ───────────
 1. Scan markets ──────────────────────────────────────────
 2. AI analysis  ──────────────────────────────────────────
 3. Signal found ─────> POST /api/intercept ──> intercept_queue
                          │
                        4. Rules engine (11 rules)
                          │
                   ┌──────┴──────┐
                   │ APPROVED    │ REJECTED/SKIPPED
                   v             v
             5. Execute       trades (status='skipped')
                order           + counterfactual tracking
                   │
                   v
             6. Record trade (status='executed')
                   │
                   v
             7. Settlement (orchestrator loop, every 5 min)
                   ├─ pnl calculated
                   └─ broadcast via WebSocket
```

### Bot Types (8 total)

| Bot ID | Name | Exchange | Status | Strategy |
|--------|------|----------|--------|----------|
| `polymarket-v2` | Council V2 | Polymarket | **Active** | 5-agent sequential debate (Grok 4.20 + Claude Opus 4.7 + GPT-5.4) |
| `kalshi-v2` | Council V2 | Kalshi | **Active** | Same pipeline as polymarket-v2, Kalshi exchange |
| `polymarket-superforecaster` | Superforecaster | Polymarket | **Active** | Perplexity research + single-model calibrated forecasting |
| `kalshi-superforecaster` | Superforecaster | Kalshi | **Active** | Same pipeline, Kalshi exchange |
| `polymarket-tail-buyer` | Tail Buyer | Polymarket | **Active** | Rule-based: buy contracts priced near zero at scale (no AI) |
| `kalshi-tail-buyer` | Tail Buyer | Kalshi | **Active** | Same rule-based strategy, Kalshi exchange |
| `ensemble-5` | Council (v1) | Kalshi | Deprecated | 5-model consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok) |
| `polymarket-council` | Council (v1) | Polymarket | Deprecated | Same v1 pipeline, Polymarket exchange |

---

## Deployment Topology

### Services

| Service | Platform | Dockerfile | Port | Purpose |
|---------|----------|-----------|------|---------|
| **Backend API** | Railway | `backend/Dockerfile` | 8000 | FastAPI app -- REST endpoints, WebSocket, orchestrator loop |
| **Queue Worker** | Railway | `worker/Dockerfile` | None | arq consumer -- spawns bot subprocesses, log forwarding |
| **Wiki Scheduler** | Railway | `backend/wiki-worker.Dockerfile` | None | APScheduler cron -- periodic wiki pipeline runs |
| **Twitter Poster** | Railway | `backend/twitter_poster/Dockerfile` | None | Background service -- posts trade threads to X/Twitter |
| **Frontend** | Vercel | N/A (Next.js) | 3000 (dev) | Dashboard UI, `/api/:path*` rewrite to backend |

### Doppler Integration

Every Dockerfile uses the same conditional CMD pattern:

```dockerfile
CMD ["sh", "-c", "if [ -n \"$DOPPLER_TOKEN\" ]; then exec doppler run -- <entrypoint>; else exec <entrypoint>; fi"]
```

When `DOPPLER_TOKEN` is set (production), Doppler injects all secrets as environment variables at runtime. Without it (local dev), the service reads from process env / `.env` files directly.

### Database Connection Pool

Configured in `database.py` via `asyncpg.create_pool`:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `min_size` | 1 | Minimum idle connections |
| `max_size` | 10 | Maximum connections |
| `command_timeout` | 30s | Per-query timeout |
| `timeout` | 30s | Connection acquisition timeout |
| `statement_cache_size` | 0 (pooler) / 100 (direct) | Auto-detected: set to 0 when URL contains `pooler.supabase` or `:6543` (PgBouncer compatibility) |

Connection retry: exponential backoff (2s, 4s, 8s, 16s, 32s) over 5 attempts.

### Startup Sequence

The `lifespan()` context manager in `main.py` runs in this exact order:

1. **`init_pool()`** -- establish asyncpg connection pool (with retry)
2. **`run_migrations()`** -- seed `bot_types`, backfill `user_agents`, apply DDL migrations (all idempotent `ADD COLUMN IF NOT EXISTS`), re-encrypt v1/v2 credentials to v3, rotate keys if `OLD_MASTER_KEY` is set
3. **`detect_platform_code_changes()`** -- snapshot bot defaults + prompts into `platform_code_history` (non-fatal)
4. **`portfolio_tracker.run_snapshot_loop(interval_seconds=300)`** -- background task, 5-minute portfolio snapshots
5. **`orchestrator.start()`** -- begins the scheduling/settlement loop
6. **MASTER_KEY validation** -- fatal checks for default key, length < 32, weak patterns
7. **Auth validation** -- fatal if no `SUPABASE_JWT_SECRET` and no `SUPABASE_URL` in production
8. **Production enforcement** -- fatal if `ALLOW_DEV_AUTH` or `ALLOW_DEFAULT_KEY` set in production; auto-enables `AGENT_FUND_STRICT_AUTH`

Steps 6-8 call `sys.exit(1)` on failure in production. In development, they emit warnings and continue.

### Health Check

```
GET /api/health
```

```json
{
  "status": "ok | degraded",
  "database": "connected | unavailable",
  "kalshi_environment": "demo | production",
  "version": "0.1.0"
}
```

Acquires a connection with a 5-second timeout and runs `SELECT 1`. If the database is unreachable, status degrades to `"degraded"` but the service stays up.

### Production Security Enforcement (Fatal Checks)

| Condition | Behavior |
|-----------|----------|
| `MASTER_KEY` equals the default placeholder | `sys.exit(1)` unless `ALLOW_DEFAULT_KEY=1` in non-production |
| `MASTER_KEY` < 32 characters | `sys.exit(1)` in production |
| `MASTER_KEY` contains weak patterns (`password`, `secret`, `changeme`, `test`, `demo`, `12345`) | `sys.exit(1)` in production |
| No `SUPABASE_JWT_SECRET` and no `SUPABASE_URL` | `sys.exit(1)` in production |
| `ALLOW_DEV_AUTH` set in production | `sys.exit(1)` |
| `ALLOW_DEFAULT_KEY` set in production | `sys.exit(1)` |

---

## Exchange Clients

### Kalshi (REST + RSA-PSS)

**Base URL:** `https://trade-api.polymarket.com/trade-api/v2`

**Authentication:** Every request is signed with RSA-PSS using the user's private key.

```
Message to sign: "{timestamp_ms}{METHOD}{path}"
Algorithm: RSA-PSS with SHA256, MGF1(SHA256), salt_length=DIGEST_LENGTH (32 bytes)
```

**Request headers:**

| Header | Value |
|---|---|
| `KALSHI-ACCESS-KEY` | User's API key |
| `KALSHI-ACCESS-TIMESTAMP` | Unix time in milliseconds |
| `KALSHI-ACCESS-SIGNATURE` | Base64-encoded RSA-PSS signature |

**Rate limiting:** Minimum 100ms between requests. 429 responses trigger exponential backoff with jitter (up to 3 retries).

**Price handling:** All prices in **cents** (1-99). Validated before submission.

**Key methods:** `get_markets()`, `get_balance()` (returns cents), `get_positions()`, `place_order()`, `cancel_order()`, `get_fills()`

### Polymarket (Gamma + CLOB + Data APIs)

Three separate APIs serve different purposes:

| API | URL | Auth | Purpose |
|---|---|---|---|
| **Gamma API** | `https://gamma-api.polymarket.com` | None | Market data, prices, metadata |
| **CLOB API** | `https://clob.polymarket.com` | ECDSA (EIP-712) | Order placement and cancellation |
| **Data API** | `https://data-api.polymarket.com` | None | Portfolio value, closed positions |

**CLOB Authentication:**

1. Create temp client with private key + chain ID 137 (Polygon)
2. Derive API credentials via `create_or_derive_api_creds()` → `ApiCreds(api_key, api_secret, api_passphrase)`
3. Init permanent client with derived creds, `signature_type=2` (ECDSA), and funder address

**Price extraction:** `outcomePrices` field is a JSON string `[yes_price, no_price]` parsed to floats (0.0-1.0).

**Order flow:** `create_order(OrderArgs)` → `post_order(signed_order)` → status `"matched"` (filled) or `"live"` (resting)

---

## Credential & Encryption System

### AES-256-GCM Implementation

All user credentials (API keys, private keys, tokens) are encrypted at rest using AES-256-GCM from the `cryptography` library (`backend/app/services/encryption.py`).

- **Algorithm**: AES-256-GCM (authenticated encryption with associated data)
- **Nonce**: 96-bit (12 bytes), generated via `os.urandom(12)` per encryption operation
- **Storage format**: base64-encoded TEXT columns (not BYTEA) to avoid PgBouncer serialization issues

### Key Derivation Versions

| Version | Method | Salt | Iterations | Notes |
|---------|--------|------|------------|-------|
| **v1** (legacy) | `hashlib.sha256(master_key)` | None | 1 | Single-iteration SHA256. No longer generated; auto-migrated on startup. |
| **v2** | `hashlib.pbkdf2_hmac("sha256", master_key, static_salt, 100000)` | `b"arbiter-credential-encryption-v2"` (static) | 100,000 | PBKDF2-HMAC-SHA256 with hardcoded salt. Superseded by v3. |
| **v3** (current) | `hashlib.pbkdf2_hmac("sha256", master_key, random_salt, 100000)` | 128-bit `os.urandom(16)` per credential | 100,000 | Per-credential random salt stored alongside ciphertext. |

On startup, `run_migrations()` automatically re-encrypts all v1/v2 credentials to v3.

### Credential Storage Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to `auth.users` |
| `provider` | TEXT | `kalshi`, `polymarket`, `twitter`, `openai`, `anthropic`, etc. |
| `key_type` | TEXT | `api_key`, `private_key`, `funder_address`, etc. |
| `encrypted_value` | TEXT | Base64-encoded AES-256-GCM ciphertext |
| `iv` | TEXT | Base64-encoded 96-bit nonce |
| `key_version` | SMALLINT | Key derivation version (1, 2, or 3) |
| `salt` | TEXT | Base64-encoded 128-bit random salt (v3 only) |
| `last_four` | TEXT | Last 4 characters of plaintext (for UI display) |
| `is_active` | BOOLEAN | Soft-disable flag |

One credential per `(user_id, provider, key_type)` tuple.

### Bot Credential Lifecycle

Credentials are never passed as environment variables to bot subprocesses. Instead:

1. **Decrypt**: Worker fetches credentials from backend via `GET /api/bot/job-credentials/{cycle_id}`
2. **Write temp file**: `write_credentials_file()` writes a JSON temp file with `0400` permissions (read-only by owner)
3. **Pass path**: Subprocess receives `AGENT_FUND_CREDS_FILE=/tmp/af_creds_XXXX.json` in its env
4. **Cleanup**: `cleanup_credentials_file()` calls `os.unlink()` in a `finally` block after the subprocess exits

Sensitive keys isolated via temp file:

```python
CREDENTIAL_KEYS = {
    "KALSHI_API_KEY", "KALSHI_PRIVATE_KEY",
    "POLYMARKET_PRIVATE_KEY", "POLYMARKET_FUNDER_ADDRESS",
    "XAI_API_KEY", "OPENROUTER_API_KEY", "OCTAGON_API_KEY",
    "AGENT_FUND_BOT_TOKEN",
}
```

### Master Key Rotation

Rotation is performed by setting `OLD_MASTER_KEY` in the environment before deploying with the new `MASTER_KEY`:

1. For each v3 credential, attempt decryption with the **current** `MASTER_KEY`
2. If that succeeds, skip (already rotated)
3. If it fails, decrypt with `OLD_MASTER_KEY` using the credential's stored salt
4. Re-encrypt with the new `MASTER_KEY` via `encrypt_value_v3()`
5. Update the row in `credentials`

---

## Authentication & Authorization

### Supabase JWT Validation

User authentication uses Supabase Auth JWTs, validated in `backend/app/auth.py`.

**JWKS (ES256)**: If `SUPABASE_URL` is configured, the backend creates a `PyJWKClient` pointing at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Keys are cached for 3600 seconds.

**HMAC (HS256)**: If `SUPABASE_JWT_SECRET` is configured, tokens are verified using the symmetric secret.

The algorithm is auto-detected from the token header. `verify_aud` is disabled (Supabase tokens use a generic audience).

**Dev mode**: When neither secret nor URL is configured AND `ALLOW_DEV_AUTH=1` AND the process is not on a deployed platform (checks `RAILWAY_ENVIRONMENT`, `VERCEL`, `FLY_APP_NAME`, etc.), tokens are accepted without verification.

### Bot Token Authentication

Per-bot tokens authenticate service-to-service calls from bot subprocesses to the backend.

- **Generation**: `secrets.token_urlsafe(32)`
- **Storage**: SHA256 hash stored in `user_agents.bot_token` (plaintext never persisted)
- **Verification**: `X-Bot-Token` header is hashed with SHA256 and compared using `secrets.compare_digest()` (constant-time)
- **Lifecycle**: Token generated on deploy, cleared on stop

### Worker / Cycle Token Authentication

| Method | Header | Storage | Use Case |
|--------|--------|---------|----------|
| **Per-cycle token** | `X-Cycle-Token` | `user_agents.cycle_token_hash` (SHA256) | All worker endpoints. Generated per scheduling cycle. |
| **Shared secret** | `X-Worker-Token` | `WORKER_SHARED_SECRET` env var | Backward compatibility during rolling deploys. |

### MFA Flow

1. Verify JWT normally
2. Check `aal` claim: `aal2` = verified, `aal1` = check for enrolled TOTP factors
3. If factors exist but only `aal1`, return **403** with "MFA verification required"

MFA is required for credential creation and deletion.

### Dev Bypass Flags

| Flag | Effect | Production |
|------|--------|------------|
| `ALLOW_DEV_AUTH=1` | Accepts any JWT without verification | **FATAL** -- `sys.exit(1)` |
| `ALLOW_DEFAULT_KEY=1` | Permits the default MASTER_KEY | **FATAL** -- `sys.exit(1)` |

### Row-Level Security (RLS)

All user-data tables enforce RLS policies scoped to `auth.uid()`. Backend uses `service_role` key to bypass RLS for system operations.

---

## Bot System (All 6 Active Bots)

The system runs six trading bots across two exchanges. Each bot executes in single-cycle mode as a subprocess: ingest markets, analyze, decide, execute, then exit. The orchestrator schedules new cycles via arq (Redis job queue).

### Council V2 (kalshi-v2, polymarket-v2)

The flagship AI-driven strategy. Runs a 5-agent adversarial debate to evaluate prediction markets.

**Full Pipeline:**

```
Ingest -> Decided-Markets Filter -> Balance Check -> Research (Perplexity) -> Debate (5 agents) -> Edge Filter -> Position Sizing -> Execute
```

**Step 1 -- Ingest.** Fetches active binary markets from the exchange API (cursor-based pagination, up to 5 pages of 1,000 markets). Filters: status=open, close time 1h to 7d out, price 0.03-0.97, volume >= 50.

**Step 2 -- Decided-Markets Filter.** Queries `GET /api/intercept/decided-markets` to skip tickers analyzed within `reanalyze_cooldown_hours` (default 6).

**Step 3 -- Research.** Top N markets (default 10) researched via Perplexity `sonar-deep-research`. A 15-minute watchdog caps the research phase.

**Step 4 -- 5-Agent Debate.** Five sequential LLM calls via OpenRouter:

| Agent | Role | Model (default) | Sees Prices? |
|---|---|---|---|
| **Forecaster** | Estimate true P(YES) via base rates + evidence | `x-ai/grok-4.20` | No |
| **Bull Researcher** | Strongest evidence-based YES case | `anthropic/claude-opus-4.7` | No |
| **Bear Researcher** | Strongest evidence-based NO case, counters Bull | `openai/gpt-5.4` | No |
| **Risk Manager** | EV calculation, position sizing | `anthropic/claude-opus-4.7` | Yes |
| **Trader** | Final BUY/SKIP decision | `anthropic/claude-opus-4.7` | Yes |

**Anti-anchoring:** Forecaster, Bull, and Bear receive market data via `_market_summary_no_price()` which strips current prices. Only Risk Manager and Trader see prices (they need them for EV and limit price calculations).

**Ensemble aggregation:** Probabilities from Forecaster (0.35 weight), Bull (0.25), Bear (0.20) are combined using confidence-weighted averaging.

**Step 5 -- Edge Filter.** Edge thresholds scale with confidence:

| Forecaster Confidence | Required Edge |
|---|---|
| >= 0.80 (high) | 4% |
| >= 0.60 (medium) | 6% |
| < 0.60 (low) | 10% |

Minimum confidence floor: 0.50.

**Step 6 -- Position Sizing.** Tier-based sizing with Kelly criterion adjustment:

```python
position_tiers = [
    (100,    0.20, 0.40, 10),    # balance, base_pct, max_pct, max_contracts
    (1000,   0.05, 0.15, 50),
    (10000,  0.03, 0.08, 250),
    (100000, 0.02, 0.05, 1000),
    (inf,    0.01, 0.03, 5000),
]
```

Investment scaled by edge: `scaler = 1.0 + (kelly_multiplier * edge)`, clamped [0.1x, 3.0x]. Cash reserve of 5% maintained.

**Step 7 -- Execute.** Sends order via proxy client to `POST /api/intercept` for orchestrator validation.

### Superforecaster (superforecaster-kalshi, superforecaster-poly)

Streamlined single-model variant replacing the 5-agent debate with one powerful reasoning model.

- Single LLM call with Superforecaster prompt handling probability estimation, EV, and trade decision in one pass
- Research phase identical (Perplexity `sonar-deep-research`)
- Same edge filter and position sizing as Council V2
- Same anti-anchoring (no prices shown to model)
- ~80% reduction in per-market AI cost vs Council V2

### Tail Buyer (tail-buyer-kalshi, tail-buyer-poly)

Purely mechanical strategy with zero AI involvement. Buys deeply underpriced contracts.

**No AI, no research, no debate.** Every decision is rule-based.

- **Price range:** 0.5 cents to 3 cents (`min_contract_price=0.005`, `max_contract_price=0.03`)
- **Sizing:** `count = int(trade_size / cheap_price)` -- buys cheaper side
- **Expiry:** 7 to 30 days
- **Volume:** >= 50,000
- **Max positions:** 100 per cycle
- **Cooldown:** 720 hours (30 days) before re-analyzing same market

### agent_fund_patch.py (Proxy Client)

Entry point for bots launched as subprocesses:

1. Check for `AGENT_FUND_CREDS_FILE` -- if set, load credentials from JSON file
2. For Kalshi: normalize RSA PEM key, write to temp file, validate with `cryptography.hazmat`
3. Run single cycle via `bot.main()`
4. Cleanup temp key file in `finally` block

---

## Trade Execution Flow

```
Bot Process                          Backend API                         Orchestrator
===========                          ===========                         ===========

1. Bot calls client.place_order()
   |
2. ProxyClient POSTs to           -> POST /api/intercept
   /api/intercept                     |
                                      |-- Verify X-Bot-Token (SHA256)
                                      |-- Verify agent exists + running
                                      |
                                      |-- IF action=skip/rejected:
                                      |     Save directly to trades table
                                      |     RETURN (no queue)
                                      |
                                      |-- ELSE (buy/sell):
                                      |     INSERT into intercept_queue (pending)
                                      |
3. Orchestrator polls              <-  _main_loop() every 2s
                                       |
                                       |-- Atomic claim: FOR UPDATE SKIP LOCKED
                                       |     (prevents duplicate processing)
                                       |
                                       |-- Acquire per-agent cycle lock
                                       |
4. Validation                          |-- Tier 1: Rules Engine (11 rules)
                                       |     If cappable rule fails -> try capped count
                                       |
                                       |-- Tier 3: Account-level checks
                                       |
5. Execution                           |-- Training: status='paper'
                                       |-- Polymarket: enqueue to arq worker
                                       |-- Kalshi: direct REST execution
                                       |
6. Commit                              |-- Atomic: update queue + insert trade + update capital
                                       |
7. Broadcast                           |-- WebSocket: trade + log + audit
```

**Queue Processing:** Up to 20 pending orders claimed per poll cycle. Polymarket orders route through arq worker (which has `py-clob-client` installed).

---

## Rules Engine

10 hard constraints evaluated before any trade executes (`backend/app/services/rules_engine.py`). Rule 6 (`allowed_categories`) was removed -- the AI debate handles category relevance:

| # | Rule Name | Logic | Applies To |
|---|---|---|---|
| 1 | `max_trade_size` | `cost <= rules.max_trade_size` | Buy |
| 2 | `max_capital_per_agent` | `capital_used + cost <= capital_allocated` | Buy |
| 3 | `daily_loss_limit` | `daily_loss < rules.daily_loss_limit` | Both |
| 4 | `min_confidence` | `confidence >= rules.min_confidence` | Both |
| 5 | `blocked_tickers` | `ticker NOT IN blocked_tickers` | Both |
| 7 | `max_concurrent_positions` | `open_positions < max_concurrent_positions` | Buy |
| 8 | `duplicate_position` | No existing position on same ticker (same bot) | Buy |
| 9 | `opposing_position` | No YES+NO on same market (same bot) | Buy |
| 10 | `max_trades_per_day` | `trades_today < max_trades_per_day` | Both |
| 11 | `sell_without_position` | Sell requires existing position | Sell |

**Capping Logic:** Rules 1 and 2 are "cappable" -- instead of rejecting, the engine calculates the maximum count that satisfies the limit and re-evaluates all rules.

**Per-bot overrides:** Each bot's `config_json` can set tighter limits. The more restrictive value always wins (lower for maxes, higher for mins).

---

## Settlement Flow

### Settlement Loop

Runs every 5 minutes (`SETTLEMENT_INTERVAL = 300`). Queries distinct users with unsettled trades and processes each independently.

### P&L Formulas

```
BUY YES @ 0.30:
  Win (market=YES):  (1.0 - 0.30) x count = +0.70 x count
  Loss (market=NO):  -0.30 x count

BUY NO @ 0.70:
  Win (market=NO):   (1.0 - 0.70) x count = +0.30 x count
  Loss (market=YES): -0.70 x count

SELL YES @ 0.70:
  Win (market=NO):   +0.70 x count (kept premium)
  Loss (market=YES): -(1.0 - 0.70) x count
```

### Counterfactual Settlement

Skipped, rejected, error, and paper trades are settled counterfactually to track "what would have happened":

- Same P&L formula as real trades
- `count=0` (skips) use `cf_count=1` for hypothetical P&L
- Only updates `cf_*` columns -- does NOT modify `user_agents` metrics
- Enables "missed opportunity" analysis in evaluations
- Error trades with `pnl=0` (execution failed but market settled) are also included in signal extraction

### Early Exit Handling

When a position is sold before market resolution:

```python
pnl = (sell_price - buy_price) * sell_count  # for buy trades
```

Supports partial exits with proportional cost/count reduction.

### Atomic Transactions

All settlement uses atomic transactions with an idempotency guard (`settled = FALSE` predicate). Concurrent runs cannot double-process the same trade.

---

## Worker Architecture (arq + Redis)

### Overview

Standalone Railway service running `arq backend.worker.WorkerSettings`. Consumes jobs from Redis and spawns isolated bot subprocesses.

### Job Types

| Function | Purpose | Timeout |
|----------|---------|---------|
| `run_bot_cycle` | Spawn bot subprocess, capture output, forward logs, heartbeats | 31 min |
| `execute_polymarket_order` | Execute Polymarket CLOB order (SDK only in worker) | 31 min |

Worker settings: `max_jobs=3`, `health_check_interval=30s`, `retry_jobs=False`.

### Cycle Lifecycle

```
Orchestrator (backend)              Redis Queue              Worker
──────────────────────              ───────────              ──────
1. Find agents where
   next_run_at <= NOW()
2. Generate cycle_token,
   store SHA256 hash
3. Enqueue job ──────────────────> run_bot_cycle()
                                           │
                                    4. Worker picks up
                                    5. Fetch config + credentials
                                    6. Write temp credentials file
                                    7. Spawn subprocess
                                    8. Stream stdout/stderr
                                       ├─ redact sensitive data
                                       ├─ forward logs
                                       └─ heartbeat every 60s
                                    9. Cleanup credentials file
                                   10. Report cycle complete
```

### Subprocess Management

| Feature | Detail |
|---------|--------|
| **Timeout** | 30 min (60s under arq's 31-min job timeout) |
| **Heartbeat** | Every 60s, extends cycle lease by 5 min |
| **Status polling** | Every 10s; 404 means user clicked Stop |
| **Graceful kill** | `terminate()` + 5s wait, then `kill()` |
| **Single-cycle mode** | `AGENT_FUND_SINGLE_CYCLE=true` |

### Log Redaction

All subprocess output is redacted before forwarding:

| Pattern | Replacement |
|---------|-------------|
| `sk-[a-zA-Z0-9]{20,}` | `[REDACTED_KEY]` |
| `KXUSER-[a-zA-Z0-9-]+` | `[REDACTED_KALSHI_KEY]` |
| `0x[a-fA-F0-9]{40,}` | `[REDACTED_ADDRESS]` |
| PEM blocks | `[REDACTED_PEM]` |
| JWT tokens (`eyJ...`) | `[REDACTED_JWT]` |

---

## Wiki / Trade Intelligence Pipeline

A standalone data pipeline that processes settled trades into structured analytics. Runs on Railway via APScheduler.

### Pipeline Stages

| Stage | Name | Frequency | Description |
|---|---|---|---|
| 0 | Data Pull | Every 15 min | Fetch settled trades without signals, join deployment snapshots |
| 1 | Signal Extraction | Every 15 min | Parse reasoning into 28+ structured fields (base_rate, edge, sentiment, etc.) |
| 1b | Cross-Trade Aggregates | Daily 2 AM UTC | 22+ aggregate functions across all signals (requires 10+ trades) |
| 2 | AI Autopsy | ~~Every 15 min~~ **Disabled** | LLM-generated post-mortem per trade. Currently disabled (output not consumed downstream). |
| 3 | Weekly Analysis | Sunday 3 AM UTC | LLM strategic insights from trade_signals aggregates (no autopsy dependency) |
| 4 | Parameter Sweep | Daily 2 AM UTC | Sweep confidence/edge thresholds for optimal settings |
| 6 | Wiki Update | After stages 0-2 | Generate formatted wiki pages |

### Schedule Summary

| Schedule | Stages | Purpose |
|---|---|---|
| Incremental (15 min) | 0, 1, 6 | Process new trades, extract signals, update wiki pages |
| Daily (2 AM UTC) | 1b, 4, 6 | Cross-trade aggregates, parameter sweep |
| Weekly (Sunday 3 AM UTC) | 3 | LLM-driven strategic analysis |

---

## WebSocket Protocol

### Endpoint

```
WS /ws
```

### Authentication

Two methods supported:

1. **Legacy query parameter:** `?token=<jwt>`
2. **First message (recommended):**
   ```json
   {"type": "auth", "token": "<jwt>"}
   ```
   - 10-second timeout for auth message
   - JWT verified via Supabase JWKS (ES256/HS256)
   - Failed auth closes connection with code `4001`

### Per-User Scoping

Connections are stored in `_connections[user_id] = set[WebSocket]`. Each user can have multiple concurrent connections. All broadcasts are scoped to `user_id` for multi-tenant isolation. Dead connections are auto-removed.

### Message Types

| Type | Trigger | Key Fields |
|---|---|---|
| `log` | Bot output, orchestrator events | `agent_id`, `level` (info/warn/error/trade), `message`, `environment`, `market_title` |
| `trade` | Trade executed/rejected/skipped | Full trade object spread into message |
| `status` | Agent started/stopped/errored | `agent_id`, `status` |
| `audit` | User actions (non-api_call) | Audit entry object |
| `pong` | Client sends `{"type": "ping"}` | Keepalive response |

### Connection Lifecycle

1. Accept WebSocket connection
2. Check query param token OR wait 10s for auth message
3. Verify JWT → extract `sub` as `user_id`
4. Add to `_connections[user_id]`
5. Loop: handle client messages (ping/pong)
6. On disconnect: remove socket, clean up empty sets

---

## Onboarding & User Journey

New users pass through a 4-step gate before accessing the dashboard:

```
Signup → Admin Approval → Guided Walkthrough → Onboarding → Dashboard
```

### Gate Checks (in dashboard layout)

| Check | Redirect/Modal | Condition |
|---|---|---|
| Not authenticated | Redirect to `/login` | `!user` |
| Onboarding incomplete | Redirect to `/onboarding` | `!profile.onboarding_completed` |
| MFA not verified | Redirect to `/mfa-verify` | AAL1 with enrolled TOTP factors |
| Walkthrough not completed | Locked modal overlay | `!profile.completed_walkthrough && !tourActive` |
| Account not approved | Video modal | `!profile.is_approved && completed_walkthrough` |

### Walkthrough System

The guided tour (`src/context/walkthrough.tsx`) walks users through every page with tooltip overlays and demo data:

- **Forced mode:** Cannot be exited until all steps are completed
- **Demo data:** When tour is active, all SWR hooks return synthetic data from `demo-data.ts` instead of API calls
- **Step navigation:** Each step specifies a `page` route and optional `settingsTab`; the walkthrough auto-navigates
- **Completion:** On final step, updates `completed_walkthrough=true` in Supabase via `refreshProfile()`
- **State persistence:** `localStorage` keys: `af_walkthrough_step`, `af_walkthrough_active`, `af_walkthrough_completed`

---

## Public Trade Sharing

Users can opt-in to public trade sharing via `trades_public` flag on their profile.

### Endpoint

```
GET /api/public/trades/{trade_id}  (no auth required)
```

### Exposed Fields

`id`, `timestamp`, `market_ticker`, `market_title`, `category`, `side`, `action`, `price`, `confidence`, `bot_reasoning` (sanitized), `status`, `exchange`, `settled`, `owner_display_name`, `owner_avatar_url`

### Sanitization

- Strips `_model` keys from JSON (hides LLM identifiers)
- Strips `[early_exit:...]` dedup tags (contains blockchain tx hashes)
- Returns 404 for both "not found" and "not public" (information hiding)

### Response Headers

```
Cache-Control: no-store, no-cache, must-revalidate
X-Robots-Tag: noindex, nofollow
```

All access logged with client IP for abuse detection.

---

## Frontend Architecture

### Pages & Routes

**Auth Routes** (`(auth)` layout group)

| Route | Description |
|---|---|
| `/login` | Email/password sign-in with MFA and X/Twitter OAuth |
| `/signup` | Account registration |
| `/forgot-password` / `/reset-password` | Password recovery |
| `/mfa-verify` | TOTP multi-factor verification |
| `/onboarding` | New user setup |

**Dashboard Routes** (`(dashboard)` layout -- requires auth + onboarding + MFA)

| Route | Description |
|---|---|
| `/portfolio` | P&L chart, balances, open/settled positions |
| `/strategy` | Bot catalog, deploy with config |
| `/trades` | Trade list with filtering, sorting, pagination |
| `/trades/[id]` | Trade detail with debate results |
| `/terminal` | Live agent terminal with log streaming |
| `/leaderboard` | Cross-user benchmarking |
| `/settings` | Credentials, rules, MFA enrollment |

**Evaluations Sub-Routes** (nested tabs)

| Route | Description |
|---|---|
| `/evaluations/visuals` | Aggregated performance metrics (Market Price, Timing, Categories, YES/NO with bot/week filters) |
| `/evaluations/analysis` | Weekly AI analysis reports |
| `/evaluations/trades` | Per-trade evaluation drill-down |
| `/evaluations/sweep` | Confidence/edge threshold sweep results |
| `/evaluations/activity` | Wiki pipeline activity log |

**Memory Sub-Routes** (wiki knowledge base)

| Route | Description |
|---|---|
| `/memory` | Wiki dashboard |
| `/memory/bot/[id]` | Per-bot AI-generated performance narrative |
| `/memory/category/[key]` | Per-category analysis |
| `/memory/agent/[role]` | Per-AI-agent role analysis |
| `/memory/pattern/[key]` | Detected behavioral patterns |

**Public Routes**

| Route | Description |
|---|---|
| `/` | Landing page with particle globe animation |
| `/t/[id]` | Public shared trade view |
| `/about`, `/privacy`, `/terms` | Static pages |

### State Management

| Context | Purpose | Hook |
|---|---|---|
| **AuthProvider** | Supabase session, profile, sign-in/out, MFA, idle timeout (30 min) | `useAuth()` |
| **WalkthroughProvider** | Guided tour state machine, demo mode flag, forced onboarding | `useWalkthrough()` |
| **DemoModeProvider** | Standalone demo data toggle | `useDemoMode()` |
| **EnvironmentFilterProvider** | Training vs. live environment filter | `useEnvironmentFilter()` |
| **TickerPreferencesProvider** | Ticker banner visibility (localStorage) | `useTickerPreferences()` |

### Data Fetching

**Centralized API Client** (`src/lib/api.ts`): All API calls flow through `request<T>()` which attaches the Supabase JWT, handles 401 redirects, and intercepts MFA 403 errors.

**SWR Hooks**: All data hooks use SWR for caching and revalidation. Each checks `demoMode` and returns synthetic demo data during the walkthrough tour.

**WebSocket** (`src/lib/websocket.ts`): Singleton manager with auto-reconnect (exponential backoff 1-30s), 15s keepalive pings, auth token as first message. Message types: `trade`, `status`, `log`, `pong`.

### Design System

**Colors** (dark theme):

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#000000` | Page background |
| `surface` | `#0a0a0a` | Card background |
| `gain` | `#00C807` | Positive P&L |
| `loss` | `#FF6B8A` | Negative P&L |
| `text-tertiary` | `#999999` | Muted text |
| `border` | `#21262d` | Dividers |
| `warning` | `#FFC107` | Warning states |

**Fonts**: CapsuleSansText (sans), RHPhonic (display), MartinaPlantijn (serif), JetBrains Mono (mono)

**Charts**: Recharts (^2.15.0) for area/bar/line charts, Lightweight Charts (^5.1.0) for TradingView-style charts

**Icons**: Lucide React (^0.577.0)

---

## Twitter/X Poster Service

Standalone async service (`backend/twitter_poster/`) that posts trade updates to Twitter/X.

- **Polling interval**: 60 minutes (configurable via `POLL_INTERVAL_SECONDS`)
- **Flow**: Find enabled users -> fetch oldest untweeted trade -> generate 2-3 tweet thread via OpenRouter (gpt-4o-mini) -> post via Tweepy
- **Thread**: Tweet 1 = trade headline, Tweet 2 = key reasoning, Tweet 3 = bot attribution + share link
- **Share links**: `https://www.example.com/t/{trade_id}` (public trade page)
- **Retry**: Failed posts retried up to 3 times per cycle

---

## Database Schema

### Auth & Users

**`user_profiles`** -- extends Supabase `auth.users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | FK to `auth.users(id)` |
| `display_name` | TEXT | |
| `avatar_url` | TEXT | |
| `onboarding_completed` | BOOLEAN | Gates dashboard access |
| `live_enabled` | BOOLEAN | Admin-only: enables live trading |
| `is_approved` | BOOLEAN | Admin-only: account approval gate |
| `completed_walkthrough` | BOOLEAN | Guided tour completion |
| `trades_public` | BOOLEAN DEFAULT FALSE | Public trade sharing opt-in |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### Bot Registry

**`bot_types`** -- read-only registry of bot implementations

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | e.g. `polymarket-v2`, `kalshi-tail-buyer` |
| `name`, `full_name` | TEXT | Display names |
| `description`, `strategy` | TEXT | Bot descriptions |
| `llms` | TEXT | Comma-separated LLM list |
| `exchange` | TEXT | `kalshi` or `polymarket` |
| `accent_color`, `bg_tint` | TEXT | UI colors |
| `deprecated` | BOOLEAN DEFAULT FALSE | Hides from catalog |

**`user_agents`** -- per-user bot instances

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID | FK to `auth.users(id)` |
| `bot_type_id` | TEXT | FK to `bot_types(id)` |
| `status` | TEXT DEFAULT 'idle' | `idle`, `running`, `paused`, `error` |
| `mode` | TEXT | `paper` or `live` |
| `capital_allocated` | NUMERIC(12,2) DEFAULT 1000 | |
| `capital_used` | NUMERIC(12,2) DEFAULT 0 | |
| `total_pnl` | NUMERIC(12,2) DEFAULT 0 | |
| `trade_count`, `win_count`, `settled_count` | INTEGER | |
| `config_json` | JSONB | User-configurable settings |
| `config_snapshot_id` | UUID | FK to `deployment_snapshots` |
| `cycle_running` | BOOLEAN DEFAULT FALSE | Worker lock |
| `cycle_token_hash` | TEXT | SHA256 of per-cycle bearer token |
| `next_run_at`, `last_heartbeat_at` | TIMESTAMPTZ | Scheduler/health |

Unique constraint: `(user_id, bot_type_id)`

### Credentials

**`credentials`** -- AES-256-GCM encrypted API keys (see Credential & Encryption section for details)

### Trading

**`trades`** -- all trade decisions (immutable after creation)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id`, `agent_id` | UUID | FKs to auth.users, user_agents |
| `market_ticker`, `market_title` | TEXT | Market identification |
| `category` | TEXT | e.g. Politics, Sports, Crypto |
| `side` | TEXT | `yes` or `no` |
| `action` | TEXT | `buy` or `sell` |
| `count` | INTEGER DEFAULT 1 | Contract quantity |
| `price` | NUMERIC(8,4) | Entry price |
| `total_cost` | NUMERIC(12,2) | |
| `confidence` | NUMERIC(4,3) | 0.000-1.000 |
| `bot_reasoning`, `raw_reasoning` | TEXT | Decision reasoning |
| `rules_result` | TEXT | `passed` or `failed:rule_name` |
| `ai_verdict`, `ai_reasoning` | TEXT | AI validator output |
| `status` | TEXT | `pending`, `executed`, `paper`, `rejected`, `skipped`, `error` |
| `exchange` | TEXT DEFAULT 'kalshi' | `kalshi` or `polymarket` |
| `model` | TEXT | LLM model used |
| `pnl` | NUMERIC(12,2) | Realized P&L |
| `settled` | BOOLEAN DEFAULT FALSE | Market resolved? |
| `settled_at` | TIMESTAMPTZ | |
| `environment` | TEXT DEFAULT 'training' | `training` or `actual` |
| `cf_settled`, `cf_pnl`, `cf_market_result`, `cf_count` | -- | Counterfactual columns |
| `timestamp` | TIMESTAMPTZ | |

**`intercept_queue`** -- pending trade orders awaiting orchestrator processing

Key columns: `user_id`, `agent_id`, `market_ticker`, `side`, `action`, `count`, `price`, `confidence`, `status` (pending/processing/executed/rejected), `cycle_id` (dedup key)

### Trade Intelligence

**`trade_signals`** -- Stage 1: per-trade signal extraction (28+ columns)

Key signals: `base_rate_mentioned`, `risk_manager_endorsed`, `forecaster_probability`, `bull_word_count`, `bear_word_count`, `model_agreement`, `edge_at_entry`, `per_agent` (JSONB), `cfg_at_trade` (JSONB), `rules_at_trade` (JSONB)

**`trade_autopsies`** -- Stage 2: AI-generated post-mortem

Key columns: `failure_mode`, `decision_quality` (GOOD_PROCESS/ACCEPTABLE/POOR_PROCESS), `narrative`, `agent_scores` (JSONB), `key_excerpt`, `model_used`, `cost_usd`, `prompt_version`

### Wiki System

**`wiki_pages`** -- AI-maintained knowledge pages

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID | NULL = platform-level page |
| `page_type` | TEXT | `dashboard`, `bot`, `category`, `agent`, `trade`, `pattern`, `sweep` |
| `page_key` | TEXT | Slug identifier |
| `frontmatter` | JSONB | Structured metadata |
| `content_md` | TEXT | Markdown narrative |
| `data_snapshot` | JSONB | Charts/tables data |
| `version` | INTEGER DEFAULT 1 | |

Unique: `(user_id, page_type, page_key)`

**`wiki_log`** -- append-only pipeline audit trail

**`wiki_snapshots`** -- weekly performance metrics per entity

**`wiki_sweep_history`** -- append-only parameter sweep snapshots

**`wiki_pattern_snapshots`** -- append-only pattern detection history

### Portfolio & Analytics

**`portfolio_snapshots`** -- 5-minute interval portfolio state (`total_value`, `daily_pnl`, `cash_balance`, `positions_value`, `agent_values` JSONB)

**`log_entries`** -- agent runtime logs (`level`: info/warn/error/trade)

**`api_costs`** -- LLM API cost tracking per agent

### Governance

**`rules`** -- per-user trading rules (one row per user)

Key fields: `max_trade_size`, `max_capital_per_agent`, `daily_loss_limit`, `max_concurrent_positions`, `min_confidence`, `allowed_categories` (JSONB), `blocked_tickers` (JSONB), `ai_validation_enabled`, `schedule_interval_minutes`, `daily_api_budget`, `live_trading_enabled`, `twitter_posting_enabled`

**`deployment_snapshots`** -- immutable config snapshots frozen at deploy time

**`bot_config_history`** -- append-only changelog for bot config edits

**`platform_code_history`** -- global changelog for hardcoded bot defaults/prompt changes

**`audit_log`** -- system-wide event log

### Social

**`twitter_posts`** -- trade-to-tweet tracking (one tweet per trade, retry support)

**`oauth_state`** -- PKCE state for OAuth 2.0 flows (Twitter)

### RLS Policy Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `bot_types` | All authenticated | -- | -- | -- |
| `user_profiles` | Own row | Own row | Own row | -- |
| `user_agents` | Own rows | Own rows | Own rows | -- |
| `credentials` | Own rows | Own rows | -- | Own rows |
| `trades` | Own rows | -- | -- | -- |
| `rules` | Own rows | -- | Own rows | -- |
| `wiki_pages` | Own + platform (user_id IS NULL) | -- | -- | -- |
| `bot_config_history` | Own rows | Own rows | -- | -- |
| `platform_code_history` | All authenticated | -- | -- | -- |

### Migration Timeline

| Migration | Key Milestone |
|---|---|
| 001 | Initial schema: credentials, agents, rules, trades, logs, snapshots |
| 005 | Multi-user conversion: Supabase Auth, RLS, user_profiles, bot_types |
| 016 | Polymarket exchange support |
| 017 | Queue-based worker architecture, deployment_snapshots |
| 022 | Per-credential encryption salt (v3) |
| 029 | Tail Buyer bot types |
| 030 | Trade Intelligence Wiki: trade_signals, trade_autopsies, wiki_pages |
| 033 | Pipeline traceability: pipeline_run_id, sweep/pattern history |
| 034 | Config change tracking: bot_config_history, platform_code_history |
| 037 | Extended trade_signals (28 new quant columns) |

### Entity Relationships

```
auth.users (PK: id)
    |-- user_profiles (1:1)
    |-- user_agents (1:N, per bot_type)
    |       |-- trades (1:N)
    |       |       |-- trade_signals (1:1)
    |       |       |-- trade_autopsies (1:1)
    |       |       |-- twitter_posts (1:1)
    |       |-- intercept_queue (1:N)
    |       |-- deployment_snapshots (1:N)
    |       |-- bot_config_history (1:N)
    |-- credentials (1:N)
    |-- rules (1:1)
    |-- portfolio_snapshots (1:N)
    |-- wiki_pages (1:N, + platform-level)
    |-- audit_log (1:N)

bot_types (PK: id)
    |-- user_agents.bot_type_id (FK)
    |-- platform_code_history.bot_type_id (FK)
```

---

## API Endpoints

### Agents

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/agents/types` | JWT | List bot types |
| GET | `/api/agents` | JWT | List user's agents |
| GET | `/api/agents/{id}` | JWT | Agent detail |
| POST | `/api/agents/deploy` | JWT | Deploy/start an agent |
| POST | `/api/agents/{id}/pause` | JWT | Pause agent |
| POST | `/api/agents/{id}/kill` | JWT | Force-stop agent |
| GET | `/api/agents/{id}/metrics` | JWT | Performance metrics |
| PATCH | `/api/agents/{id}/config` | JWT | Update config |
| GET | `/api/agents/{id}/config-history` | JWT | Config changelog |
| GET | `/api/agents/platform-code-history` | JWT | Platform code changes |

### Trades

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/trades` | JWT | List with filtering/pagination |
| GET | `/api/trades/{id}` | JWT | Trade detail |
| GET | `/api/trades/stats` | JWT | Aggregated statistics |
| GET | `/api/trades/by-market` | JWT | Positions by market |

### Portfolio

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/portfolio` | JWT | Summary (value, P&L, counts) |
| GET | `/api/portfolio/snapshots` | JWT | Time-series for charts |
| GET | `/api/portfolio/balance` | JWT | Exchange balances |
| GET | `/api/portfolio/stats` | JWT | Extended stats with positions |

### Rules & Credentials

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/PUT | `/api/rules` | JWT | Get/update trading rules |
| GET | `/api/credentials` | JWT | List credentials (masked) |
| POST | `/api/credentials` | JWT+MFA | Store encrypted credential |
| DELETE | `/api/credentials/{id}` | JWT+MFA | Delete credential |

### Markets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/markets` | JWT | List markets |
| GET | `/api/markets/categories` | JWT | Categories with counts |

### Wiki & Evaluations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/wiki/dashboard` | JWT | Overview |
| GET | `/api/wiki/log` | JWT | Pipeline activity |
| GET | `/api/wiki/bots`, `/api/wiki/bots/{id}` | JWT | Bot wiki pages |
| GET | `/api/wiki/categories/{key}` | JWT | Category pages |
| GET | `/api/wiki/agents/{role}` | JWT | Agent role pages |
| GET | `/api/wiki/patterns` | JWT | Detected patterns |
| GET | `/api/wiki/sweep` | JWT | Sweep results |
| GET | `/api/wiki/aggregates` | JWT | Aggregated metrics |
| GET | `/api/wiki/analysis/latest` | JWT | Latest weekly analysis |

### Other

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Health check |
| GET | `/api/audit` | JWT | Audit log |
| GET | `/api/public/trades/{id}` | None | Public shared trade |
| POST | `/api/twitter/oauth/authorize` | JWT | Start OAuth PKCE flow |
| WS | `/ws` | JWT | Real-time events |

---

## Security

### Encryption
- **AES-256-GCM** with per-credential random salt (v3), 100K PBKDF2 iterations
- Master key rotation via `OLD_MASTER_KEY` with zero-downtime re-encryption
- Bot subprocess credentials in temp files (`0400` permissions), not environment variables

### Authentication Layers

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| User | Supabase JWT (ES256 JWKS or HS256) | All `/api/` user endpoints |
| Bot | `X-Bot-Token` (SHA256, constant-time comparison) | Intercept, log, status |
| Worker | `X-Cycle-Token` + `X-Worker-Token` fallback | Job config, credentials, heartbeat |
| MFA | Supabase AAL2 (TOTP) | Credential CRUD |

### Rate Limiting (slowapi)

| Scope | Limit |
|-------|-------|
| User endpoints | 120 req/min per IP |
| Public endpoints | 30 req/min per IP |
| Bot/worker endpoints | Exempt |

### Security Headers (Frontend)

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### Error Tracking
- Backend: Sentry (error tracking only, `traces_sample_rate=0.0`)
- Frontend: `@sentry/nextjs`

---

## Environment Variables

### Backend API

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Supabase Postgres connection string |
| `MASTER_KEY` | Yes | AES-256 encryption key (min 32 chars) |
| `OLD_MASTER_KEY` | No | Previous key for rotation |
| `SUPABASE_URL` | Yes (prod) | Enables JWKS ES256 verification |
| `SUPABASE_JWT_SECRET` | Yes (prod) | HS256 fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Admin operations |
| `KALSHI_ENVIRONMENT` | No | `demo` (default) or `production` |
| `FRONTEND_URL` | No | CORS origin (default: `http://localhost:3000`) |
| `SENTRY_DSN` | No | Error tracking |
| `DOPPLER_TOKEN` | No | Enables `doppler run --` at startup |

### Queue Worker

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection for arq |
| `AGENT_FUND_BACKEND_URL` | Yes | Backend URL for log forwarding |
| `WORKER_SHARED_SECRET` | Yes | X-Worker-Token auth |
| `MASTER_KEY` | Yes | For credential temp file writing |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Backend URL for `/api/:path*` rewrite |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client-side auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side auth |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Error tracking |

---

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js | 14.2.35 |
| UI Library | React | ^18 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^3.4.1 |
| Data Fetching | SWR | ^2.4.1 |
| Charts | Recharts / Lightweight Charts | ^2.15.0 / ^5.1.0 |
| Icons | Lucide React | ^0.577.0 |
| Auth (Client) | Supabase SSR | ^0.9.0 |
| Error Tracking | Sentry | ^8.55.1 |
| Backend Framework | FastAPI | ~0.115.0 |
| Backend Runtime | Python | >=3.11 |
| Database | PostgreSQL (Supabase) | -- |
| Database Driver | asyncpg | ~0.30.0 |
| Task Queue | Redis + arq | ~0.26.0 |
| Encryption | cryptography (AES-256-GCM) | ~43.0.0 |
| LLM SDKs | openai / anthropic | ~1.50.0 / ~0.37.0 |
| Rate Limiting | slowapi | ~0.1.9 |
| Scheduling | APScheduler | ~3.10 |
| Twitter | Tweepy | ~4.14.0 |
| Deployment | Vercel (frontend) + Railway (backend) | -- |

---

## Getting Started (Local Dev)

### Prerequisites

- Node.js >= 18
- Python >= 3.11
- PostgreSQL (or Supabase project)
- Redis (optional, for task queue)

### Install

```bash
git clone <repo-url> prediction-market-agents
cd prediction-market-agents

# Frontend
npm install

# Backend
cd backend
pip install -e .
cd ..
```

### Environment Setup

**Frontend** -- create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Backend** -- create `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
MASTER_KEY=your-32-char-encryption-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
KALSHI_ENVIRONMENT=demo
ALLOW_DEFAULT_KEY=1
ALLOW_DEV_AUTH=1
```

### Run

```bash
# Terminal 1: Frontend (port 3000)
npm run dev

# Terminal 2: Backend (port 8000)
cd backend
uvicorn app.main:app --reload --port 8000
```

### URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| WebSocket | ws://localhost:8000/ws |

---

## Project Structure

```
prediction-market-agents/
|-- src/                          # Next.js frontend
|   |-- app/
|   |   |-- (auth)/               # Auth pages (login, signup, mfa, onboarding)
|   |   |-- (dashboard)/          # Dashboard pages (auth-gated)
|   |   |   |-- portfolio/
|   |   |   |-- strategy/[id]/
|   |   |   |-- trades/[id]/
|   |   |   |-- evaluations/      # visuals, analysis, trades, sweep, activity
|   |   |   |-- memory/           # bot, category, agent, pattern, sweep
|   |   |   |-- terminal/
|   |   |   |-- leaderboard/
|   |   |   |-- settings/
|   |   |-- t/[id]/               # Public shared trade
|   |   |-- about/, privacy/, terms/
|   |-- components/               # UI components
|   |   |-- nav.tsx, bottom-nav.tsx
|   |   |-- walkthrough/          # Guided tour
|   |   |-- exchanges/            # Credential connection
|   |   |-- signals/, trades/     # Domain components
|   |-- context/                  # React context providers
|   |   |-- auth.tsx, walkthrough.tsx, demo-mode.tsx
|   |-- hooks/                    # Data fetching hooks
|   |   |-- use-trades.ts, use-portfolio.ts, use-agents.ts, use-wiki.ts
|   |-- lib/                      # Utilities
|   |   |-- api.ts                # Centralized API client
|   |   |-- websocket.ts          # WebSocket manager
|   |   |-- supabase.ts           # Supabase client
|   |   |-- demo-data.ts          # Walkthrough demo data
|
|-- backend/                      # Python FastAPI backend
|   |-- app/
|   |   |-- main.py               # Entry point, lifespan, middleware
|   |   |-- config.py             # Pydantic settings
|   |   |-- database.py           # asyncpg pool + self-healing DDL
|   |   |-- auth.py               # JWT, bot token, MFA validation
|   |   |-- routers/              # API route handlers
|   |   |-- services/             # Business logic
|   |   |   |-- orchestrator.py   # Trade processing + settlement
|   |   |   |-- rules_engine.py   # 11 hard rules
|   |   |   |-- encryption.py     # AES-256-GCM
|   |   |   |-- wiki_pipeline.py  # Multi-stage evaluation pipeline
|   |   |   |-- wiki_scheduler.py # APScheduler cron
|   |-- bot_runner/               # Subprocess management
|   |-- kalshi/                   # Kalshi REST client (RSA-PSS auth)
|   |-- polymarket/               # Polymarket CLOB client (ECDSA)
|   |-- twitter_poster/           # Twitter posting service
|   |-- worker.py                 # arq worker entry point
|   |-- supabase/migrations/      # 39 SQL migrations
|
|-- bots/                         # Trading bot implementations
|   |-- kalshi-v2/                # Council V2 (Kalshi)
|   |-- polymarket-v2/            # Council V2 (Polymarket)
|   |-- superforecaster-kalshi/   # Superforecaster (Kalshi)
|   |-- superforecaster-poly/     # Superforecaster (Polymarket)
|   |-- tail-buyer-kalshi/        # Tail Buyer (Kalshi)
|   |-- tail-buyer-poly/          # Tail Buyer (Polymarket)
|
|-- docs/images/                   # Screenshots + demo thumbnail for the README
|-- tailwind.config.ts            # Design system
|-- package.json                  # Frontend dependencies
|-- .env.example                  # All environment variables (no secrets)
|-- LICENSE                       # MIT
|-- NOTICE                        # Third-party attributions
```

---

## License

Released under the [MIT License](LICENSE).

This project's Kalshi trading-agent implementation is derived from the
MIT-licensed [ryanfrigo/kalshi-ai-trading-bot](https://github.com/ryanfrigo/kalshi-ai-trading-bot);
its copyright notice is retained in [LICENSE](LICENSE) and [NOTICE](NOTICE).

> **Disclaimer.** This software is provided for educational and informational
> purposes only and is **not** financial advice. Trading on prediction markets
> carries risk of loss. You are solely responsible for your own trading
> decisions, for complying with the laws and exchange terms that apply to you,
> and for the security of your API keys and funds. Run in **training/demo mode**
> first; use **live mode** at your own risk.
