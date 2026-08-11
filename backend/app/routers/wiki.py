"""Wiki API endpoints — serves wiki pages from the Trade Intelligence Wiki pipeline."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import CurrentUser, require_user
from ..database import Database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wiki", tags=["wiki"])


# ── Helpers ────────────────────────────────────────────────────────────────────


def _row_to_summary(row) -> dict:
    """Convert a wiki_pages row to a lightweight summary (no content_md or data_snapshot)."""
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]) if row["user_id"] else None,
        "page_type": row["page_type"],
        "page_key": row["page_key"],
        "frontmatter": _parse_jsonb(row["frontmatter"]),
        "trade_count": row["trade_count"] or 0,
        "last_trade_at": row["last_trade_at"].isoformat() if row["last_trade_at"] else None,
        "version": row["version"] or 1,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def _parse_jsonb(val):
    """Ensure JSONB field is a dict — asyncpg may return string if pooler strips type info."""
    if val is None:
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return {}
    return val


def _row_to_list_item(row) -> dict:
    """Summary + data_snapshot (excludes content_md)."""
    result = _row_to_summary(row)
    result["data_snapshot"] = _parse_jsonb(row["data_snapshot"])
    return result


def _row_to_full(row) -> dict:
    """Convert a wiki_pages row to full detail (includes content_md + data_snapshot)."""
    result = _row_to_summary(row)
    result["content_md"] = row["content_md"]
    result["data_snapshot"] = _parse_jsonb(row["data_snapshot"])
    return result


# ── List pages by type ─────────────────────────────────────────────────────────


@router.get("/pages")
async def list_wiki_pages(
    page_type: Optional[str] = Query(None, description="Filter: bot, category, agent, trade, pattern, dashboard"),
    user: CurrentUser = Depends(require_user),
):
    """List wiki pages for the authenticated user.
    Sorted by updated_at DESC. Does NOT include full content_md or data_snapshot."""
    user_id = str(user.user_id)

    async with Database() as db:
        if page_type:
            rows = await db.fetch(
                """SELECT id, user_id, page_type, page_key, frontmatter, data_snapshot,
                          trade_count, last_trade_at, version, created_at, updated_at
                   FROM wiki_pages
                   WHERE user_id = $1::uuid AND page_type = $2
                   ORDER BY updated_at DESC""",
                user_id, page_type,
            )
        else:
            rows = await db.fetch(
                """SELECT id, user_id, page_type, page_key, frontmatter, data_snapshot,
                          trade_count, last_trade_at, version, created_at, updated_at
                   FROM wiki_pages
                   WHERE user_id = $1::uuid
                   ORDER BY updated_at DESC""",
                user_id,
            )

        return {"pages": [_row_to_list_item(r) for r in rows]}


# ── Get single page ────────────────────────────────────────────────────────────


@router.get("/pages/{page_type}/{page_key}")
async def get_wiki_page(
    page_type: str,
    page_key: str,
    user: CurrentUser = Depends(require_user),
):
    """Get full wiki page including content_md and data_snapshot for the authenticated user."""
    user_id = str(user.user_id)

    async with Database() as db:
        row = await db.fetchrow(
            """SELECT * FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = $2 AND page_key = $3""",
            user_id, page_type, page_key,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Wiki page not found")

        return _row_to_full(row)


# ── Aggregates ────────────────────────────────────────────────────────────────


@router.get("/aggregates")
async def get_aggregates(
    user: CurrentUser = Depends(require_user),
):
    """Get the authenticated user's cross-trade aggregate signals (Stage 1b output).
    No platform fallback -- returns 404 if this user has no aggregates yet."""
    user_id = str(user.user_id)

    async with Database() as db:
        row = await db.fetchrow(
            """SELECT * FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = 'aggregates' AND page_key = 'latest'""",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="No aggregates found for this user. Run at least 10 settled trades first.")

        return _row_to_full(row)


# ── Wiki log ───────────────────────────────────────────────────────────────────


@router.get("/log")
async def get_wiki_log(
    limit: int = Query(50, ge=1, le=500),
    user: CurrentUser = Depends(require_user),
):
    """Get recent wiki log entries (user's + platform). Sorted by timestamp DESC."""
    user_id = str(user.user_id)

    async with Database() as db:
        rows = await db.fetch(
            """SELECT id, timestamp, user_id, action, stage, details, message
               FROM wiki_log
               WHERE user_id = $1::uuid OR user_id IS NULL
               ORDER BY timestamp DESC
               LIMIT $2""",
            user_id, limit,
        )

        return {
            "entries": [
                {
                    "id": row["id"],
                    "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                    "user_id": str(row["user_id"]) if row["user_id"] else None,
                    "action": row["action"],
                    "stage": row["stage"],
                    "details": row["details"] or {},
                    "message": row["message"],
                }
                for row in rows
            ]
        }


# ── Trade page with signals + autopsy ─────────────────────────────────────────


@router.get("/trades/{trade_id}")
async def get_trade_wiki(
    trade_id: str,
    user: CurrentUser = Depends(require_user),
):
    """Get trade wiki page with full signals and autopsy data.
    Falls back to raw trade_signals + trade_autopsies if no wiki page exists yet."""
    user_id = str(user.user_id)

    async with Database() as db:
        # Try wiki page first
        row = await db.fetchrow(
            """SELECT * FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = 'trade' AND page_key = $2""",
            user_id, trade_id,
        )
        if row:
            return _row_to_full(row)

        # Fall back: assemble from raw trade_signals + trade_autopsies
        signal = await db.fetchrow(
            """SELECT * FROM trade_signals
               WHERE trade_id = $1 AND user_id = $2""",
            trade_id, user_id,
        )
        autopsy = await db.fetchrow(
            """SELECT * FROM trade_autopsies
               WHERE trade_id = $1 AND user_id = $2""",
            trade_id, user_id,
        )

        if not signal and not autopsy:
            raise HTTPException(status_code=404, detail="Trade wiki data not found")

        # Build a synthetic response from raw data
        result: dict = {
            "id": None,
            "user_id": user_id,
            "page_type": "trade",
            "page_key": trade_id,
            "frontmatter": {},
            "content_md": None,
            "data_snapshot": {},
            "trade_count": 1,
            "last_trade_at": None,
            "version": 0,
            "created_at": None,
            "updated_at": None,
        }

        if signal:
            result["data_snapshot"]["signals"] = {
                "bucket": signal["bucket"],
                "category": signal["category"],
                "sub_category": signal["sub_category"],
                "bot_type_id": signal["bot_type_id"],
                "base_rate_mentioned": signal["base_rate_mentioned"],
                "risk_manager_endorsed": signal["risk_manager_endorsed"],
                "risk_manager_overridden": signal["risk_manager_overridden"],
                "forecaster_probability": float(signal["forecaster_probability"]) if signal["forecaster_probability"] is not None else 0.0,
                "forecaster_anchored": signal["forecaster_anchored"],
                "bear_word_count": signal["bear_word_count"] or 0,
                "bull_word_count": signal["bull_word_count"] or 0,
                "total_reasoning_words": signal["total_reasoning_words"] or 0,
                "model_agreement": signal["model_agreement"],
                "edge_at_entry": float(signal["edge_at_entry"]) if signal["edge_at_entry"] is not None else 0.0,
                "sources_cited": signal["sources_cited"] or 0,
                "hedge_score": signal["hedge_score"] or 0,
                "hours_to_close": float(signal["hours_to_close"]) if signal["hours_to_close"] is not None else None,
                "confidence": float(signal["confidence"]) if signal["confidence"] is not None else 0.0,
                "price": float(signal["price"]) if signal["price"] is not None else 0.0,
                "won": signal["won"],
                "pnl": float(signal["pnl"]) if signal["pnl"] is not None else 0.0,
            }
            result["frontmatter"]["bucket"] = signal["bucket"]
            result["frontmatter"]["category"] = signal["category"]
            result["last_trade_at"] = signal["created_at"].isoformat() if signal["created_at"] else None
            result["created_at"] = signal["created_at"].isoformat() if signal["created_at"] else None

        if autopsy:
            agent_scores = autopsy["agent_scores"]
            if isinstance(agent_scores, str):
                try:
                    agent_scores = json.loads(agent_scores)
                except (json.JSONDecodeError, TypeError):
                    agent_scores = {}
            result["data_snapshot"]["autopsy"] = {
                "failure_mode": autopsy["failure_mode"],
                "decision_quality": autopsy["decision_quality"],
                "narrative": autopsy["narrative"],
                "agent_scores": agent_scores,
                "key_excerpt_agent": autopsy["key_excerpt_agent"],
                "key_excerpt": autopsy["key_excerpt"],
                "outcome_driver": autopsy["outcome_driver"],
            }
            result["frontmatter"]["failure_mode"] = autopsy["failure_mode"]
            result["frontmatter"]["decision_quality"] = autopsy["decision_quality"]

        # Add related_pages for consistency with wiki-generated trade pages
        related = []
        if signal:
            if signal.get("category"):
                related.append({"page_type": "category", "page_key": signal["category"].lower().replace(" ", "-")})
            if signal.get("bot_type_id"):
                related.append({"page_type": "bot", "page_key": signal["bot_type_id"]})
        if autopsy and isinstance(autopsy.get("agent_scores"), dict):
            for agent_role in autopsy["agent_scores"]:
                related.append({"page_type": "agent", "page_key": agent_role})
        result["data_snapshot"]["related_pages"] = related

        return result


# ── Sweep page (per-user) ───────────────────────────────────────────────────


@router.get("/sweep")
async def get_sweep(
    user: CurrentUser = Depends(require_user),
):
    """Get parameter sweep page for the authenticated user."""
    user_id = str(user.user_id)

    async with Database() as db:
        row = await db.fetchrow(
            """SELECT * FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = 'sweep' AND page_key = 'parameter-sweep'""",
            user_id,
        )
        if not row:
            raise HTTPException(
                status_code=404,
                detail="No parameter sweep found for this user. Requires at least 10 settled trades.",
            )

        return _row_to_full(row)


# ── Should-Trade veto audit ───────────────────────────────────────────────────
#
# Discipline metric: how often did each bot place a trade despite its own
# LLM's ``should_trade=false`` flag, and how did those trades perform?
#
# Background: the Superforecaster pipeline ignores the LLM's self-veto by
# design (analyze.py:198 — action is gated only on numerical edge/confidence,
# not on should_trade). This endpoint surfaces the P&L impact of that
# decision so the Evaluations dashboard can show "veto override" stats per
# bot type without running raw SQL.
#
# We parse ``should_trade`` from the reasoning TEXT because it's not stored
# as a structured column. Pattern-matches both JSON-style (``"should_trade":
# false``) and Python-style (``should_trade=False``) encodings produced by
# the various agent prompts.


@router.get("/should-trade-audit")
async def get_should_trade_audit(
    environment: Optional[str] = Query(
        None, description="Filter: 'actual' (live) or 'training' (paper). Omit for all."
    ),
    user: CurrentUser = Depends(require_user),
):
    """Return per-bot P&L rollup split by the LLM's should_trade flag.

    Three buckets per bot_type:
      - ``approved_true``: reasoning contains ``should_trade: true`` / ``should_trade=true``
      - ``vetoed_false``: reasoning contains ``should_trade: false`` / ``should_trade=false``
      - ``unknown``: neither marker present (legacy reasoning formats)

    Scoped to the authenticated user. Only considers executed, settled trades
    with a non-null ``pnl`` and ``bot_reasoning``.
    """
    user_id = str(user.user_id)

    params: list = [user_id]
    env_clause = ""
    if environment in ("actual", "training"):
        params.append(environment)
        env_clause = f"AND t.environment = ${len(params)}"

    async with Database() as db:
        rows = await db.fetch(
            f"""
            WITH enriched AS (
                SELECT
                    t.pnl,
                    t.total_cost,
                    t.environment,
                    ua.bot_type_id,
                    bt.full_name AS bot_name,
                    CASE
                        WHEN position('should_trade": false' IN lower(t.bot_reasoning)) > 0
                          OR position('should_trade=false'  IN lower(t.bot_reasoning)) > 0
                        THEN 'vetoed_false'
                        WHEN position('should_trade": true' IN lower(t.bot_reasoning)) > 0
                          OR position('should_trade=true'  IN lower(t.bot_reasoning)) > 0
                        THEN 'approved_true'
                        ELSE 'unknown'
                    END AS flag
                FROM trades t
                LEFT JOIN user_agents ua ON ua.id = t.agent_id
                LEFT JOIN bot_types   bt ON bt.id = ua.bot_type_id
                WHERE t.user_id = $1::uuid
                  AND t.status = 'executed'
                  AND t.settled = TRUE
                  AND t.pnl IS NOT NULL
                  AND t.bot_reasoning IS NOT NULL
                  {env_clause}
            )
            SELECT
                bot_type_id,
                MAX(bot_name) AS bot_name,
                flag,
                COUNT(*)                                                      AS trades,
                ROUND(SUM(pnl)::numeric, 2)                                   AS total_pnl,
                ROUND(AVG(pnl)::numeric, 4)                                   AS avg_pnl,
                ROUND(SUM(total_cost)::numeric, 2)                            AS staked,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)                      AS wins,
                SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END)                     AS losses,
                ROUND(
                    100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0),
                    1
                )                                                             AS win_rate_pct,
                ROUND(
                    100.0 * SUM(pnl) / NULLIF(SUM(total_cost), 0),
                    2
                )                                                             AS roi_pct
            FROM enriched
            WHERE bot_type_id IS NOT NULL
            GROUP BY bot_type_id, flag
            ORDER BY bot_type_id, flag
            """,
            *params,
        )

    return {
        "environment": environment,
        "rows": [
            {
                "bot_type_id": r["bot_type_id"],
                "bot_name": r["bot_name"],
                "flag": r["flag"],
                "trades": int(r["trades"] or 0),
                "total_pnl": float(r["total_pnl"]) if r["total_pnl"] is not None else 0.0,
                "avg_pnl": float(r["avg_pnl"]) if r["avg_pnl"] is not None else 0.0,
                "staked": float(r["staked"]) if r["staked"] is not None else 0.0,
                "wins": int(r["wins"] or 0),
                "losses": int(r["losses"] or 0),
                "win_rate_pct": float(r["win_rate_pct"]) if r["win_rate_pct"] is not None else 0.0,
                "roi_pct": float(r["roi_pct"]) if r["roi_pct"] is not None else 0.0,
            }
            for r in rows
        ],
    }


# ── Weekly Analysis ──────────────────────────────────────────────────────────


@router.get("/analysis/latest")
async def get_analysis_latest(user: CurrentUser = Depends(require_user)):
    """Get the authenticated user's most recent weekly analysis."""
    user_id = str(user.user_id)
    async with Database() as db:
        row = await db.fetchrow(
            """SELECT * FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = 'analysis' AND page_key = 'latest'""",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="No weekly analysis found. Analysis runs weekly on Sundays.")
        return _row_to_full(row)


@router.get("/analyses")
async def list_analyses(
    limit: int = Query(12, ge=1, le=52),
    user: CurrentUser = Depends(require_user),
):
    """List the authenticated user's weekly analyses."""
    user_id = str(user.user_id)
    async with Database() as db:
        rows = await db.fetch(
            """SELECT id, user_id, page_type, page_key, frontmatter, data_snapshot,
                      trade_count, last_trade_at, version, created_at, updated_at
               FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = 'analysis' AND page_key LIKE 'weekly-%'
               ORDER BY updated_at DESC
               LIMIT $2""",
            user_id, limit,
        )
        return {"pages": [_row_to_list_item(r) for r in rows]}


@router.get("/analysis/{week}")
async def get_analysis_week(
    week: str,
    user: CurrentUser = Depends(require_user),
):
    """Get a specific week's analysis (e.g. 'weekly-2026-W15')."""
    user_id = str(user.user_id)
    page_key = week if week.startswith("weekly-") else f"weekly-{week}"
    async with Database() as db:
        row = await db.fetchrow(
            """SELECT * FROM wiki_pages
               WHERE user_id = $1::uuid AND page_type = 'analysis' AND page_key = $2""",
            user_id, page_key,
        )
        if not row:
            raise HTTPException(status_code=404, detail=f"No analysis found for week {page_key}")
        return _row_to_full(row)
