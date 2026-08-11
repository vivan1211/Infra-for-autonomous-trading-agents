-- Add settled_at timestamp for accurate P&L date attribution
-- P&L should be attributed to settlement date, not trade placement date
ALTER TABLE trades ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Backfill: for already-settled trades, use timestamp as best approximation
UPDATE trades SET settled_at = timestamp WHERE settled = TRUE AND settled_at IS NULL;
