-- Agent Fund Database Schema (Multi-User)
-- Uses Supabase Auth (auth.users) for user identity.
-- Run this in your Supabase SQL Editor to create all required tables.

-- ── User Profiles (extends auth.users) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Bot Types (read-only registry of available bot implementations) ─────────
CREATE TABLE IF NOT EXISTS bot_types (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    repo_url      TEXT,
    repo_slug     TEXT,
    description   TEXT,
    strategy      TEXT,
    llms          TEXT,
    exchange      TEXT,
    full_name     TEXT,
    accent_color  TEXT,
    bg_tint       TEXT,
    deprecated    BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── User Agents (per-user bot instances with runtime state) ─────────────────
CREATE TABLE IF NOT EXISTS user_agents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bot_type_id       TEXT NOT NULL REFERENCES bot_types(id),
    status            TEXT NOT NULL DEFAULT 'idle',       -- idle | running | paused | error
    mode              TEXT NOT NULL DEFAULT 'training' CHECK (mode IN ('training', 'live')),
    capital_allocated NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    capital_used      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_pnl         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    trade_count       INTEGER NOT NULL DEFAULT 0,
    win_count         INTEGER NOT NULL DEFAULT 0,
    pid               INTEGER,
    started_at        TIMESTAMPTZ,
    config_json       JSONB,
    cycle_running     BOOLEAN NOT NULL DEFAULT FALSE,
    cycle_started_at  TIMESTAMPTZ,
    bot_token         TEXT,
    next_run_at           TIMESTAMPTZ,
    last_cycle_started_at TIMESTAMPTZ,
    cycle_lease_expires_at TIMESTAMPTZ,
    active_cycle_id       UUID,
    last_completed_cycle_id UUID,
    cycle_token_hash      TEXT,
    last_heartbeat_at     TIMESTAMPTZ,
    config_snapshot_id    UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, bot_type_id)
);

CREATE INDEX IF NOT EXISTS user_agents_user_id_idx ON user_agents(user_id);

-- ── Credentials ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,
    label           TEXT NOT NULL,
    key_type        TEXT NOT NULL DEFAULT 'api_key',
    encrypted_value TEXT NOT NULL,
    iv              TEXT NOT NULL,
    last_four       TEXT,
    agent_id        UUID REFERENCES user_agents(id) ON DELETE CASCADE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider, key_type)
);

CREATE INDEX IF NOT EXISTS credentials_user_id_idx ON credentials(user_id);

-- ── Trades ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    market_ticker   TEXT NOT NULL,
    market_title    TEXT,
    category        TEXT,
    side            TEXT NOT NULL,
    action          TEXT NOT NULL,
    count           INTEGER NOT NULL DEFAULT 1,
    price           NUMERIC(8,4) NOT NULL,
    current_price   NUMERIC(8,4),                         -- latest fair-value price for the held side (overwritten on refresh)
    current_price_at TIMESTAMPTZ,                         -- when current_price was last refreshed
    total_cost      NUMERIC(12,2) NOT NULL,
    confidence      NUMERIC(4,3),
    bot_reasoning   TEXT,
    raw_reasoning   TEXT,
    rules_result    TEXT,
    ai_verdict      TEXT,
    ai_reasoning    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    kalshi_order_id TEXT,
    exchange        TEXT NOT NULL DEFAULT 'kalshi',
    exchange_order_id TEXT,
    pnl             NUMERIC(12,2),
    settled         BOOLEAN NOT NULL DEFAULT FALSE,
    environment     TEXT NOT NULL DEFAULT 'training',
    market_close_time TIMESTAMPTZ,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at      TIMESTAMPTZ,
    model           TEXT,
    -- Counterfactual tracking: what would have happened for skipped/rejected trades
    cf_settled      BOOLEAN NOT NULL DEFAULT FALSE,
    cf_pnl          NUMERIC(12,2),
    cf_market_result TEXT,
    cf_settled_at   TIMESTAMPTZ,
    cf_count        INTEGER
);

