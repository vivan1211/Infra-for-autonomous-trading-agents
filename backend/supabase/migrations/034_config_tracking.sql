-- 034: Config change tracking tables
-- Adds two tables to track bot configuration history:
--   1. bot_config_history — per-user dashboard edits + deploys (RLS-scoped to owner)
--   2. platform_code_history — global code-level changes (defaults + prompts), readable by any auth user
-- Both tables are append-only by design (no UPDATE/DELETE policies — audit immutability).

-- ── bot_config_history ─────────────────────────────────────────────────────
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

-- For existing deployments that already ran an earlier version of this migration
ALTER TABLE bot_config_history ADD COLUMN IF NOT EXISTS bot_type_id_snapshot TEXT;
ALTER TABLE bot_config_history ALTER COLUMN agent_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS bot_config_history_agent_time_idx ON bot_config_history(agent_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS bot_config_history_user_idx ON bot_config_history(user_id);
CREATE INDEX IF NOT EXISTS bot_config_history_bot_type_idx ON bot_config_history(bot_type_id_snapshot);

ALTER TABLE bot_config_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY bot_config_history_select ON bot_config_history
        FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY bot_config_history_insert ON bot_config_history
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── platform_code_history ──────────────────────────────────────────────────
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

ALTER TABLE platform_code_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY platform_code_history_select ON platform_code_history
        FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
