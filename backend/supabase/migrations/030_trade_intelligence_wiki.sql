-- 030_trade_intelligence_wiki.sql
-- Trade Intelligence Wiki: 4 new tables for the hosted wiki pipeline.
-- Creates trade_signals, trade_autopsies, wiki_pages, wiki_log.
-- Zero impact on existing tables — new tables only.

-- ============================================================================
-- 1. trade_signals — Stage 1 output (per-trade, deterministic signal extraction)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_signals (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id                  UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,
    user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bot_type_id               TEXT NOT NULL,
    category                  TEXT,
    sub_category              TEXT,
    bucket                    TEXT NOT NULL,

    -- Extracted signals (Stage 1 fields)
    base_rate_mentioned       BOOLEAN,
    risk_manager_endorsed     BOOLEAN,
    risk_manager_overridden   BOOLEAN,
    forecaster_probability    NUMERIC(5,4),
    forecaster_anchored       BOOLEAN,
    bear_word_count           INTEGER DEFAULT 0,
    bull_word_count           INTEGER DEFAULT 0,
    total_reasoning_words     INTEGER DEFAULT 0,
    model_agreement           INTEGER,
    edge_at_entry             NUMERIC(6,4),
    sources_cited             INTEGER DEFAULT 0,
    hedge_score               INTEGER DEFAULT 0,
    hours_to_close            NUMERIC(8,2),
    confidence                NUMERIC(4,3),
    price                     NUMERIC(8,4),
    won                       BOOLEAN,
    pnl                       NUMERIC(12,2),

    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_signals_user_id_idx     ON trade_signals(user_id);
CREATE INDEX IF NOT EXISTS trade_signals_bot_type_id_idx ON trade_signals(bot_type_id);
CREATE INDEX IF NOT EXISTS trade_signals_category_idx    ON trade_signals(category, sub_category);
CREATE INDEX IF NOT EXISTS trade_signals_bucket_idx      ON trade_signals(bucket);

-- ============================================================================
-- 2. trade_autopsies — Stage 2 output (per-trade, AI-generated analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_autopsies (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id          UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bot_type_id       TEXT NOT NULL,

    failure_mode      TEXT NOT NULL,
    decision_quality  TEXT NOT NULL,       -- GOOD_PROCESS, ACCEPTABLE, POOR_PROCESS
    narrative         TEXT NOT NULL,
    agent_scores      JSONB,              -- {"forecaster": 8, "bear": 9, ...}
    key_excerpt_agent TEXT,
    key_excerpt       TEXT,
    outcome_driver    TEXT,

    model_used        TEXT DEFAULT 'openai/gpt-4o',
    cost_usd          NUMERIC(6,4),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_autopsies_user_id_idx      ON trade_autopsies(user_id);
CREATE INDEX IF NOT EXISTS trade_autopsies_failure_mode_idx ON trade_autopsies(failure_mode);
CREATE INDEX IF NOT EXISTS trade_autopsies_bot_type_id_idx  ON trade_autopsies(bot_type_id);

-- ============================================================================
-- 3. wiki_pages — All wiki content (LLM-maintained knowledge pages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wiki_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL = platform-level
    page_type       TEXT NOT NULL,        -- dashboard, bot, category, agent, trade, pattern, sweep
    page_key        TEXT NOT NULL,        -- "polymarket-v2", "soccer-ou-1-5", "bear_researcher", etc.

    frontmatter     JSONB NOT NULL DEFAULT '{}',     -- structured metadata
    content_md      TEXT,                             -- markdown narrative (AI-generated)
    data_snapshot   JSONB NOT NULL DEFAULT '{}',     -- structured data (stats, tables, charts)

    trade_count     INTEGER DEFAULT 0,               -- how many trades inform this page
    last_trade_at   TIMESTAMPTZ,                     -- most recent trade timestamp
    version         INTEGER DEFAULT 1,               -- increment on each update

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, page_type, page_key)
);

-- Note: the UNIQUE constraint uses NULLS NOT DISTINCT is PG15+ default for
-- composite uniques. For older PG, platform-level pages (user_id=NULL) are
-- still unique per (page_type, page_key) because NULL != NULL in standard SQL,
-- so we add a partial unique index for platform pages as a safety net.
CREATE UNIQUE INDEX IF NOT EXISTS wiki_pages_platform_unique_idx
    ON wiki_pages(page_type, page_key) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS wiki_pages_page_type_idx ON wiki_pages(page_type);
CREATE INDEX IF NOT EXISTS wiki_pages_user_id_idx   ON wiki_pages(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wiki_pages_updated_at_idx ON wiki_pages(updated_at DESC);

-- ============================================================================
-- 4. wiki_log — Append-only audit trail for wiki pipeline operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS wiki_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,   -- NULL = platform event
    action          TEXT NOT NULL,        -- pipeline_run, page_created, page_updated, pattern_detected, deploy
    stage           TEXT,                 -- stage_0, stage_1, ..., stage_7
    details         JSONB,               -- {trades_processed: 50, pages_updated: 12, cost_usd: 0.52}
    message         TEXT                  -- human-readable log line
);

CREATE INDEX IF NOT EXISTS wiki_log_timestamp_idx ON wiki_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS wiki_log_user_id_idx   ON wiki_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wiki_log_action_idx    ON wiki_log(action);

-- ============================================================================
-- 5. Row-Level Security
-- ============================================================================

-- Enable RLS on all four tables
ALTER TABLE trade_signals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_autopsies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_pages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_log         ENABLE ROW LEVEL SECURITY;

-- trade_signals: users can read their own
CREATE POLICY trade_signals_select ON trade_signals
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- trade_autopsies: users can read their own
CREATE POLICY trade_autopsies_select ON trade_autopsies
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- wiki_pages: users see their own pages + all platform pages (user_id IS NULL)
CREATE POLICY wiki_pages_select ON wiki_pages
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR user_id IS NULL);

-- wiki_log: users see their own log entries + platform events (user_id IS NULL)
CREATE POLICY wiki_log_select ON wiki_log
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR user_id IS NULL);
