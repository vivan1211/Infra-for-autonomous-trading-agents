-- 005_multi_user.sql
-- Convert from single-tenant to multi-user architecture.
-- Uses Supabase Auth (auth.users) for user identity.
-- Current data is dummy — this migration drops and recreates tables cleanly.

-- ============================================================================
-- 1. Drop old tables (order matters for FK dependencies)
-- ============================================================================
DROP TABLE IF EXISTS api_costs CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS intercept_queue CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS rules CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

-- ============================================================================
-- 2. New tables
-- ============================================================================

-- ── User Profiles (extends Supabase auth.users) ────────────────────────────
CREATE TABLE user_profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Bot Types (read-only registry of available bot implementations) ─────────
CREATE TABLE bot_types (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    repo_url    TEXT,
    repo_slug   TEXT,
    description TEXT,
    strategy    TEXT,
    llms        TEXT
);

-- ── User Agents (per-user bot instances with runtime state) ─────────────────
CREATE TABLE user_agents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bot_type_id       TEXT NOT NULL REFERENCES bot_types(id),
    status            TEXT NOT NULL DEFAULT 'idle',       -- idle | running | paused | error
    mode              TEXT NOT NULL DEFAULT 'paper',      -- paper | live
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
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, bot_type_id)
);

CREATE INDEX user_agents_user_id_idx ON user_agents(user_id);

-- ── Credentials ─────────────────────────────────────────────────────────────
CREATE TABLE credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,    -- kalshi | openai | anthropic | xai | openrouter | octagon | newsapi
    label           TEXT NOT NULL,
    key_type        TEXT NOT NULL DEFAULT 'api_key',  -- api_key | private_key | wallet
    encrypted_value TEXT NOT NULL,
    iv              TEXT NOT NULL,
    last_four       TEXT,
    agent_id        UUID REFERENCES user_agents(id) ON DELETE CASCADE,  -- NULL = account-level, set = bot-specific
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    environment     TEXT NOT NULL DEFAULT 'demo',  -- demo | live
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider, key_type, environment)
);

CREATE INDEX credentials_user_id_idx ON credentials(user_id);

-- ── Trades ──────────────────────────────────────────────────────────────────
CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    market_ticker   TEXT NOT NULL,
    market_title    TEXT,
    category        TEXT,
    side            TEXT NOT NULL,    -- yes | no
    action          TEXT NOT NULL,    -- buy | sell
    count           INTEGER NOT NULL DEFAULT 1,
    price           NUMERIC(8,4) NOT NULL,
    total_cost      NUMERIC(12,2) NOT NULL,
    confidence      NUMERIC(4,3),
    bot_reasoning   TEXT,
    raw_reasoning   TEXT,
    rules_result    TEXT,
    ai_verdict      TEXT,
    ai_reasoning    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | executed | paper | rejected | error
    kalshi_order_id TEXT,
    pnl             NUMERIC(12,2),
    settled         BOOLEAN NOT NULL DEFAULT FALSE,
    environment     TEXT NOT NULL DEFAULT 'training',  -- training | actual
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trades_user_id_idx ON trades(user_id);
CREATE INDEX trades_agent_id_idx ON trades(agent_id);
CREATE INDEX trades_timestamp_idx ON trades(timestamp DESC);
CREATE INDEX trades_status_idx ON trades(status);
CREATE INDEX trades_environment_idx ON trades(environment);

