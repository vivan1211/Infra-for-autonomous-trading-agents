-- 032: Weekly performance snapshots table
-- Captures point-in-time metrics per user per bot per week.
-- Used for trend charts on bot detail pages and overview sparklines.

CREATE TABLE IF NOT EXISTS wiki_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_type   TEXT NOT NULL,       -- 'bot', 'dashboard'
    snapshot_key    TEXT NOT NULL,       -- bot_type_id or 'overview'
    period_start    DATE NOT NULL,       -- Monday of the snapshot week
    period_end      DATE NOT NULL,       -- Sunday of the snapshot week
    metrics         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One snapshot per entity per week per user
CREATE UNIQUE INDEX IF NOT EXISTS wiki_snapshots_unique_idx
    ON wiki_snapshots (user_id, snapshot_type, snapshot_key, period_start);

-- Fast lookups for trend queries
CREATE INDEX IF NOT EXISTS wiki_snapshots_lookup_idx
    ON wiki_snapshots (user_id, snapshot_type, snapshot_key, period_start DESC);

-- RLS: users see only their own snapshots
ALTER TABLE wiki_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY wiki_snapshots_select ON wiki_snapshots
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
