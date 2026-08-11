-- Add cycle_id column to intercept_queue for proper idempotency checks.
-- Replaces the brittle LIKE pattern on raw_reasoning with a proper column + unique constraint.
ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS cycle_id TEXT;

-- Unique constraint: same agent + ticker + side + cycle = duplicate
CREATE UNIQUE INDEX IF NOT EXISTS intercept_queue_cycle_dedup_idx
    ON intercept_queue (agent_id, market_ticker, side, cycle_id)
    WHERE cycle_id IS NOT NULL AND status != 'cancelled';
