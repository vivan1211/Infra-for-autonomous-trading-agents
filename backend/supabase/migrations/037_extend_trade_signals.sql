-- 037_extend_trade_signals.sql
-- Phase A of the Trade Intelligence Pipeline Upgrade.
--
-- Adds 28 columns to trade_signals so the table is a strict superset of
-- the signals dict that quant_report.py:extract_signals already produces.
-- All ADDs use IF NOT EXISTS so this migration is idempotent and safe to
-- re-run.
--
-- Column groupings:
--   1. Edge / anchor fixes:        forecaster_edge_signed, anchor_delta, skip_reason
--   2. Outcome split (real vs cf): real_won, cf_won, real_pnl, cf_pnl, cf_settled
--   3. Risk Manager debate JSON:   ev_estimate, risk_score, true_probability,
--                                  recommended_size_pct, edge_durability_hours,
--                                  rm_recommended_side
--   4. Debate bracket:             probability_floor, probability_ceiling,
--                                  debate_bracket_width
--   5. Research quality:           research_quality_score, research_model
--   6. Per-agent records:          per_agent (JSONB list)
--   7. Config snapshot at trade:   cfg_at_trade, rules_at_trade, mode_at_trade,
--                                  capital_alloc_at_trade, cfg_deployed_at
--   8. Trade primitives that the
--      original schema missed:     exchange, model, total_cost
--
-- Columns NOT added (already present from migrations 030/031/033):
--   environment (031), pipeline_run_id (033), updated_at (033)
--   pnl, won, confidence, price, bot_type_id, etc. (030)

-- 1. Edge / anchor fixes
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS forecaster_edge_signed NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS anchor_delta           NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS skip_reason            TEXT;

-- 2. Outcome split (real vs counterfactual)
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS real_won   BOOLEAN;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS cf_won     BOOLEAN;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS real_pnl   NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS cf_pnl     NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS cf_settled BOOLEAN;

-- 3. Risk Manager debate JSON fields
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS ev_estimate            NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS risk_score             NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS true_probability       NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS recommended_size_pct   NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS edge_durability_hours  NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS rm_recommended_side    TEXT;

-- 4. Debate bracket
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS probability_floor   NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS probability_ceiling NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS debate_bracket_width NUMERIC;

-- 5. Research quality
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS research_quality_score NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS research_model         TEXT;

-- 6. Per-agent records — list of {role, model, probability, reasoning_words}
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS per_agent JSONB;

-- 7. Deployment snapshot as-of trade time (LATERAL join in pull_new_trades)
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS cfg_at_trade           JSONB;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS rules_at_trade         JSONB;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS mode_at_trade          TEXT;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS capital_alloc_at_trade NUMERIC;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS cfg_deployed_at        TIMESTAMPTZ;

-- 8. Trade primitives the original schema didn't capture
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS exchange   TEXT;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS model      TEXT;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS total_cost NUMERIC;
