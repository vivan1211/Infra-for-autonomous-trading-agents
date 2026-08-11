-- Agent Fund — Initial Supabase Schema
-- Run this in Supabase SQL Editor or via supabase db push

-- ============================================================
-- CREDENTIALS: Encrypted API keys (AES-256-GCM)
-- ============================================================
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,            -- 'kalshi','openai','anthropic','xai','google','deepseek','openrouter','octagon'
    label TEXT NOT NULL,
    key_type TEXT NOT NULL DEFAULT 'api_key',  -- 'api_key' or 'private_key'
    encrypted_value BYTEA NOT NULL,    -- AES-256-GCM ciphertext
    iv BYTEA NOT NULL,                 -- 12-byte nonce
    last_four TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credentials_provider ON credentials(provider);

-- ============================================================
-- AGENTS: Bot configurations and runtime state
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,               -- e.g. 'octagon-deep', 'ensemble-5', 'genai-simple'
    name TEXT NOT NULL,
    repo_url TEXT,
    repo_slug TEXT,
    description TEXT,
    strategy TEXT,
    llms TEXT,
    status TEXT DEFAULT 'stopped',     -- 'running','stopped','error'
    mode TEXT DEFAULT 'paper',         -- 'paper','live'
    capital_allocated DOUBLE PRECISION DEFAULT 0,
    capital_used DOUBLE PRECISION DEFAULT 0,
    total_pnl DOUBLE PRECISION DEFAULT 0,
    trade_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    config_json JSONB,
    pid INTEGER,
    started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RULES: Trading rules (single global row)
-- ============================================================
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY DEFAULT 'default',
    max_trade_size DOUBLE PRECISION DEFAULT 100,
    max_capital_per_agent DOUBLE PRECISION DEFAULT 2000,
    daily_loss_limit DOUBLE PRECISION DEFAULT 500,
    max_concurrent_positions INTEGER DEFAULT 10,
    min_confidence DOUBLE PRECISION DEFAULT 0.60,
    allowed_categories JSONB DEFAULT '[]'::jsonb,
    blocked_tickers JSONB DEFAULT '[]'::jsonb,
    ai_validation_enabled BOOLEAN DEFAULT TRUE,
    ai_validation_mode TEXT DEFAULT 'enforced',     -- 'advisory' or 'enforced'
    ai_validator_credential_id UUID REFERENCES credentials(id),
    ai_validation_prompt TEXT,
    schedule_interval_minutes INTEGER DEFAULT 5,
    schedule_active_hours JSONB DEFAULT '{"start":"00:00","end":"23:59"}'::jsonb,
    schedule_active_days JSONB DEFAULT '[1,2,3,4,5,6,7]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default rules row
INSERT INTO rules (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- ============================================================
-- TRADES: Every trade decision (executed, rejected, paper, etc)
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    market_ticker TEXT NOT NULL,
    market_title TEXT,
    category TEXT,
    side TEXT NOT NULL,                 -- 'yes','no'
    action TEXT NOT NULL DEFAULT 'buy', -- 'buy','sell'
    count INTEGER NOT NULL DEFAULT 1,
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    confidence DOUBLE PRECISION,
    bot_reasoning TEXT,
    rules_result TEXT,                  -- 'passed' or 'failed:rule_name'
    ai_verdict TEXT,                    -- 'APPROVE','REJECT','WARN', NULL
    ai_reasoning TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'executed','rejected','skipped','paper','error'
    kalshi_order_id TEXT,
    pnl DOUBLE PRECISION DEFAULT 0,
    settled BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_trades_agent ON trades(agent_id);
CREATE INDEX idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_category ON trades(category);

-- ============================================================
-- LOG_ENTRIES: Agent runtime logs (for live panel)
-- ============================================================
CREATE TABLE IF NOT EXISTS log_entries (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    level TEXT NOT NULL DEFAULT 'info',  -- 'info','warn','error','trade'
    message TEXT NOT NULL
);

CREATE INDEX idx_logs_agent ON log_entries(agent_id, timestamp DESC);

-- ============================================================
-- PORTFOLIO_SNAPSHOTS: Every 5 min for charts
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    total_value DOUBLE PRECISION NOT NULL,
    daily_pnl DOUBLE PRECISION DEFAULT 0,
    agent_values JSONB                  -- {"octagon-deep": 1234.56, ...}
);

CREATE INDEX idx_snapshots_timestamp ON portfolio_snapshots(timestamp DESC);

-- ============================================================
-- SEED: Default 3 agents
-- ============================================================
INSERT INTO agents (id, name, repo_url, repo_slug, description, strategy, llms) VALUES
    ('octagon-deep', 'OctagonAI Deep Trader',
     'https://github.com/OctagonAI/kalshi-deep-trading-bot',
     'OctagonAI/kalshi-deep-trading-bot',
     'Deep analysis Kalshi trading bot using Octagon Research API for market intelligence and multi-factor analysis.',
     'Deep research analysis with Octagon API data feeds, multi-factor scoring model',
     'GPT-4o + Octagon Research'),
    ('ensemble-5', '5-Model Ensemble',
     'https://github.com/ryanfrigo/kalshi-ai-trading-bot',
     'ryanfrigo/kalshi-ai-trading-bot',
     'Aggregates predictions from 5 different LLMs and trades based on consensus with configurable confidence thresholds.',
     '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
     'Claude + GPT-4o + Gemini + DeepSeek + Grok'),
    ('genai-simple', 'Grok Simple Trader',
     'https://github.com/ajwann/kalshi-genai-trading-bot',
     'ajwann/kalshi-genai-trading-bot',
     'Lightweight GenAI trading bot using Grok for market analysis with simple position sizing.',
     'Single LLM analysis (Grok) with direct yes/no signal generation',
     'Grok (xAI)')
ON CONFLICT (id) DO NOTHING;
