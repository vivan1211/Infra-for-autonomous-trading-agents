-- 041: Council V2 agents upgraded — Claude Opus 4.7 + GPT-5.4 (Bear)
--
-- bots/{polymarket-v2,kalshi-v2}/src/config.py was changed so that
-- bull_researcher, risk_manager, and trader run on anthropic/claude-opus-4.7
-- and bear_researcher runs on openai/gpt-5.4 (cross-family diversity so the
-- adversarial debate isn't same-model-same-temperature collapse).
-- The forecaster remains on x-ai/grok-4.1-fast and research remains on
-- perplexity/sonar-deep-research.
--
-- This migration brings the bot_types rows in line with the new runtime
-- config. Migration 035 is left untouched as a historical record; this
-- supersedes its strategy/llms values.
--
-- Safe to re-run (idempotent UPDATE). Affects only the two Council V2
-- bot_types rows; leaves other strategies unchanged.

UPDATE bot_types SET
    strategy = '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4) with Perplexity research and confidence-weighted edge filtering',
    llms = 'Grok 4.1 Fast, Claude Opus 4.7, GPT-5.4'
WHERE id IN ('polymarket-v2', 'kalshi-v2');
