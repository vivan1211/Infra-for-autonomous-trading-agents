-- Migration: Add Polymarket exchange support
-- Adds exchange column to trades/intercept_queue, adds polymarket-council bot type

-- Add exchange column to trades (default 'kalshi' for existing rows)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kalshi';
CREATE INDEX IF NOT EXISTS trades_exchange_idx ON trades(exchange);

-- Add exchange column to intercept_queue
ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kalshi';

-- Add exchange_order_id (generic replacement for kalshi_order_id)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exchange_order_id TEXT;
-- Backfill from existing kalshi_order_id
UPDATE trades SET exchange_order_id = kalshi_order_id WHERE exchange_order_id IS NULL AND kalshi_order_id IS NOT NULL;

-- Add Polymarket Council bot type
INSERT INTO bot_types (id, name, description, strategy, llms) VALUES
    ('polymarket-council', 'Council (Polymarket)',
     '5 LLMs debate every trade on Polymarket. Same AI pipeline as Kalshi Council, different exchange.',
     '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
     'Claude + GPT-4o + Gemini + DeepSeek + Grok')
ON CONFLICT (id) DO NOTHING;
