#!/usr/bin/env python3
"""Backfill trade_signals with the 28 new columns from migration 037.

Re-runs `extract_signals` on every trade that already has a `trade_signals`
row, using the same SQL as `wiki_pipeline.pull_new_trades` (which now joins
`deployment_snapshots` LATERAL). Idempotent — UPSERT on `trade_id`. Safe to
re-run any number of times.

Usage:
    # Dry run, all rows (the default — nothing is written):
    python -m backend.scripts.backfill_trade_signals

    # Dry run, only first 50:
    python -m backend.scripts.backfill_trade_signals --limit 50

    # Actually write to the DB:
    python -m backend.scripts.backfill_trade_signals --commit

    # Backfill a single user:
    python -m backend.scripts.backfill_trade_signals --commit --user-id <uuid>
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Optional

import asyncpg

# Reuse the in-process pipeline functions so the SQL stays in lock-step.
try:
    from backend.app.services.wiki_pipeline import (
        WikiConfig,
        _record_to_dict,
        _to_dt,
        create_pool,
        derive_sub_category,
    )
    from backend.scripts.trade_intelligence import extract_signals
except ImportError:
    # Fallback for standalone execution.
    _here = Path(__file__).resolve()
    _repo_root = _here.parents[2]
    if str(_repo_root) not in sys.path:
        sys.path.insert(0, str(_repo_root))
    from backend.app.services.wiki_pipeline import (  # type: ignore[import-untyped]
        WikiConfig,
        _record_to_dict,
        _to_dt,
        create_pool,
        derive_sub_category,
    )
    from backend.scripts.trade_intelligence import extract_signals  # type: ignore[import-untyped]

logger = logging.getLogger("backfill_trade_signals")

# SAME SQL as wiki_pipeline.pull_new_trades (after Step 1 of Phase A) BUT:
#   - Drops the `NOT EXISTS (trade_signals)` clause — we want trades that DO
#     have a row, so we can re-extract them.
#   - Adds an INNER JOIN to trade_signals so we only re-extract rows already
#     in the table.
#   - Optional --user-id filter via $1::uuid.
#   - Optional --limit via LIMIT $2.
_BACKFILL_FETCH_SQL = """
    SELECT t.id, t.agent_id, t.user_id, ua.bot_type_id,
           t.market_ticker, t.market_title, t.category,
           t.side, t.action, t.count, t.price, t.total_cost,
           t.confidence, t.status, t.pnl, t.settled,
           t.environment, t.exchange, t.model,
           t.rules_result, t.raw_reasoning,
           t.timestamp, t.market_close_time,
           t.cf_settled, t.cf_pnl, t.cf_market_result, t.cf_count,
           cfg.cfg_at_trade,
           cfg.rules_at_trade,
           cfg.mode_at_trade,
           cfg.capital_alloc_at_trade,
           cfg.cfg_deployed_at
    FROM trades t
    JOIN user_agents ua ON ua.id = t.agent_id
    JOIN trade_signals ts ON ts.trade_id = t.id
    LEFT JOIN LATERAL (
        SELECT ds.config_json        AS cfg_at_trade,
               ds.rules_json         AS rules_at_trade,
               ds.mode               AS mode_at_trade,
               ds.capital_allocated  AS capital_alloc_at_trade,
               ds.created_at         AS cfg_deployed_at
        FROM deployment_snapshots ds
        WHERE ds.user_agent_id = t.agent_id
          AND ds.created_at <= t.timestamp
        ORDER BY ds.created_at DESC
        LIMIT 1
    ) cfg ON TRUE
    WHERE ($1::uuid IS NULL OR t.user_id = $1::uuid)
    ORDER BY t.timestamp ASC
    LIMIT $2
