-- Migration 007: Add market_close_time to trades table
-- Stores when the market resolves/closes, useful for position display and analytics
ALTER TABLE trades ADD COLUMN IF NOT EXISTS market_close_time TIMESTAMPTZ;