CREATE INDEX IF NOT EXISTS trades_user_id_idx ON trades(user_id);
CREATE INDEX IF NOT EXISTS trades_agent_id_idx ON trades(agent_id);
CREATE INDEX IF NOT EXISTS trades_timestamp_idx ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS trades_status_idx ON trades(status);
CREATE INDEX IF NOT EXISTS trades_environment_idx ON trades(environment);
CREATE INDEX IF NOT EXISTS trades_settlement_idx ON trades(user_id, settled, status);
CREATE INDEX IF NOT EXISTS trades_settled_at_idx ON trades(settled_at);
CREATE INDEX IF NOT EXISTS trades_cf_settlement_idx ON trades(user_id, cf_settled, status)
    WHERE status IN ('skipped', 'rejected', 'error');

-- ── Rules (per-user) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rules (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    max_trade_size              NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    max_capital_per_agent       NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
    daily_loss_limit            NUMERIC(10,2) NOT NULL DEFAULT 200.00,
    max_concurrent_positions    INTEGER NOT NULL DEFAULT 10,
    min_confidence              NUMERIC(4,3) NOT NULL DEFAULT 0.65,
    allowed_categories          JSONB DEFAULT '[]'::jsonb,
    blocked_tickers             JSONB DEFAULT '[]',
    ai_validation_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    ai_validation_mode          TEXT NOT NULL DEFAULT 'enforced',
    ai_validator_credential_id  UUID REFERENCES credentials(id) ON DELETE SET NULL,
    ai_validation_prompt        TEXT,
    schedule_interval_minutes   INTEGER NOT NULL DEFAULT 5,
    schedule_active_hours       JSONB DEFAULT '{"start": "00:00", "end": "23:59"}',
    schedule_active_days        JSONB DEFAULT '[1,2,3,4,5,6,7]',
    cooldown_hours              INTEGER NOT NULL DEFAULT 0,
    max_trades_per_day          INTEGER NOT NULL DEFAULT 50,
    max_trades_per_market       INTEGER NOT NULL DEFAULT 0,
    daily_api_budget            NUMERIC(10,2) NOT NULL DEFAULT 300.00,
    live_trading_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    twitter_posting_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS rules_user_id_idx ON rules(user_id);

-- ── Twitter Posts (trade-to-tweet tracking) ────────────────────────────────
CREATE TABLE IF NOT EXISTS twitter_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    tweet_ids       JSONB,
    thread_content  TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error           TEXT,
    retry_count     INTEGER DEFAULT 0,
    posted_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(trade_id)
);
ALTER TABLE twitter_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY twitter_posts_user_isolation ON twitter_posts
    FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_twitter_posts_user_status ON twitter_posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_twitter_posts_trade ON twitter_posts(trade_id);

-- ── Log Entries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS log_entries (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level       TEXT NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'training'
);

CREATE INDEX IF NOT EXISTS log_entries_user_id_idx ON log_entries(user_id);
CREATE INDEX IF NOT EXISTS log_entries_agent_id_idx ON log_entries(agent_id);
CREATE INDEX IF NOT EXISTS log_entries_timestamp_idx ON log_entries(timestamp DESC);

-- ── Portfolio Snapshots ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_value  NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cash_balance NUMERIC(14,2),
    positions_value NUMERIC(14,2),
    daily_pnl    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    agent_values JSONB DEFAULT '{}',
    environment  TEXT NOT NULL DEFAULT 'training',
    exchange     TEXT  -- NULL = combined total, 'kalshi' or 'polymarket' = per-exchange
);

CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_id_idx ON portfolio_snapshots(user_id);
CREATE INDEX IF NOT EXISTS portfolio_snapshots_timestamp_idx ON portfolio_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS portfolio_snapshots_composite_idx ON portfolio_snapshots(user_id, environment, exchange, timestamp DESC);

