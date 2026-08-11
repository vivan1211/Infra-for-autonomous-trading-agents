"""Wiki Generator — Stage 6 of the Trade Intelligence Wiki Pipeline.

After Stages 1-2 create trade_signals + trade_autopsies for new trades,
this module creates/updates wiki_pages:

  1. Trade pages     — one wiki_pages row per settled trade (user-level)

# Simplified: only trade pages generated. Bot/category/agent/dashboard pages removed in evaluations simplification.

Called by wiki_pipeline.py via:
    from backend.app.services.wiki_generator import update_wiki_pages
    pages = await update_wiki_pages(pool, config)

Design rules:
  - No AI calls — all content_md is NULL (AI narratives come later)
  - Uses asyncpg pool directly with parameterized queries ($1, $2, ...)
"""
from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg

logger = logging.getLogger("wiki_generator")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _slugify(text: str | None) -> str:
    """Turn a string into a URL-safe page_key slug."""
    if not text:
        return "unknown"
    import re as _re
    result = (
        text.lower()
        .replace(" ", "-")
        .replace("/", "-")
        .replace(".", "-")
        .replace("_", "-")
        .replace(":", "")
        .replace("(", "")
        .replace(")", "")
        .strip("-")
    )
    return _re.sub(r"-+", "-", result)  # collapse consecutive hyphens


def _safe_float(val: Any) -> float:
    """Convert a DB value to float, defaulting to 0.0."""
    if val is None:
        return 0.0
    return float(val)


def _safe_int(val: Any) -> int:
    """Convert a DB value to int, defaulting to 0."""
    if val is None:
        return 0
    return int(val)


def _jsonb(data: Any) -> str:
    """Serialize to JSON string for asyncpg JSONB parameters."""
    return json.dumps(data, default=str)


# ── Trade Pages ──────────────────────────────────────────────────────────────

