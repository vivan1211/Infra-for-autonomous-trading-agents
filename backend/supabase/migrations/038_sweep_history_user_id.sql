-- 038_sweep_history_user_id.sql
-- Add user_id column to wiki_sweep_history for per-user parameter sweeps.
-- Part of the Phase D per-user scoping upgrade.

ALTER TABLE wiki_sweep_history
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS wiki_sweep_history_user_id_idx
  ON wiki_sweep_history(user_id) WHERE user_id IS NOT NULL;