-- ── Intercept Queue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intercept_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id            UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    market_ticker       TEXT NOT NULL DEFAULT '',
    side                TEXT NOT NULL DEFAULT '',
    action              TEXT NOT NULL DEFAULT 'buy',
    count               INTEGER NOT NULL DEFAULT 1,
    order_type          TEXT NOT NULL DEFAULT 'market',
    yes_price           NUMERIC(8,2),
    no_price            NUMERIC(8,2),
    buy_max_cost        NUMERIC(12,2),
    client_order_id     TEXT,
    raw_reasoning       TEXT,
    price               NUMERIC(8,4),
    status              TEXT NOT NULL DEFAULT 'pending',
    kalshi_order_id     TEXT,
    exchange            TEXT NOT NULL DEFAULT 'kalshi',
    environment         TEXT NOT NULL DEFAULT 'training',
    decision_result     TEXT,
    rejection_reason    TEXT,
    category            TEXT,
    confidence          FLOAT,
    market_title        TEXT,
    cycle_id            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS intercept_queue_user_id_idx ON intercept_queue(user_id);
CREATE INDEX IF NOT EXISTS intercept_queue_status_idx ON intercept_queue(status);
CREATE INDEX IF NOT EXISTS intercept_queue_agent_id_idx ON intercept_queue(agent_id);
CREATE INDEX IF NOT EXISTS intercept_queue_created_at_idx ON intercept_queue(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS intercept_queue_cycle_dedup_idx
    ON intercept_queue (agent_id, market_ticker, side, cycle_id)
    WHERE cycle_id IS NOT NULL AND status != 'cancelled';

-- ── Deployment Snapshots ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deployment_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_agent_id   UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    config_json     JSONB NOT NULL,
    rules_json      JSONB NOT NULL,
    bot_type        TEXT NOT NULL,
    mode            TEXT NOT NULL,
    capital_allocated NUMERIC NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_agent ON deployment_snapshots(user_agent_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON deployment_snapshots(user_id);

-- ── API Call Logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_call_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id),
    agent_id        UUID REFERENCES user_agents(id),
    trade_id        UUID REFERENCES trades(id),
    timestamp       TIMESTAMPTZ DEFAULT NOW(),
    model           TEXT NOT NULL,
    role            TEXT,
    prompt          TEXT NOT NULL,
    response        TEXT NOT NULL,
    tokens_used     INTEGER,
    cost_usd        NUMERIC,
    market_ticker   TEXT,
    environment     TEXT DEFAULT 'demo'
);

