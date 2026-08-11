-- 031: Add environment column to trade_signals
-- Enables separating training vs live trades in evaluations pipeline.
-- Live trades ('actual') used for per-user stats; all trades used for platform analysis.

ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'training';
CREATE INDEX IF NOT EXISTS trade_signals_environment_idx ON trade_signals(environment);

-- Backfill from trades table
UPDATE trade_signals ts
SET environment = t.environment
FROM trades t
WHERE ts.trade_id = t.id
  AND ts.environment = 'training'
  AND t.environment != 'training';