-- ── Rules (per-user) ────────────────────────────────────────────────────────
CREATE TABLE rules (
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
    daily_api_budget            NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    live_trading_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX rules_user_id_idx ON rules(user_id);

-- ── Log Entries ─────────────────────────────────────────────────────────────
CREATE TABLE log_entries (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level       TEXT NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'training'
);

CREATE INDEX log_entries_user_id_idx ON log_entries(user_id);
CREATE INDEX log_entries_agent_id_idx ON log_entries(agent_id);
CREATE INDEX log_entries_timestamp_idx ON log_entries(timestamp DESC);
CREATE INDEX log_entries_environment_idx ON log_entries(environment);

-- ── Portfolio Snapshots ─────────────────────────────────────────────────────
CREATE TABLE portfolio_snapshots (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_value  NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    daily_pnl    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    agent_values JSONB DEFAULT '{}',
    environment  TEXT NOT NULL DEFAULT 'training'
);

CREATE INDEX portfolio_snapshots_user_id_idx ON portfolio_snapshots(user_id);
CREATE INDEX portfolio_snapshots_timestamp_idx ON portfolio_snapshots(timestamp DESC);

-- ── Intercept Queue ─────────────────────────────────────────────────────────
CREATE TABLE intercept_queue (
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
    environment         TEXT NOT NULL DEFAULT 'training',
    decision_result     TEXT,
    rejection_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);

CREATE INDEX intercept_queue_user_id_idx ON intercept_queue(user_id);
CREATE INDEX intercept_queue_status_idx ON intercept_queue(status);
CREATE INDEX intercept_queue_agent_id_idx ON intercept_queue(agent_id);
CREATE INDEX intercept_queue_created_at_idx ON intercept_queue(created_at DESC);

-- ── API Costs ───────────────────────────────────────────────────────────────
CREATE TABLE api_costs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,
    model           TEXT,
    estimated_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost  NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX api_costs_user_id_idx ON api_costs(user_id);
CREATE INDEX api_costs_agent_id_idx ON api_costs(agent_id);
CREATE INDEX api_costs_timestamp_idx ON api_costs(timestamp DESC);

-- ── Audit Log ───────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable for system events
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category        TEXT NOT NULL,
    agent_id        UUID REFERENCES user_agents(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    detail_json     JSONB DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'success',
    duration_ms     INTEGER,
    source          TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX audit_log_timestamp_idx ON audit_log(timestamp DESC);
CREATE INDEX audit_log_category_idx ON audit_log(category);
CREATE INDEX audit_log_agent_id_idx ON audit_log(agent_id);

-- ============================================================================
-- 3. Row-Level Security
-- ============================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercept_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_types ENABLE ROW LEVEL SECURITY;

-- Bot types: readable by all authenticated users
CREATE POLICY bot_types_read ON bot_types FOR SELECT TO authenticated USING (true);

-- User profiles: users can read/write their own
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User agents: users can manage their own
CREATE POLICY user_agents_select ON user_agents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_agents_insert ON user_agents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_agents_update ON user_agents FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Credentials: users can manage their own (backend uses service_role to bypass)
CREATE POLICY credentials_select ON credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY credentials_insert ON credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY credentials_delete ON credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trades: users can read their own
CREATE POLICY trades_select ON trades FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Rules: users can read/write their own
CREATE POLICY rules_select ON rules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY rules_update ON rules FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Log entries: users can read their own
CREATE POLICY log_entries_select ON log_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Portfolio snapshots: users can read their own
CREATE POLICY portfolio_snapshots_select ON portfolio_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Intercept queue: users can read their own
CREATE POLICY intercept_queue_select ON intercept_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- API costs: users can read their own
CREATE POLICY api_costs_select ON api_costs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Audit log: users can read their own
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- 4. Seed bot types
-- ============================================================================
INSERT INTO bot_types (id, name, repo_url, repo_slug, description, strategy, llms) VALUES
    ('octagon-deep', 'OctagonAI Deep Trader',
     'https://github.com/OctagonAI/kalshi-deep-trading-bot',
     'OctagonAI/kalshi-deep-trading-bot',
     'Deep analysis Kalshi trading bot using Octagon Research API for market intelligence and multi-factor analysis.',
     'Deep research analysis with Octagon API data feeds, multi-factor scoring model',
     'GPT-4o + Octagon Research'),
    ('ensemble-5', 'Council',
     'https://github.com/ryanfrigo/kalshi-ai-trading-bot',
     'ryanfrigo/kalshi-ai-trading-bot',
     '5 LLMs debate every trade. Majority rules. No single model decides.',
     '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
     'Claude + GPT-4o + Gemini + DeepSeek + Grok'),
    ('genai-simple', 'Grok Simple Trader',
     'https://github.com/ajwann/kalshi-genai-trading-bot',
     'ajwann/kalshi-genai-trading-bot',
     'Lightweight GenAI trading bot using Grok for market analysis with simple position sizing.',
     'Single LLM analysis (Grok) with direct yes/no signal generation',
     'Grok (xAI)')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. Auto-setup trigger: when a new user signs up, create their profile,
--    default rules, and idle bot instances
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id) VALUES (NEW.id);
    INSERT INTO public.rules (user_id) VALUES (NEW.id);
    INSERT INTO public.user_agents (user_id, bot_type_id)
        SELECT NEW.id, id FROM public.bot_types;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