CREATE INDEX IF NOT EXISTS api_call_logs_user_idx ON api_call_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS api_call_logs_agent_idx ON api_call_logs(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS api_call_logs_market_idx ON api_call_logs(market_ticker, timestamp DESC);

-- ── API Costs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_costs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,
    model           TEXT,
    estimated_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost  NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_costs_user_id_idx ON api_costs(user_id);
CREATE INDEX IF NOT EXISTS api_costs_agent_id_idx ON api_costs(agent_id);
CREATE INDEX IF NOT EXISTS api_costs_timestamp_idx ON api_costs(timestamp DESC);

-- ── Audit Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category        TEXT NOT NULL,
    agent_id        UUID REFERENCES user_agents(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    detail_json     JSONB DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'success',
    duration_ms     INTEGER,
    source          TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_log_category_idx ON audit_log(category);
CREATE INDEX IF NOT EXISTS audit_log_agent_id_idx ON audit_log(agent_id);

-- ── Bot Config History ─────────────────────────────────────────────────────
-- Per-user changelog for bot settings. One row per dashboard save or deploy
-- event. Scoped to bot owner via user_id + RLS.
-- agent_id uses ON DELETE SET NULL so audit history survives bot deletion
-- (compliance / post-mortem). bot_type_id_snapshot preserves which bot type
-- the change applied to, even after the user_agent row is gone.
CREATE TABLE IF NOT EXISTS bot_config_history (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id                  UUID REFERENCES user_agents(id) ON DELETE SET NULL,
    bot_type_id_snapshot      TEXT,
    source                    TEXT NOT NULL CHECK (source IN ('dashboard', 'deploy')),
    config_json_before        JSONB,
    config_json_after         JSONB NOT NULL,
    capital_allocated_before  NUMERIC(12,2),
    capital_allocated_after   NUMERIC(12,2),
    mode_before               TEXT,
    mode_after                TEXT,
    changed_fields            JSONB NOT NULL,
    changed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_config_history_agent_time_idx ON bot_config_history(agent_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS bot_config_history_user_idx ON bot_config_history(user_id);
CREATE INDEX IF NOT EXISTS bot_config_history_bot_type_idx ON bot_config_history(bot_type_id_snapshot);

-- ── Platform Code History ──────────────────────────────────────────────────
-- Global changelog for hardcoded bot defaults and LLM prompts. One row per
-- bot_type whenever the backend detects a change in the underlying Python
-- code. Readable by any authenticated user (same access model as bot_types).
CREATE TABLE IF NOT EXISTS platform_code_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_type_id      TEXT NOT NULL REFERENCES bot_types(id) ON DELETE CASCADE,
    content_hash     TEXT NOT NULL,
    code_state       JSONB NOT NULL,
    previous_state   JSONB,
    changed_fields   JSONB NOT NULL,
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    git_commit_sha   TEXT
);

CREATE INDEX IF NOT EXISTS platform_code_history_bot_type_time_idx ON platform_code_history(bot_type_id, detected_at DESC);

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercept_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_code_history ENABLE ROW LEVEL SECURITY;

-- Bot types: readable by all authenticated users
CREATE POLICY bot_types_read ON bot_types FOR SELECT TO authenticated USING (true);

-- User profiles: own data only
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User agents: own data only
CREATE POLICY user_agents_select ON user_agents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_agents_insert ON user_agents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_agents_update ON user_agents FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Credentials: own data only (backend uses service_role)
CREATE POLICY credentials_select ON credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY credentials_insert ON credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY credentials_delete ON credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trades: read own
CREATE POLICY trades_select ON trades FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Rules: own data only
CREATE POLICY rules_select ON rules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY rules_update ON rules FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Log entries: read own
CREATE POLICY log_entries_select ON log_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Portfolio snapshots: read own
CREATE POLICY portfolio_snapshots_select ON portfolio_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Intercept queue: read own
CREATE POLICY intercept_queue_select ON intercept_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- API costs: read own
CREATE POLICY api_costs_select ON api_costs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Audit log: read own
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Bot config history: own data only
CREATE POLICY bot_config_history_select ON bot_config_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY bot_config_history_insert ON bot_config_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Platform code history: readable by all authenticated users (same access model as bot_types)
CREATE POLICY platform_code_history_select ON platform_code_history FOR SELECT TO authenticated USING (true);

-- ── Seed Data ───────────────────────────────────────────────────────────────
INSERT INTO bot_types (id, name, full_name, description, strategy, llms, exchange, accent_color, bg_tint, deprecated) VALUES
    ('ensemble-5', 'Council', '5-Model Ensemble Council',
     '5 LLMs debate every trade. Majority rules. No single model decides.',
     '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
     'Grok, Claude, GPT, Gemini, DeepSeek', 'kalshi', '#4ade80', '#7de964', TRUE),
    ('polymarket-council', 'Council (Polymarket)', '5-Model Ensemble Council — Polymarket',
     '5 LLMs debate every trade on Polymarket. Same AI pipeline as Kalshi Council, different exchange.',
     '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
     'Grok, Claude, GPT, Gemini, DeepSeek', 'polymarket', '#f59e0b', '#ffc657', TRUE),
    ('polymarket-v2', 'Council V2 (Poly)', 'Council V2 — Polymarket',
     '5 LLMs debate every trade on Polymarket. Faster pipeline, tighter edge filtering.',
     '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4) with Perplexity research and confidence-weighted edge filtering',
     'Grok 4.1 Fast, Claude Opus 4.7, GPT-5.4', 'polymarket', '#22d3ee', '#67e8f9', FALSE),
    ('kalshi-v2', 'Council V2 (Kalshi)', 'Council V2 — Kalshi',
     '5 LLMs debate every trade on Kalshi. Faster pipeline, tighter edge filtering.',
     '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4) with Perplexity research and confidence-weighted edge filtering',
     'Grok 4.1 Fast, Claude Opus 4.7, GPT-5.4', 'kalshi', '#60a5fa', '#93c5fd', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── Auto-Setup Trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
    INSERT INTO user_profiles (id) VALUES (NEW.id);
    INSERT INTO rules (user_id) VALUES (NEW.id);
    INSERT INTO user_agents (user_id, bot_type_id)
        SELECT NEW.id, id FROM bot_types;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