async def generate_trade_page(
    pool: asyncpg.Pool,
    trade_id: str,
    user_id: str,
    signal: dict,
    autopsy: dict | None,
    raw_trade: dict,
) -> None:
    """Create a wiki_pages row for a single trade. No AI call — pure data.

    The page_key is the trade_id string (UUID).
    """
    # Build cross-references
    related_pages: list[dict[str, str]] = []

    # Link to category page
    cat = signal.get("category")
    sub_cat = signal.get("sub_category")
    if cat:
        cat_key = _slugify(sub_cat) if sub_cat else _slugify(cat)
        related_pages.append({"page_type": "category", "page_key": cat_key})

    # Link to bot page
    bot_type_id = signal.get("bot_type_id")
    if bot_type_id:
        related_pages.append({"page_type": "bot", "page_key": bot_type_id})

    # Link to agent pages (from autopsy agent_scores)
    if autopsy and autopsy.get("agent_scores"):
        agent_scores = autopsy["agent_scores"]
        if isinstance(agent_scores, str):
            try:
                agent_scores = json.loads(agent_scores)
            except (json.JSONDecodeError, TypeError):
                agent_scores = {}
        if isinstance(agent_scores, dict):
            for agent_role in agent_scores:
                related_pages.append({"page_type": "agent", "page_key": agent_role})

    # Build data_snapshot
    data_snapshot: dict[str, Any] = {
        "signals": {
            "bucket": signal.get("bucket"),
            "category": signal.get("category"),
            "sub_category": signal.get("sub_category"),
            "bot_type_id": signal.get("bot_type_id"),
            "base_rate_mentioned": signal.get("base_rate_mentioned"),
            "risk_manager_endorsed": signal.get("risk_manager_endorsed"),
            "risk_manager_overridden": signal.get("risk_manager_overridden"),
            "forecaster_probability": _safe_float(signal.get("forecaster_probability")),
            "forecaster_anchored": signal.get("forecaster_anchored"),
            "bear_word_count": _safe_int(signal.get("bear_word_count")),
            "bull_word_count": _safe_int(signal.get("bull_word_count")),
            "total_reasoning_words": _safe_int(signal.get("total_reasoning_words")),
            "model_agreement": signal.get("model_agreement"),
            "edge_at_entry": _safe_float(signal.get("edge_at_entry")),
            "sources_cited": _safe_int(signal.get("sources_cited")),
            "hedge_score": _safe_int(signal.get("hedge_score")),
            "hours_to_close": _safe_float(signal.get("hours_to_close")),
            "confidence": _safe_float(signal.get("confidence")),
            "price": _safe_float(signal.get("price")),
            "won": signal.get("won"),
            "pnl": _safe_float(signal.get("pnl")),
            "environment": signal.get("environment", "training"),
        },
        "related_pages": related_pages,
    }

    # Add autopsy if available
    if autopsy:
        data_snapshot["autopsy"] = {
            "failure_mode": autopsy.get("failure_mode"),
            "decision_quality": autopsy.get("decision_quality"),
            "narrative": autopsy.get("narrative"),
            "agent_scores": autopsy.get("agent_scores"),
            "key_excerpt_agent": autopsy.get("key_excerpt_agent"),
            "key_excerpt": autopsy.get("key_excerpt"),
            "outcome_driver": autopsy.get("outcome_driver"),
        }

    # Build frontmatter
    frontmatter: dict[str, Any] = {
        "trade_id": str(trade_id),
        "market_title": raw_trade.get("market_title"),
        "status": raw_trade.get("status"),
        "side": raw_trade.get("side"),
        "price": _safe_float(raw_trade.get("price")),
        "bucket": signal.get("bucket"),
        "won": signal.get("won"),
        "environment": signal.get("environment", "training"),
    }

    trade_ts = raw_trade.get("timestamp") or raw_trade.get("market_close_time")

    await pool.execute(
        """INSERT INTO wiki_pages (user_id, page_type, page_key, frontmatter, content_md, data_snapshot, trade_count, last_trade_at, version)
           VALUES ($1, 'trade', $2, $3::jsonb, NULL, $4::jsonb, 1, $5, 1)
           ON CONFLICT (user_id, page_type, page_key)
           DO UPDATE SET
               frontmatter   = EXCLUDED.frontmatter,
               data_snapshot  = EXCLUDED.data_snapshot,
               last_trade_at  = EXCLUDED.last_trade_at,
               version        = wiki_pages.version + 1,
               updated_at     = NOW()""",
        user_id,
        str(trade_id),
        _jsonb(frontmatter),
        _jsonb(data_snapshot),
        trade_ts,
    )


# ── Main Entry Point ─────────────────────────────────────────────────────────
# Simplified: only trade pages generated. Bot/category/agent/dashboard pages removed in evaluations simplification.

