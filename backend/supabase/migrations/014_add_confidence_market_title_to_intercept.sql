-- Add confidence and market_title columns to intercept_queue
-- so the orchestrator can read them directly instead of fallback parsing
ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS confidence FLOAT;
ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS market_title TEXT;
