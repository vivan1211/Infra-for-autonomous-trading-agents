-- ────────────────────────────────────────────────────────────────────
-- Migration 033: Pipeline traceability + sweep/pattern history
--
-- Adds pipeline_run_id, prompt_version, and timestamp columns to enable
-- provenance tracking and reproducibility. Creates append-only history
-- tables for parameter sweeps and pattern detection runs so we can
-- analyze threshold drift and pattern emergence over time.
-- ────────────────────────────────────────────────────────────────────

-- 1. Add pipeline_run_id + updated_at to trade_signals
ALTER TABLE trade_signals
  ADD COLUMN IF NOT EXISTS pipeline_run_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS trade_signals_pipeline_run_idx
  ON trade_signals(pipeline_run_id);

-- 2. Add pipeline_run_id + prompt_version + regenerated_at + updated_at to trade_autopsies
ALTER TABLE trade_autopsies
  ADD COLUMN IF NOT EXISTS pipeline_run_id UUID,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS regenerated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS trade_autopsies_pipeline_run_idx
  ON trade_autopsies(pipeline_run_id);
CREATE INDEX IF NOT EXISTS trade_autopsies_prompt_version_idx
  ON trade_autopsies(prompt_version);

-- 3. Add pipeline_run_id to wiki_log for run correlation
ALTER TABLE wiki_log
  ADD COLUMN IF NOT EXISTS pipeline_run_id UUID;
CREATE INDEX IF NOT EXISTS wiki_log_pipeline_run_idx
  ON wiki_log(pipeline_run_id);

-- 4. Create wiki_sweep_history (append-only sweep snapshots)
CREATE TABLE IF NOT EXISTS wiki_sweep_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID,
  run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trade_count INT NOT NULL,
  input_data_hash VARCHAR(64),  -- sha256 of sorted trade_ids
  optimal_confidence NUMERIC(4,3),
  optimal_confidence_net_delta NUMERIC(10,2),
  optimal_edge NUMERIC(4,3),
  optimal_edge_net_delta NUMERIC(10,2),
  confidence_sweep JSONB,
  edge_sweep JSONB,
  category_stats JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wiki_sweep_history_run_date_idx
  ON wiki_sweep_history(run_date DESC);

-- 5. Create wiki_pattern_snapshots (append-only pattern history)
CREATE TABLE IF NOT EXISTS wiki_pattern_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID,
  run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pattern_id VARCHAR(100),  -- slugified pattern title
  title TEXT,
  description TEXT,
  severity TEXT,
  evidence TEXT,
  suggested_action TEXT,
  status TEXT,  -- new/active/resolved
  times_detected INT,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  autopsies_in_window INT,
  cost_usd NUMERIC(6,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wiki_pattern_snapshots_run_date_idx
  ON wiki_pattern_snapshots(run_date DESC);
CREATE INDEX IF NOT EXISTS wiki_pattern_snapshots_pattern_id_idx
  ON wiki_pattern_snapshots(pattern_id);