"""

# Same UPSERT as extract_and_store_signals (Step 4 of Phase A). Inlined here
# rather than calling extract_and_store_signals so we can:
#   1. Process in batches with progress logging.
#   2. Carry the dry-run flag without polluting the production wrapper.
_UPSERT_SQL = """
    INSERT INTO trade_signals (
        trade_id, user_id, bot_type_id, category, sub_category, bucket,
        base_rate_mentioned, risk_manager_endorsed, risk_manager_overridden,
        forecaster_probability, forecaster_anchored,
        bear_word_count, bull_word_count, total_reasoning_words,
        model_agreement, edge_at_entry, sources_cited, hedge_score,
        hours_to_close, confidence, price, won, pnl,
        environment, pipeline_run_id,
        forecaster_edge_signed, anchor_delta, skip_reason,
        real_won, cf_won, real_pnl, cf_pnl, cf_settled,
        ev_estimate, risk_score, true_probability,
        recommended_size_pct, edge_durability_hours, rm_recommended_side,
        probability_floor, probability_ceiling, debate_bracket_width,
        research_quality_score, research_model,
        per_agent,
        cfg_at_trade, rules_at_trade, mode_at_trade,
        capital_alloc_at_trade, cfg_deployed_at,
        exchange, model, total_cost,
        updated_at
    ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,
        $26,$27,$28,
        $29,$30,$31,$32,$33,
        $34,$35,$36,$37,$38,$39,
        $40,$41,$42,
        $43,$44,
        $45::jsonb,
        $46::jsonb,$47::jsonb,$48,$49,$50,
        $51,$52,$53,
        NOW()
    )
    ON CONFLICT (trade_id) DO UPDATE SET
        category = EXCLUDED.category,
        sub_category = EXCLUDED.sub_category,
        bucket = EXCLUDED.bucket,
        base_rate_mentioned = EXCLUDED.base_rate_mentioned,
        risk_manager_endorsed = EXCLUDED.risk_manager_endorsed,
        risk_manager_overridden = EXCLUDED.risk_manager_overridden,
        forecaster_probability = EXCLUDED.forecaster_probability,
        forecaster_anchored = EXCLUDED.forecaster_anchored,
        bear_word_count = EXCLUDED.bear_word_count,
        bull_word_count = EXCLUDED.bull_word_count,
        total_reasoning_words = EXCLUDED.total_reasoning_words,
        model_agreement = EXCLUDED.model_agreement,
        edge_at_entry = EXCLUDED.edge_at_entry,
        sources_cited = EXCLUDED.sources_cited,
        hedge_score = EXCLUDED.hedge_score,
        hours_to_close = EXCLUDED.hours_to_close,
        confidence = EXCLUDED.confidence,
        price = EXCLUDED.price,
        won = EXCLUDED.won,
        pnl = EXCLUDED.pnl,
        environment = EXCLUDED.environment,
        pipeline_run_id = EXCLUDED.pipeline_run_id,
        forecaster_edge_signed = EXCLUDED.forecaster_edge_signed,
        anchor_delta = EXCLUDED.anchor_delta,
        skip_reason = EXCLUDED.skip_reason,
        real_won = EXCLUDED.real_won,
        cf_won = EXCLUDED.cf_won,
        real_pnl = EXCLUDED.real_pnl,
        cf_pnl = EXCLUDED.cf_pnl,
        cf_settled = EXCLUDED.cf_settled,
        ev_estimate = EXCLUDED.ev_estimate,
        risk_score = EXCLUDED.risk_score,
        true_probability = EXCLUDED.true_probability,
        recommended_size_pct = EXCLUDED.recommended_size_pct,
        edge_durability_hours = EXCLUDED.edge_durability_hours,
        rm_recommended_side = EXCLUDED.rm_recommended_side,
        probability_floor = EXCLUDED.probability_floor,
        probability_ceiling = EXCLUDED.probability_ceiling,
        debate_bracket_width = EXCLUDED.debate_bracket_width,
        research_quality_score = EXCLUDED.research_quality_score,
        research_model = EXCLUDED.research_model,
        per_agent = EXCLUDED.per_agent,
        cfg_at_trade = EXCLUDED.cfg_at_trade,
        rules_at_trade = EXCLUDED.rules_at_trade,
        mode_at_trade = EXCLUDED.mode_at_trade,
        capital_alloc_at_trade = EXCLUDED.capital_alloc_at_trade,
        cfg_deployed_at = EXCLUDED.cfg_deployed_at,
        exchange = EXCLUDED.exchange,
        model = EXCLUDED.model,
        total_cost = EXCLUDED.total_cost,
        updated_at = NOW()
