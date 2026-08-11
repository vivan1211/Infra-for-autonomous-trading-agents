-- 002_schema_sync.sql — Bring production in sync with schema.sql
-- Run in Supabase SQL Editor (idempotent — safe to run multiple times)

-- 1. AGENTS: Add missing columns
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cycle_running BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cycle_started_at TIMESTAMPTZ;

-- 2. RULES: Add ALL missing columns
ALTER TABLE rules ADD COLUMN IF NOT EXISTS cooldown_hours INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS max_trades_per_day INTEGER NOT NULL DEFAULT 50;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS daily_api_budget NUMERIC(10,2) NOT NULL DEFAULT 50.00;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS live_trading_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. TRADES: Add missing columns
ALTER TABLE trades ADD COLUMN IF NOT EXISTS raw_reasoning TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'training';
CREATE INDEX IF NOT EXISTS trades_environment_idx ON trades(environment);

-- 4. LOG_ENTRIES: Add environment column
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'training';
CREATE INDEX IF NOT EXISTS log_entries_environment_idx ON log_entries(environment);

-- 5. PORTFOLIO_SNAPSHOTS: Add environment column
ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'training';

-- 6. CREDENTIALS: Add agent_id column (keep encrypted_value/iv as BYTEA)
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE;

-- 7. INTERCEPT_QUEUE: Create if not exists
CREATE TABLE IF NOT EXISTS intercept_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS intercept_queue_status_idx ON intercept_queue(status);
CREATE INDEX IF NOT EXISTS intercept_queue_agent_id_idx ON intercept_queue(agent_id);
CREATE INDEX IF NOT EXISTS intercept_queue_created_at_idx ON intercept_queue(created_at DESC);

-- 8. API_COSTS: Create if not exists
CREATE TABLE IF NOT EXISTS api_costs (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,
    model           TEXT,
    estimated_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost  NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS api_costs_agent_id_idx ON api_costs(agent_id);
CREATE INDEX IF NOT EXISTS api_costs_timestamp_idx ON api_costs(timestamp DESC);

-- 9. AUDIT_LOG: Create if not exists
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category        TEXT NOT NULL,
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    detail_json     JSONB DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'success',
    duration_ms     INTEGER,
    source          TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_log_category_idx ON audit_log(category);
CREATE INDEX IF NOT EXISTS audit_log_agent_id_idx ON audit_log(agent_id);
CREATE INDEX IF NOT EXISTS audit_log_source_idx ON audit_log(source);
CREATE INDEX IF NOT EXISTS audit_log_status_idx ON audit_log(status);

-- 10. RLS for new tables
ALTER TABLE intercept_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY intercept_queue_read ON intercept_queue FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY api_costs_read ON api_costs FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY audit_log_read ON audit_log FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
