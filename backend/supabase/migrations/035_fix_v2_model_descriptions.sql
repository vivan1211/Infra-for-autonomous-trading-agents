-- 035: Fix stale Council V2 model descriptions
--
-- The bot_types seed rows for polymarket-v2 and kalshi-v2 were written with
-- model names that do not match what the bots actually run. The runtime config
-- (bots/{polymarket-v2,kalshi-v2}/src/config.py) specifies:
--   forecaster       = x-ai/grok-4.1-fast
--   bull_researcher  = anthropic/claude-opus-4.6
--   bear_researcher  = anthropic/claude-sonnet-4.6
--   risk_manager     = anthropic/claude-opus-4.6
--   trader           = anthropic/claude-sonnet-4.6
--   research         = perplexity/sonar-deep-research
--
-- The original seed text (in schema.sql and backend/app/database.py) listed
-- Gemini/GPT-4o/DeepSeek variants that have never been part of V2. This
-- migration corrects the descriptions on existing deployed rows. Fresh
-- installs will already get the correct values from the updated schema.sql
-- seed statements, but INSERT ... ON CONFLICT DO NOTHING means existing
-- rows are untouched unless we UPDATE them explicitly.
--
-- Safe to re-run (idempotent UPDATE). Affects only the two Council V2
-- bot_types rows; leaves other strategies unchanged.

UPDATE bot_types SET
    strategy = '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.6 + Claude Sonnet 4.6) with Perplexity research and confidence-weighted edge filtering',
    llms = 'Grok 4.1 Fast, Claude Opus 4.6, Claude Sonnet 4.6'
WHERE id IN ('polymarket-v2', 'kalshi-v2');
