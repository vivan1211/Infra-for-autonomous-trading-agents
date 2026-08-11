-- 040: Enable RLS on wiki_sweep_history and retired tables
-- Closes RLS gaps from 033. Locks down both retired tables from 039.

-- ── wiki_sweep_history ────────────────────────────────────────────────────
-- Per-user sweep parameter history. Scoped to owner via user_id (added in 038).
-- Pre-038 rows have user_id IS NULL and are visible to all authenticated users
-- (matches wiki_pages / wiki_log pattern in 030).

ALTER TABLE wiki_sweep_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY wiki_sweep_history_select ON wiki_sweep_history
        FOR SELECT TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY wiki_sweep_history_insert ON wiki_sweep_history
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Append-only: explicitly deny UPDATE and DELETE (matches 023 convention).
DO $$ BEGIN
    CREATE POLICY "No user updates on wiki_sweep_history" ON wiki_sweep_history
        FOR UPDATE TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "No user deletes on wiki_sweep_history" ON wiki_sweep_history
        FOR DELETE TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── _unused_wiki_pattern_snapshots ────────────────────────────────────────
-- Retired table (renamed in 039). Lock down all access.

ALTER TABLE _unused_wiki_pattern_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY unused_wiki_pattern_snapshots_deny_all ON _unused_wiki_pattern_snapshots
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── _unused_wiki_snapshots ───────────────────────────────────────────────
-- Sibling retired table (also renamed in 039). Already has RLS enabled and a
-- SELECT policy from 032, but we replace it with a full deny-all to match.

DROP POLICY IF EXISTS wiki_snapshots_select ON _unused_wiki_snapshots;

DO $$ BEGIN
    CREATE POLICY unused_wiki_snapshots_deny_all ON _unused_wiki_snapshots
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
