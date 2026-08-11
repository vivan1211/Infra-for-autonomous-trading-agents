-- Add exchange column to portfolio_snapshots so we store per-exchange history
ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS exchange TEXT;

-- Update composite index to include exchange for efficient filtering
DROP INDEX IF EXISTS portfolio_snapshots_composite_idx;
CREATE INDEX portfolio_snapshots_composite_idx ON portfolio_snapshots(user_id, environment, exchange, timestamp DESC);