async def run_wiki_update(
    pool: asyncpg.Pool,
    new_trade_ids: list[str],
) -> int:
    """Create/update trade wiki pages for a batch of new trades.

    Steps:
      1. Fetch signals + autopsies + raw trades for the given IDs
      2. Create trade pages for each

    Returns total number of pages created/updated.
    """
    if not new_trade_ids:
        logger.info("Stage 6: no new trade IDs — skipping")
        return 0

    pages_updated = 0

    # --- 1. Fetch data for new trades ---
    rows = await pool.fetch(
        """SELECT
               ts.trade_id, ts.user_id, ts.bot_type_id,
               ts.bucket, ts.category, ts.sub_category,
               ts.base_rate_mentioned, ts.risk_manager_endorsed,
               ts.risk_manager_overridden, ts.forecaster_probability,
               ts.forecaster_anchored, ts.bear_word_count, ts.bull_word_count,
               ts.total_reasoning_words, ts.model_agreement, ts.edge_at_entry,
               ts.sources_cited, ts.hedge_score, ts.hours_to_close,
               ts.confidence, ts.price, ts.won, ts.pnl,
               ts.environment,
               ts.created_at AS signal_created_at,
               ta.failure_mode, ta.decision_quality, ta.narrative,
               ta.agent_scores, ta.key_excerpt_agent, ta.key_excerpt,
               ta.outcome_driver,
               t.market_title, t.status, t.side,
               t.price AS trade_price, t.timestamp AS trade_timestamp,
               t.market_close_time
           FROM trade_signals ts
           LEFT JOIN trade_autopsies ta ON ta.trade_id = ts.trade_id
           LEFT JOIN trades t ON t.id = ts.trade_id
           WHERE ts.trade_id = ANY($1::uuid[])""",
        new_trade_ids,
    )

    if not rows:
        logger.warning("Stage 6: no trade_signals found for %d trade IDs", len(new_trade_ids))
        return 0

    # --- 2. Create trade pages ---
    for r in rows:
        trade_id = str(r["trade_id"])
        user_id = str(r["user_id"])

        # Build signal dict from row
        signal = {
            "bucket": r["bucket"],
            "category": r["category"],
            "sub_category": r["sub_category"],
            "bot_type_id": r["bot_type_id"],
            "base_rate_mentioned": r["base_rate_mentioned"],
            "risk_manager_endorsed": r["risk_manager_endorsed"],
            "risk_manager_overridden": r["risk_manager_overridden"],
            "forecaster_probability": r["forecaster_probability"],
            "forecaster_anchored": r["forecaster_anchored"],
            "bear_word_count": r["bear_word_count"],
            "bull_word_count": r["bull_word_count"],
            "total_reasoning_words": r["total_reasoning_words"],
            "model_agreement": r["model_agreement"],
            "edge_at_entry": r["edge_at_entry"],
            "sources_cited": r["sources_cited"],
            "hedge_score": r["hedge_score"],
            "hours_to_close": r["hours_to_close"],
            "confidence": r["confidence"],
            "price": r["price"],
            "won": r["won"],
            "pnl": r["pnl"],
            "environment": r.get("environment", "training"),
        }

        # Build autopsy dict (may be NULL if no autopsy exists)
        autopsy: dict | None = None
        if r["failure_mode"] is not None:
            autopsy = {
                "failure_mode": r["failure_mode"],
                "decision_quality": r["decision_quality"],
                "narrative": r["narrative"],
                "agent_scores": r["agent_scores"],
                "key_excerpt_agent": r["key_excerpt_agent"],
                "key_excerpt": r["key_excerpt"],
                "outcome_driver": r["outcome_driver"],
            }

        # Build raw_trade dict
        raw_trade = {
            "market_title": r["market_title"],
            "status": r["status"],
            "side": r["side"],
            "price": r["trade_price"],
            "timestamp": r["trade_timestamp"],
            "market_close_time": r["market_close_time"],
        }

        try:
            await generate_trade_page(pool, trade_id, user_id, signal, autopsy, raw_trade)
            pages_updated += 1
        except Exception as e:
            logger.error("Trade page creation failed for %s: %s", trade_id[:8], e)

    logger.info("Stage 6 complete: %d trade pages created/updated", pages_updated)
    return pages_updated


# ── Pipeline integration ─────────────────────────────────────────────────────

async def update_wiki_pages(pool: asyncpg.Pool, config: Any) -> int:
    """Entry point called by wiki_pipeline.py _try_wiki_update().

    Finds trade_signals that don't yet have wiki_pages, then calls
    run_wiki_update with those trade IDs.

    Args:
        pool: asyncpg connection pool
        config: WikiConfig instance (not used directly — no AI calls in Stage 6)

    Returns:
        Number of wiki pages created/updated.
    """
    # Simplified: only trade pages generated. Bot/category/agent/dashboard pages removed in evaluations simplification.

    # Find trade_signals rows that don't yet have a corresponding wiki trade page
    missing_rows = await pool.fetch(
        """SELECT ts.trade_id
           FROM trade_signals ts
           WHERE NOT EXISTS (
               SELECT 1 FROM wiki_pages wp
               WHERE wp.page_type = 'trade'
                 AND wp.page_key = ts.trade_id::text
                 AND wp.user_id = ts.user_id
           )"""
    )

    new_trade_ids = [r["trade_id"] for r in missing_rows]

    if not new_trade_ids:
        logger.info("Stage 6: all trades already have wiki pages")
        return 0

    logger.info("Stage 6: %d new trades to create wiki pages for", len(new_trade_ids))
    return await run_wiki_update(pool, new_trade_ids)