"""


def _signal_to_row(t: dict, sig: dict, pipeline_run_id: Optional[str]) -> tuple:
    """Pack a signal dict into the 53-tuple matching _UPSERT_SQL placeholders."""
    sub_cat = derive_sub_category(t.get("category"), t.get("market_title"))
    per_agent_json = (
        json.dumps(sig.get("per_agent")) if sig.get("per_agent") is not None else None
    )
    cfg_at_trade_json = (
        json.dumps(sig.get("cfg_at_trade")) if sig.get("cfg_at_trade") is not None else None
    )
    rules_at_trade_json = (
        json.dumps(sig.get("rules_at_trade")) if sig.get("rules_at_trade") is not None else None
    )
    return (
        t["id"],
        t["user_id"],
        sig["bot_type_id"],
        sig.get("category"),
        sub_cat,
        sig["bucket"],
        sig.get("base_rate_mentioned"),
        sig.get("risk_manager_endorsed"),
        sig.get("risk_manager_overridden"),
        sig.get("forecaster_probability"),
        sig.get("forecaster_anchored_to_price"),
        sig.get("bear_word_count"),
        sig.get("bull_word_count"),
        sig.get("total_reasoning_words", 0),
        sig.get("model_agreement"),
        sig.get("edge_at_entry"),
        sig.get("sources_cited", 0),
        sig.get("hedge_score", 0),
        sig.get("hours_to_close"),
        sig.get("confidence"),
        sig.get("price"),
        sig.get("won"),
        sig.get("pnl"),
        t.get("environment", "training"),
        pipeline_run_id,
        sig.get("forecaster_edge_signed"),
        sig.get("anchor_delta"),
        sig.get("skip_reason"),
        sig.get("real_won"),
        sig.get("cf_won"),
        sig.get("real_pnl"),
        sig.get("cf_pnl"),
        sig.get("cf_settled"),
        sig.get("ev_estimate"),
        sig.get("risk_score"),
        sig.get("true_probability"),
        sig.get("recommended_size_pct"),
        sig.get("edge_durability_hours"),
        sig.get("rm_recommended_side"),
        sig.get("probability_floor"),
        sig.get("probability_ceiling"),
        sig.get("debate_bracket_width"),
        sig.get("research_quality_score"),
        sig.get("research_model"),
        per_agent_json,
        cfg_at_trade_json,
        rules_at_trade_json,
        sig.get("mode_at_trade"),
        sig.get("capital_alloc_at_trade"),
        _to_dt(sig.get("cfg_deployed_at")),
        sig.get("exchange"),
        sig.get("model"),
        sig.get("total_cost"),
    )


async def run_backfill(
    pool: asyncpg.Pool,
    *,
    dry_run: bool,
    limit: Optional[int],
    user_id: Optional[str],
) -> dict:
    """Re-run extract_signals on every existing trade_signals row."""
    pipeline_run_id = str(uuid.uuid4())
    logger.info(
        "Backfill starting: dry_run=%s limit=%s user_id=%s pipeline_run_id=%s",
        dry_run, limit, user_id, pipeline_run_id,
    )

    sql_limit = limit if limit is not None else 1_000_000_000  # effectively no cap
    rows = await pool.fetch(_BACKFILL_FETCH_SQL, user_id, sql_limit)
    logger.info("Fetched %d candidate trades", len(rows))

    processed = 0
    updated = 0
    skipped = 0
    errors = 0

    for row in rows:
        processed += 1
        t = _record_to_dict(row)
        if len(t.get("raw_reasoning") or "") < 10:
            skipped += 1
            continue
        try:
            sig = extract_signals(t)
        except Exception as e:
            logger.warning("extract_signals failed for %s: %s", str(t.get("id", "?"))[:8], e)
            errors += 1
            continue

        if not dry_run:
            try:
                params = _signal_to_row(t, sig, pipeline_run_id)
                await pool.execute(_UPSERT_SQL, *params)
                updated += 1
            except Exception as e:
                logger.warning("UPSERT failed for %s: %s", str(t.get("id", "?"))[:8], e)
                errors += 1
        else:
            updated += 1  # pretend-updated count for the summary line

        if processed % 100 == 0:
            logger.info(
                "Progress: processed=%d updated=%d skipped=%d errors=%d",
                processed, updated, skipped, errors,
            )

    summary = {
        "pipeline_run_id": pipeline_run_id,
        "dry_run": dry_run,
        "rows_processed": processed,
        "rows_updated": updated,
        "rows_skipped": skipped,
        "errors": errors,
    }
    logger.info("Backfill complete: %s", json.dumps(summary, default=str))
    return summary


async def main_async(args: argparse.Namespace) -> int:
    config = WikiConfig()
    config.validate()
    pool = await create_pool(config)
    try:
        result = await run_backfill(
            pool,
            dry_run=not args.commit,
            limit=args.limit,
            user_id=args.user_id,
        )
    finally:
        await pool.close()

    print()
    print("=" * 70)
    print("BACKFILL SUMMARY")
    print("=" * 70)
    print(f"  pipeline_run_id:  {result['pipeline_run_id']}")
    print(f"  mode:             {'DRY RUN (no DB writes)' if result['dry_run'] else 'COMMIT'}")
    print(f"  rows processed:   {result['rows_processed']}")
    print(f"  rows updated:     {result['rows_updated']}")
    print(f"  rows skipped:     {result['rows_skipped']}")
    print(f"  errors:           {result['errors']}")
    print("=" * 70)
    return 0 if result["errors"] == 0 else 1


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    parser = argparse.ArgumentParser(
        description="Re-extract trade_signals using the new extract_signals (Phase A)."
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max number of rows to backfill. Default: no limit.",
    )
    parser.add_argument(
        "--commit", action="store_true",
        help="Actually write to the DB. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--user-id", type=str, default=None,
        help="Optional UUID — only backfill trades belonging to this user.",
    )
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
