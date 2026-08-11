"""Trade Intelligence Wiki Pipeline — hosted on Railway.

Reads settled trades from Supabase, extracts signals, runs AI autopsies,
computes sweeps, and updates wiki trade pages.

Orchestration:
  - Incremental (every 15 min): Stages 0, 1, 2, 6
  - Daily (2 AM UTC):           Stages 1b, 4, 6
  - Weekly (Sunday 3 AM UTC):   Stage 3

Stages 5 (platform stats) and 7 (lint + snapshots) removed in evaluations simplification.

Usage:
  python -m backend.app.services.wiki_pipeline incremental
  python -m backend.app.services.wiki_pipeline daily
  python -m backend.app.services.wiki_pipeline weekly
  python -m backend.app.services.wiki_pipeline backfill   # one-time: process all historical trades
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

# ── Reuse pure functions from the local script ──────────────────────────────
# These are stateless functions (no CSV, no file I/O) that we import directly.
# They operate on plain dicts and return plain dicts.
#
# backend/scripts/__init__.py must exist (empty file) so this import works.
# The functions imported are all pure (dict in -> dict/str out, no file I/O):
#   - extract_signals(trade: dict) -> dict           # Stage 1 core logic
#   - parse_agent_sections(raw: str) -> dict          # Split reasoning into agent sections
#   - parse_json_response(text: str) -> dict | None   # Extract JSON from LLM output
#   - build_autopsy_user(trade, sig, avg_hedge) -> str # Build Stage 2 user prompt
#   - postprocess_autopsy(autopsy, trade, sig, model) -> dict # Enrich autopsy result
#   - extract_key_excerpt(raw, agent_name) -> str | None
#   - compute_batch_stats(signals, autopsies) -> dict  # Stage 3 deterministic stats
#   - AUTOPSY_SYSTEM: str                             # Stage 2 system prompt
#   (PATTERN_SYSTEM removed — analysis now uses ANALYSIS_SYSTEM only)
#   - QUALITY_MAP: dict                               # failure_mode -> decision_quality
try:
    from backend.scripts.trade_intelligence import (
        ANALYSIS_SYSTEM,
        AUTOPSY_SYSTEM,
        QUALITY_MAP,
        build_autopsy_user,
        compute_batch_stats,
        extract_key_excerpt,
        extract_signals,
        parse_agent_sections,
        parse_json_response,
        postprocess_autopsy,
    )
except ImportError:
    # Fallback: add scripts dir to sys.path for standalone execution
    from pathlib import Path as _Path

    _scripts_dir = str(_Path(__file__).resolve().parents[2] / "scripts")
    if _scripts_dir not in sys.path:
        sys.path.insert(0, _scripts_dir)
    from trade_intelligence import (  # type: ignore[import-untyped]
        ANALYSIS_SYSTEM,
        AUTOPSY_SYSTEM,
        QUALITY_MAP,
        build_autopsy_user,
        compute_batch_stats,
        extract_key_excerpt,
        extract_signals,
        parse_agent_sections,
        parse_json_response,
        postprocess_autopsy,
    )

logger = logging.getLogger("wiki_pipeline")

# ── Prompt versioning ──────────────────────────────────────────────────────
# Bump this string whenever AUTOPSY_SYSTEM or build_autopsy_user() changes.
# Stored on every trade_autopsies row so we can filter/compare prompt versions.
PROMPT_VERSION = "autopsy_v1_2026-04-10"

# ── Sub-category derivation rules ──────────────────────────────────────────
SUB_CATEGORY_RULES: dict[str, list[tuple[str, str]]] = {
    "Other": [
        (r"O/U \d+\.5", "Soccer O/U"),
        (r"Spread:.*\(-?\d+\.5\)", "Soccer Spreads"),
        (r"will.*win on", "Soccer Moneyline"),
        (r"end in a draw", "Soccer Draw"),
        (r"Map Handicap", "Esports Map Handicap"),
        (r"Games Total", "Esports Games Total"),
        (r"BO\d", "Esports Match"),
        (r"finish in the Top", "Golf Top Finish"),
        (r"vs\.", "Sports Matchup"),
    ],
    "Weather": [
        (r"highest temperature.*be \d+°", "Weather Exact Temp"),
        (r"between \d+-\d+°", "Weather Temp Range"),
        (r"precipitation", "Weather Precipitation"),
    ],
    "Crypto": [
        (r"above \$\d+", "Crypto Price Above"),
        (r"between \$\d+", "Crypto Price Range"),
        (r"Up or Down", "Crypto Direction"),
    ],
    "Tech": [
        (r"close above \$\d+", "Stock Price Above"),
        (r"MSFT|GOOGL|AAPL|AMZN|META|NVDA", "Stock Individual"),
    ],
    "Politics": [],
    "Sports": [],
    "Economics": [],
}


# ============================================================================
# Config
# ============================================================================

@dataclass
class WikiConfig:
    """Pipeline configuration, loaded from environment variables."""

    database_url: str = field(
        repr=False,  # contains password — never print
        default_factory=lambda: os.environ.get(
            "DATABASE_URL",
            "postgresql://postgres:password@localhost:5432/agent_fund",
        ),
    )
    openai_api_key: str = field(
        repr=False,  # secret — never print
        default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""),
    )
    openai_model: str = field(
        default_factory=lambda: os.environ.get("OPENAI_MODEL", "gpt-5.4")
    )
    openai_reasoning_effort: str = field(
        default_factory=lambda: os.environ.get("OPENAI_REASONING_EFFORT", "xhigh")
    )
    openai_url: str = "https://api.openai.com/v1/chat/completions"
    daily_ai_budget: float = 10.0  # USD per day
    concurrency: int = 15  # max parallel OpenAI calls in Stage 2
    sentry_dsn: str = field(
        repr=False,  # may contain token — never print
        default_factory=lambda: os.environ.get("SENTRY_DSN", ""),
    )

    def validate(self) -> None:
        """Raise ValueError if required config is missing."""
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")


# ============================================================================
# Database helpers
# ============================================================================

async def create_pool(config: WikiConfig) -> asyncpg.Pool:
    """Create asyncpg connection pool.

    Detects Supabase PgBouncer and sets statement_cache_size=0.
    Retries up to 5 times with exponential backoff.
    """
    is_pooler = (
        "pooler.supabase" in (config.database_url or "")
        or "supabase.co:6543" in (config.database_url or "")
    )

    max_retries = 5
    base_delay = 2  # seconds

    for attempt in range(1, max_retries + 1):
        try:
            pool = await asyncpg.create_pool(
                dsn=config.database_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                timeout=30,
                statement_cache_size=0 if is_pooler else 100,
            )
            logger.info("Database pool initialized (attempt %d)", attempt)
            return pool
        except (asyncpg.PostgresError, OSError, asyncio.TimeoutError) as e:
            if attempt == max_retries:
                logger.error(
                    "Failed to connect after %d attempts: %s", max_retries, e
                )
                raise
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "DB connection attempt %d/%d failed: %s. Retrying in %ds...",
                attempt, max_retries, e, delay,
            )
            await asyncio.sleep(delay)

    # Should never reach here, but satisfy type checker
    raise RuntimeError("Failed to create database pool")


async def log_event(
    pool: asyncpg.Pool,
    *,
    action: str,
    stage: str | None = None,
    user_id: str | None = None,
    details: dict | None = None,
    message: str = "",
    pipeline_run_id: str | None = None,
) -> None:
    """Append a row to wiki_log. Never raises — logging failures are swallowed."""
    try:
        await pool.execute(
            """INSERT INTO wiki_log (action, stage, user_id, details, message, pipeline_run_id)
               VALUES ($1, $2, $3, $4::jsonb, $5, $6)""",
            action,
            stage,
            user_id,
            json.dumps(details) if details else None,
            message,
            pipeline_run_id,
        )
    except Exception as e:
        logger.warning("Failed to write wiki_log: %s", e)


# ============================================================================
# OpenAI API caller (async, with retry)
# ============================================================================

# Approximate cost per token for GPT-4o (as of 2024)
_COST_PER_INPUT_TOKEN = 2.50 / 1_000_000   # $2.50 per 1M input tokens
_COST_PER_OUTPUT_TOKEN = 10.00 / 1_000_000  # $10.00 per 1M output tokens


async def call_openai_api(
    config: WikiConfig,
    system: str,
    user: str,
    timeout: int = 60,
) -> tuple[dict | None, float]:
    """Call OpenAI chat completion, return (parsed_json, cost_usd).

    Returns (None, 0.0) on failure. Never raises.
    """
    try:
        import httpx
    except ImportError:
        logger.error("httpx not installed — run: pip install httpx")
        return None, 0.0

    headers = {
        "Authorization": f"Bearer {config.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": config.openai_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_completion_tokens": 2000,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(3):
            try:
                resp = await client.post(
                    config.openai_url, json=payload, headers=headers
                )
                if resp.status_code == 429:
                    wait = min(2 ** attempt * 2, 30)
                    logger.warning("OpenAI 429, retrying in %ds", wait)
                    await asyncio.sleep(wait)
                    continue
                if resp.status_code >= 500:
                    await asyncio.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = parse_json_response(content)

                # Estimate cost from usage
                usage = data.get("usage", {})
                cost = (
                    usage.get("prompt_tokens", 0) * _COST_PER_INPUT_TOKEN
                    + usage.get("completion_tokens", 0) * _COST_PER_OUTPUT_TOKEN
                )
                return parsed, round(cost, 6)
            except Exception as e:
                if attempt == 2:
                    logger.error("OpenAI API failed after 3 attempts: %s", e)
                    return None, 0.0
                await asyncio.sleep(2)
    return None, 0.0


# ============================================================================
# Stage 0: Data Pull
# ============================================================================


def _to_dt(val) -> "datetime | None":
    """Coerce a string or datetime to datetime, or return None.

    extract_signals returns cfg_deployed_at as an ISO string (because
    _record_to_dict converts all datetimes to strings). But the INSERT
    target is TIMESTAMPTZ, so asyncpg needs a real datetime object.
    """
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            s = val.replace("+00", "+00:00").replace("Z", "+00:00")
            if "+" not in s and "-" not in s[10:]:
                s += "+00:00"
            return datetime.fromisoformat(s)
        except (ValueError, TypeError):
            return None
    return None


def _record_to_dict(row: asyncpg.Record) -> dict:
    """Convert asyncpg.Record to a plain dict with string UUIDs and ISO datetimes.

    Also decodes JSONB columns that come back as raw strings (asyncpg has no
    JSONB codec registered on this pool — see quant_report.py:coerce_db_row).
    The deployment_snapshots LATERAL join populates `cfg_at_trade` and
    `rules_at_trade` as raw JSON strings; both must be dict/None before
    `extract_signals` reads them.
    """
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex") and hasattr(v, "int"):
            # UUID object
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
    # Ensure numeric fields are proper Python types for extract_signals
    for fld in ("price", "total_cost", "confidence", "pnl", "cf_pnl",
                "capital_alloc_at_trade"):
        if d.get(fld) is not None:
            try:
                d[fld] = float(d[fld])
            except (ValueError, TypeError):
                d[fld] = None
    for fld in ("count", "cf_count"):
        if d.get(fld) is not None:
            try:
                d[fld] = int(d[fld])
            except (ValueError, TypeError):
                d[fld] = None
    for fld in ("settled", "cf_settled"):
        d[fld] = bool(d.get(fld))
    # JSONB columns from deployment_snapshots LATERAL — parse if asyncpg
    # returned a raw string (no codec registered).
    for fld in ("cfg_at_trade", "rules_at_trade"):
        v = d.get(fld)
        if isinstance(v, str):
            try:
                d[fld] = json.loads(v)
            except (ValueError, TypeError):
                d[fld] = None  # invalid JSON → treat as missing rather than risk double-encoding
    return d


async def pull_new_trades(pool: asyncpg.Pool) -> list[dict]:
    """Query trades that don't yet have trade_signals rows.

    Joins deployment_snapshots LATERAL (most-recent snapshot at-or-before
    t.timestamp) to populate cfg_at_trade / rules_at_trade / mode_at_trade /
    capital_alloc_at_trade / cfg_deployed_at on every trade. Mirrors
    quant_report.py:_DB_FETCH_SQL (L755-766).
    """
    try:
        rows = await pool.fetch(
            """SELECT t.id, t.agent_id, t.user_id, ua.bot_type_id,
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
               WHERE NOT EXISTS (SELECT 1 FROM trade_signals ts2 WHERE ts2.trade_id = t.id)
                 AND (
                   (t.settled = TRUE AND t.pnl IS NOT NULL)
                   OR (t.status IN ('skipped', 'rejected', 'error', 'paper')
                       AND t.cf_settled = TRUE
                       AND t.cf_pnl IS NOT NULL)
                 )
               ORDER BY t.timestamp ASC"""
        )
        trades = [_record_to_dict(r) for r in rows]
        logger.info("Stage 0: pulled %d new trades", len(trades))
        return trades
    except Exception as e:
        logger.error("Stage 0: DB error pulling trades: %s", e)
        return []


# ============================================================================
# Stage 1: Signal Extraction
# ============================================================================

def derive_sub_category(category: str | None, market_title: str | None) -> str | None:
    """Derive sub_category from category + market_title using SUB_CATEGORY_RULES."""
    if not category or not market_title:
        return None
    rules = SUB_CATEGORY_RULES.get(category, [])
    for pattern, sub_cat in rules:
        if re.search(pattern, market_title, re.IGNORECASE):
            return sub_cat
    return None


async def extract_and_store_signals(
    pool: asyncpg.Pool,
    trades: list[dict],
    pipeline_run_id: Optional[str] = None,
) -> int:
    """Run extract_signals() on each trade, UPSERT into trade_signals.

    On conflict, refreshes all extracted fields (handles updated raw_reasoning,
    recomputed edge_at_entry, etc.) and sets updated_at + pipeline_run_id.

    Phase A: writes the 28 new columns added by migration 037 (debate JSON
    fields, deployment snapshot, real-vs-cf split, per-agent records, etc.).
    JSONB columns are passed as JSON strings so asyncpg's $N::jsonb cast
    accepts them regardless of codec configuration.
    """
    if not trades:
        return 0

    rows_to_insert: list[tuple] = []
    skipped = 0

    for t in trades:
        if len(t.get("raw_reasoning") or "") < 10:
            skipped += 1
            continue
        try:
            sig = extract_signals(t)
            sub_cat = derive_sub_category(t.get("category"), t.get("market_title"))

            # JSONB columns must be JSON-encoded for the $N::jsonb cast.
            per_agent_json = (
                json.dumps(sig.get("per_agent")) if sig.get("per_agent") is not None else None
            )
            cfg_at_trade_json = (
                json.dumps(sig.get("cfg_at_trade")) if sig.get("cfg_at_trade") is not None else None
            )
            rules_at_trade_json = (
                json.dumps(sig.get("rules_at_trade")) if sig.get("rules_at_trade") is not None else None
            )

            rows_to_insert.append((
                t["id"],                                      # $1  trade_id
                t["user_id"],                                 # $2  user_id (NOT NULL)
                sig["bot_type_id"],                           # $3  bot_type_id (NOT NULL)
                sig.get("category"),                          # $4  category
                sub_cat,                                      # $5  sub_category
                sig["bucket"],                                # $6  bucket
                sig.get("base_rate_mentioned"),               # $7  base_rate_mentioned
                sig.get("risk_manager_endorsed"),             # $8  risk_manager_endorsed
                sig.get("risk_manager_overridden"),           # $9  risk_manager_overridden
                sig.get("forecaster_probability"),            # $10 forecaster_probability
                sig.get("forecaster_anchored_to_price"),      # $11 forecaster_anchored
                sig.get("bear_word_count"),                   # $12 bear_word_count (may be NULL for SF)
                sig.get("bull_word_count"),                   # $13 bull_word_count (may be NULL for SF)
                sig.get("total_reasoning_words", 0),          # $14 total_reasoning_words
                sig.get("model_agreement"),                   # $15 model_agreement
                sig.get("edge_at_entry"),                     # $16 edge_at_entry
                sig.get("sources_cited", 0),                  # $17 sources_cited
                sig.get("hedge_score", 0),                    # $18 hedge_score
                sig.get("hours_to_close"),                    # $19 hours_to_close
                sig.get("confidence"),                        # $20 confidence
                sig.get("price"),                             # $21 price
                sig.get("won"),                               # $22 won
                sig.get("pnl"),                               # $23 pnl
                t.get("environment", "training"),             # $24 environment
                pipeline_run_id,                              # $25 pipeline_run_id

                # ── NEW (migration 037) — 28 additional columns ──
                # Edge / anchor fixes
                sig.get("forecaster_edge_signed"),            # $26 forecaster_edge_signed
                sig.get("anchor_delta"),                      # $27 anchor_delta
                sig.get("skip_reason"),                       # $28 skip_reason
                # Outcome split
                sig.get("real_won"),                          # $29 real_won
                sig.get("cf_won"),                            # $30 cf_won
                sig.get("real_pnl"),                          # $31 real_pnl
                sig.get("cf_pnl"),                            # $32 cf_pnl
                sig.get("cf_settled"),                        # $33 cf_settled
                # Risk Manager debate JSON
                sig.get("ev_estimate"),                       # $34 ev_estimate
                sig.get("risk_score"),                        # $35 risk_score
                sig.get("true_probability"),                  # $36 true_probability
                sig.get("recommended_size_pct"),              # $37 recommended_size_pct
                sig.get("edge_durability_hours"),             # $38 edge_durability_hours
                sig.get("rm_recommended_side"),               # $39 rm_recommended_side
                # Debate bracket
                sig.get("probability_floor"),                 # $40 probability_floor
                sig.get("probability_ceiling"),               # $41 probability_ceiling
                sig.get("debate_bracket_width"),              # $42 debate_bracket_width
                # Research quality
                sig.get("research_quality_score"),            # $43 research_quality_score
                sig.get("research_model"),                    # $44 research_model
                # Per-agent records (JSONB)
                per_agent_json,                               # $45 per_agent
                # Deployment snapshot at trade
                cfg_at_trade_json,                            # $46 cfg_at_trade
                rules_at_trade_json,                          # $47 rules_at_trade
                sig.get("mode_at_trade"),                     # $48 mode_at_trade
                sig.get("capital_alloc_at_trade"),            # $49 capital_alloc_at_trade
                _to_dt(sig.get("cfg_deployed_at")),           # $50 cfg_deployed_at (TIMESTAMPTZ)
                # Trade primitives the original schema missed
                sig.get("exchange"),                          # $51 exchange
                sig.get("model"),                             # $52 model
                sig.get("total_cost"),                        # $53 total_cost
            ))
        except Exception as e:
            logger.warning("Stage 1: extract_signals failed for %s: %s", str(t.get("id", "?"))[:8], e)
            skipped += 1

    if not rows_to_insert:
        logger.info("Stage 1: no signals to insert (%d skipped)", skipped)
        return 0

    try:
        async with pool.acquire() as conn:
            await conn.executemany(
                """INSERT INTO trade_signals (
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
                       updated_at = NOW()""",
                rows_to_insert,
            )
        inserted = len(rows_to_insert)
        logger.info("Stage 1: upserted %d signals (%d skipped)", inserted, skipped)
        return inserted
    except Exception as e:
        logger.error("Stage 1: DB error upserting signals: %s", e)
        raise


# ============================================================================
# Stage 2: AI Autopsy
# ============================================================================

async def run_autopsies(
    pool: asyncpg.Pool,
    config: WikiConfig,
    pipeline_run_id: Optional[str] = None,
    force_refresh: bool = False,
) -> int:
    """Find trades with signals that need autopsies, call the LLM, UPSERT into trade_autopsies.

    By default, only processes trades without an autopsy. Set force_refresh=True
    to regenerate autopsies for ALL trades (uses existing UPSERT, preserves created_at,
    updates regenerated_at + updated_at).
    """

    # --- Check daily budget ---
    try:
        today_spend = await pool.fetchval(
            """SELECT COALESCE(SUM(cost_usd), 0)
               FROM trade_autopsies
               WHERE created_at >= CURRENT_DATE
                 AND (regenerated_at IS NULL OR regenerated_at < CURRENT_DATE)"""
        )
        today_spend = float(today_spend or 0)
    except Exception as e:
        logger.warning("Stage 2: could not check budget: %s", e)
        today_spend = 0.0

    if today_spend >= config.daily_ai_budget:
        logger.info(
            "Stage 2: daily budget exhausted ($%.2f / $%.2f)",
            today_spend, config.daily_ai_budget,
        )
        return 0

    # --- Fetch eligible trades ---
    # By default: trades with signals but no autopsy.
    # force_refresh=True: ALL trades with signals (regenerate every autopsy).
    existence_filter = "" if force_refresh else (
        "AND NOT EXISTS (SELECT 1 FROM trade_autopsies ta2 WHERE ta2.trade_id = ts.trade_id)"
    )
    try:
        rows = await pool.fetch(
            f"""SELECT ts.trade_id, ts.bucket, ts.base_rate_mentioned,
                      ts.risk_manager_endorsed, ts.risk_manager_overridden,
                      ts.forecaster_probability, ts.forecaster_anchored,
                      ts.bear_word_count, ts.bull_word_count, ts.total_reasoning_words,
                      ts.model_agreement, ts.edge_at_entry, ts.sources_cited,
                      ts.hedge_score, ts.hours_to_close, ts.confidence, ts.price,
                      ts.won, ts.pnl, ts.user_id, ts.bot_type_id, ts.category,
                      t.market_title, t.side, t.status, t.raw_reasoning
               FROM trade_signals ts
               JOIN trades t ON t.id = ts.trade_id
               WHERE length(t.raw_reasoning) > 200
                 {existence_filter}
               ORDER BY t.timestamp ASC"""
        )
    except Exception as e:
        logger.error("Stage 2: DB error fetching eligible trades: %s", e)
        return 0

    if not rows:
        logger.info("Stage 2: no trades needing autopsy")
        return 0

    # --- Average hedge score for prompt context ---
    try:
        avg_hedge_val = await pool.fetchval("SELECT AVG(hedge_score) FROM trade_signals")
        avg_hedge = float(avg_hedge_val) if avg_hedge_val else 5.0
    except Exception:
        avg_hedge = 5.0

    logger.info("Stage 2: %d trades eligible for autopsy", len(rows))

    sem = asyncio.Semaphore(config.concurrency)
    created_count = 0
    failed_count = 0
    cumulative_cost = today_spend

    async def process_one(row: asyncpg.Record) -> bool:
        nonlocal created_count, failed_count, cumulative_cost

        # Budget gate (approximate — checked before each call)
        if cumulative_cost >= config.daily_ai_budget:
            return False

        # Reconstruct dicts for the imported pure functions
        sig = {
            "trade_id": str(row["trade_id"]),
            "bucket": row["bucket"],
            "base_rate_mentioned": row["base_rate_mentioned"],
            "risk_manager_endorsed": row["risk_manager_endorsed"],
            "risk_manager_overridden": row["risk_manager_overridden"],
            "forecaster_probability": float(row["forecaster_probability"]) if row["forecaster_probability"] is not None else None,
            "forecaster_anchored_to_price": row["forecaster_anchored"],
            "bear_word_count": row["bear_word_count"] or 0,
            "bull_word_count": row["bull_word_count"] or 0,
            "total_reasoning_words": row["total_reasoning_words"] or 0,
            "model_agreement": row["model_agreement"],
            "edge_at_entry": float(row["edge_at_entry"]) if row["edge_at_entry"] is not None else None,
            "sources_cited": row["sources_cited"] or 0,
            "hedge_score": row["hedge_score"] or 0,
            "hours_to_close": float(row["hours_to_close"]) if row["hours_to_close"] is not None else None,
            "confidence": float(row["confidence"]) if row["confidence"] is not None else None,
            "price": float(row["price"]) if row["price"] is not None else None,
            "won": row["won"],
            "pnl": float(row["pnl"]) if row["pnl"] is not None else None,
            "bot_type_id": row["bot_type_id"],
            "category": row["category"],
        }
        trade = {
            "id": str(row["trade_id"]),
            "market_title": row["market_title"],
            "side": row["side"],
            "status": row["status"],
            "price": sig["price"],
            "confidence": sig["confidence"],
            "raw_reasoning": row["raw_reasoning"],
            "bot_type_id": row["bot_type_id"],
        }

        user_msg = build_autopsy_user(trade, sig, avg_hedge)

        async with sem:
            result, cost = await call_openai_api(config, AUTOPSY_SYSTEM, user_msg)

        cumulative_cost += cost

        if result is None or not result.get("failure_mode"):
            logger.warning(
                "Stage 2: autopsy failed for %s", str(row["trade_id"])[:8]
            )
            failed_count += 1
            return False

        model_name = f"openai/{config.openai_model}:reasoning={config.openai_reasoning_effort}"
        result = postprocess_autopsy(result, trade, sig, model_name)

        # UPSERT into trade_autopsies — on conflict, refresh all fields
        # and set regenerated_at + updated_at. Original created_at is preserved.
        try:
            await pool.execute(
                """INSERT INTO trade_autopsies (
                       trade_id, user_id, bot_type_id,
                       failure_mode, decision_quality, narrative,
                       agent_scores, key_excerpt_agent, key_excerpt,
                       outcome_driver, model_used, cost_usd,
                       pipeline_run_id, prompt_version, updated_at
                   ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,NOW())
                   ON CONFLICT (trade_id) DO UPDATE SET
                       failure_mode = EXCLUDED.failure_mode,
                       decision_quality = EXCLUDED.decision_quality,
                       narrative = EXCLUDED.narrative,
                       agent_scores = EXCLUDED.agent_scores,
                       key_excerpt_agent = EXCLUDED.key_excerpt_agent,
                       key_excerpt = EXCLUDED.key_excerpt,
                       outcome_driver = EXCLUDED.outcome_driver,
                       model_used = EXCLUDED.model_used,
                       cost_usd = EXCLUDED.cost_usd,
                       pipeline_run_id = EXCLUDED.pipeline_run_id,
                       prompt_version = EXCLUDED.prompt_version,
                       regenerated_at = NOW(),
                       updated_at = NOW()""",
                row["trade_id"],
                row["user_id"],
                row["bot_type_id"],
                result.get("failure_mode", "UNKNOWN"),
                result.get("decision_quality", "ACCEPTABLE"),
                result.get("narrative", ""),
                json.dumps(result.get("agent_scores")) if result.get("agent_scores") else None,
                result.get("key_excerpt_agent"),
                result.get("key_excerpt"),
                result.get("outcome_driver"),
                model_name,
                cost,
                pipeline_run_id,
                PROMPT_VERSION,
            )
            created_count += 1
            return True
        except Exception as e:
            logger.warning(
                "Stage 2: DB insert failed for %s: %s",
                str(row["trade_id"])[:8], e,
            )
            failed_count += 1
            return False

    # Run all in parallel (bounded by semaphore)
    tasks = [process_one(r) for r in rows]
    await asyncio.gather(*tasks)

    logger.info(
        "Stage 2: created %d autopsies (%d failed), total cost today $%.4f",
        created_count, failed_count, cumulative_cost,
    )

    # Log failures to wiki_log so they appear in the Activity tab
    if failed_count > 0:
        await log_event(
            pool,
            action="pipeline_warning",
            stage="stage_2",
            details={
                "autopsies_failed": failed_count,
                "autopsies_created": created_count,
                "total_attempted": len(rows),
                "cost_today_usd": round(cumulative_cost, 4),
            },
            message=f"Autopsy failures: {failed_count} of {len(rows)} failed (API error or malformed response)",
            pipeline_run_id=pipeline_run_id,
        )

    return created_count


# ============================================================================
# Stage 3: Batch Patterns
# ============================================================================

async def compute_patterns(
    pool: asyncpg.Pool,
    config: "WikiConfig",
    pipeline_run_id: Optional[str] = None,
) -> dict | None:
    """DEPRECATED — replaced by run_weekly_analysis in Phase C.

    Kept as a stub to avoid breaking any callers that reference it.
    Returns None immediately.
    """
    logger.info("Stage 3 (compute_patterns): DEPRECATED — use run_weekly_analysis instead")
    return None


async def run_weekly_analysis(
    pool: asyncpg.Pool,
    config: "WikiConfig",
    pipeline_run_id: Optional[str] = None,
) -> dict:
    """Stage 3 (Phase C): Weekly per-user LLM analysis.

    For each user with sufficient data, reads their aggregates (Stage 1b output),
    fetches recent signals, builds a signal digest via compute_batch_stats,
    and calls the LLM with the ANALYSIS_SYSTEM prompt to produce a weekly report.

    Results are upserted to wiki_pages with type='analysis'.
    """
    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    week_key = f"weekly-{iso_year}-W{iso_week:02d}"

    summary: dict[str, Any] = {
        "users_processed": 0,
        "users_skipped": 0,
        "total_cost_usd": 0.0,
        "week_key": week_key,
    }

    # 1. Get distinct users from trade_signals
    try:
        user_rows = await pool.fetch(
            "SELECT DISTINCT user_id FROM trade_signals WHERE user_id IS NOT NULL"
        )
    except Exception as e:
        logger.error("Stage 3 (analysis): failed to fetch user list: %s", e)
        return summary

    for ur in user_rows:
        user_id = str(ur["user_id"])

        try:
            # 2a. Read this user's aggregates from wiki_pages
            agg_row = await pool.fetchval(
                """SELECT data_snapshot FROM wiki_pages
                   WHERE user_id = $1::uuid AND page_type = 'aggregates' AND page_key = 'latest'""",
                user_id,
            )
            if not agg_row:
                logger.info("Stage 3 (analysis): user %s has no aggregates, skipping", user_id[:8])
                summary["users_skipped"] += 1
                continue

            aggregates = json.loads(agg_row) if isinstance(agg_row, str) else agg_row

            # 2b. Fetch recent signals (14-day window)
            sig_rows = await pool.fetch(
                """SELECT trade_id, bucket, category, confidence, edge_at_entry,
                          hedge_score, total_reasoning_words, bear_word_count,
                          bull_word_count, base_rate_mentioned, sources_cited,
                          won, pnl, bot_type_id
                   FROM trade_signals
                   WHERE user_id = $1::uuid AND created_at > NOW() - INTERVAL '14 days'""",
                user_id,
            )
            # Convert to list[dict] for compute_batch_stats
            signals = []
            for r in sig_rows:
                d = dict(r)
                d["trade_id"] = str(d["trade_id"])
                for fld in ("confidence", "edge_at_entry", "pnl"):
                    if d.get(fld) is not None:
                        d[fld] = float(d[fld])
                for fld in ("hedge_score", "total_reasoning_words", "bear_word_count",
                            "bull_word_count", "sources_cited"):
                    if d.get(fld) is not None:
                        d[fld] = int(d[fld])
                signals.append(d)

            # 3. Skip users with < 10 signals in 14-day window
            if len(signals) < 10:
                logger.info(
                    "Stage 3 (analysis): user %s has only %d signals in 14d window, need 10+",
                    user_id[:8], len(signals),
                )
                summary["users_skipped"] += 1
                continue

            # 2b (cont). Build signal digest
            batch_stats = compute_batch_stats(signals)

            # 2c. Get deterministic alerts from aggregates
            deterministic_alerts = aggregates.get("recommendations", [])

            # 2d. Build compact user message with all aggregate sections
            bt = Counter(s.get("bot_type_id") for s in signals)
            _j = lambda obj: json.dumps(obj, default=str, indent=None)

            # Aggregate sections to include (from wiki_aggregates.aggregate_all)
            agg_sections = [
                "calibration", "correlations", "conf_edge_inversion",
                "ev_calibration", "forecaster_vs_rm_brier", "rolling_window",
                "config_cohorts", "per_agent", "sides", "per_model",
                "hit_rate_by_confidence", "hit_rate_by_signed_edge",
                "debate_bracket", "cf_deep_dive", "rules_pnl_correlation",
            ]

            parts = [
                f"## Bot Distribution:\n{_j(dict(bt))} — {len(signals)} signals (14d window)\n",
                f"## Bucket Comparison:\n{_j(batch_stats.get('bucket_comparison', {}))}\n",
                f"## Category Stats:\n{_j(batch_stats.get('category_stats', {}))}\n",
            ]

            for section_key in agg_sections:
                section_data = aggregates.get(section_key)
                if section_data is not None:
                    parts.append(f"## {section_key}:\n{_j(section_data)}\n")

            # Include the new market breakdown data for price/timing analysis
            for extra_key in (
                "hit_rate_by_price", "hit_rate_by_timing",
                "weekly_per_bot", "market_by_week",
            ):
                extra_data = aggregates.get(extra_key)
                if extra_data is not None:
                    parts.append(f"## {extra_key}:\n{_j(extra_data)}\n")

            parts.append(f"## deterministic_alerts:\n{_j(deterministic_alerts)}\n")

            user_msg = "\n".join(parts)

            # Truncate if over ~25KB to keep costs low (bumped from 15KB to include price/timing data)
            if len(user_msg) > 25000:
                user_msg = user_msg[:25000] + "\n\n[TRUNCATED — remaining sections omitted for cost control]"

            # 2e. Call OpenAI
            result, cost = await call_openai_api(config, ANALYSIS_SYSTEM, user_msg, timeout=120)
            if not result:
                logger.warning("Stage 3 (analysis): OpenAI call failed for user %s", user_id[:8])
                continue

            # Attach metadata
            result["_metadata"] = {
                "user_id": user_id,
                "week_key": week_key,
                "trade_count": len(signals),
                "signal_count": len(signals),
                "cost_usd": cost,
                "generated_at": now.isoformat(),
                "pipeline_run_id": pipeline_run_id,
            }

            result_json = json.dumps(result, default=str)

            # 2f. UPSERT to wiki_pages — weekly key
            await pool.execute(
                """INSERT INTO wiki_pages (user_id, page_type, page_key, data_snapshot, trade_count, last_trade_at, version)
                   VALUES ($1::uuid, 'analysis', $2, $3::jsonb, $4, NOW(), 1)
                   ON CONFLICT (user_id, page_type, page_key)
                   DO UPDATE SET data_snapshot = $3::jsonb,
                                trade_count = $4,
                                version = wiki_pages.version + 1,
                                updated_at = NOW()""",
                user_id, week_key, result_json, len(signals),
            )

            # UPSERT to wiki_pages — latest
            await pool.execute(
                """INSERT INTO wiki_pages (user_id, page_type, page_key, data_snapshot, trade_count, last_trade_at, version)
                   VALUES ($1::uuid, 'analysis', 'latest', $2::jsonb, $3, NOW(), 1)
                   ON CONFLICT (user_id, page_type, page_key)
                   DO UPDATE SET data_snapshot = $2::jsonb,
                                trade_count = $3,
                                version = wiki_pages.version + 1,
                                updated_at = NOW()""",
                user_id, result_json, len(signals),
            )

            # 2g. Log to wiki_log
            await log_event(
                pool,
                user_id=user_id,
                action="pipeline_run",
                stage="stage_3",
                details={"week_key": week_key, "cost_usd": cost,
                         "interactions": len(result.get("interactions", [])),
                         "config_suggestions": len(result.get("config_suggestions", []))},
                message=f"Weekly analysis for user {user_id[:8]} ({week_key}, cost ${cost:.4f})",
                pipeline_run_id=pipeline_run_id,
            )

            summary["users_processed"] += 1
            summary["total_cost_usd"] += cost
            logger.info(
                "Stage 3 (analysis): user %s analysis complete (%s, cost $%.4f)",
                user_id[:8], week_key, cost,
            )

        except Exception as e:
            logger.error("Stage 3 (analysis): failed for user %s: %s", user_id[:8], e)
            summary["users_skipped"] += 1

    summary["total_cost_usd"] = round(summary["total_cost_usd"], 6)
    logger.info(
        "Stage 3 (analysis): complete — %d users processed, %d skipped, cost $%.4f",
        summary["users_processed"], summary["users_skipped"], summary["total_cost_usd"],
    )
    return summary


# ============================================================================
# Stage 1b: Cross-trade Aggregate Signals (per user)
# ============================================================================

async def compute_aggregate_signals(
    pool: asyncpg.Pool,
    pipeline_run_id: Optional[str] = None,
) -> dict:
    """Stage 1b: compute cross-trade aggregate signals per user.

    For each distinct user_id in trade_signals, reads their signals,
    runs all 22+ aggregate functions from wiki_aggregates.py, and
    stores the result in wiki_pages(user_id=<user>, type='aggregates', key='latest').

    Skips users with fewer than 10 settled trades.
    """
    from .wiki_aggregates import aggregate_all

    # Get distinct users
    user_rows = await pool.fetch(
        "SELECT DISTINCT user_id FROM trade_signals WHERE user_id IS NOT NULL"
    )

    results = {}
    for ur in user_rows:
        user_id = str(ur["user_id"])

        # Fetch this user's trade_signals joined with trades for status/side/timestamp/market_title
        rows = await pool.fetch(
            """SELECT ts.*, t.side, t.status, t.timestamp, t.market_title
               FROM trade_signals ts
               JOIN trades t ON t.id = ts.trade_id
               WHERE ts.user_id = $1::uuid""",
            user_id,
        )

        # Convert to list[dict] with proper type coercion
        signals = []
        for r in rows:
            d = dict(r)
            d["trade_id"] = str(d.get("trade_id", ""))
            d["user_id"] = str(d.get("user_id", ""))
            # Coerce numeric fields to float
            for fld in ("confidence", "edge_at_entry", "pnl", "price",
                        "forecaster_probability", "forecaster_edge_signed",
                        "anchor_delta", "ev_estimate", "risk_score",
                        "true_probability", "recommended_size_pct",
                        "edge_durability_hours", "probability_floor",
                        "probability_ceiling", "debate_bracket_width",
                        "research_quality_score", "hours_to_close",
                        "real_pnl", "cf_pnl", "total_cost",
                        "capital_alloc_at_trade"):
                if d.get(fld) is not None:
                    try:
                        d[fld] = float(d[fld])
                    except (ValueError, TypeError):
                        d[fld] = None
            # Coerce integer fields
            for fld in ("hedge_score", "total_reasoning_words", "bear_word_count",
                        "bull_word_count", "sources_cited", "model_agreement"):
                v = d.get(fld)
                if v is not None:
                    try:
                        d[fld] = int(v)
                    except (ValueError, TypeError):
                        d[fld] = None
            # Boolean fields
            for fld in ("base_rate_mentioned", "risk_manager_endorsed",
                        "risk_manager_overridden", "won", "real_won",
                        "cf_won", "cf_settled", "forecaster_anchored"):
                v = d.get(fld)
                if v is not None:
                    d[fld] = bool(v)
            # JSONB fields - parse if string
            for fld in ("per_agent", "cfg_at_trade", "rules_at_trade"):
                v = d.get(fld)
                if isinstance(v, str):
                    try:
                        d[fld] = json.loads(v)
                    except (json.JSONDecodeError, TypeError):
                        pass
            # Map legacy field names for quant_report.py compatibility
            if "forecaster_anchored" in d:
                d["forecaster_anchored_to_price"] = d.pop("forecaster_anchored", None)
            signals.append(d)

        # Check minimum threshold
        settled = [s for s in signals if s.get("pnl") is not None]
        if len(settled) < 10:
            logger.info("Stage 1b: user %s has only %d settled trades, skipping (need 10+)",
                       user_id[:8], len(settled))
            continue

        # Run all aggregates
        try:
            stats = aggregate_all(signals)
        except Exception as e:
            logger.error("Stage 1b: aggregate_all failed for user %s: %s", user_id[:8], e)
            continue

        # Remove the _signals key (used only for rendering in the script)
        stats.pop("_signals", None)

        # Compute provenance hash
        trade_ids = sorted(str(s.get("trade_id", "")) for s in signals)
        input_data_hash = hashlib.sha256(",".join(trade_ids).encode()).hexdigest()

        stats["_provenance"] = {
            "pipeline_run_id": pipeline_run_id,
            "input_data_hash": input_data_hash,
            "trade_count": len(signals),
            "settled_count": len(settled),
            "run_date": datetime.now(timezone.utc).isoformat(),
        }

        # UPSERT into wiki_pages
        try:
            await pool.execute(
                """INSERT INTO wiki_pages (user_id, page_type, page_key, data_snapshot, trade_count, last_trade_at, version)
                   VALUES ($1::uuid, 'aggregates', 'latest', $2::jsonb, $3, NOW(), 1)
                   ON CONFLICT (user_id, page_type, page_key)
                   DO UPDATE SET data_snapshot = $2::jsonb,
                                trade_count = $3,
                                version = wiki_pages.version + 1,
                                updated_at = NOW()""",
                user_id,
                json.dumps(stats, default=str),
                len(signals),
            )
        except Exception as e:
            logger.warning("Stage 1b: wiki_pages upsert failed for user %s: %s", user_id[:8], e)
            continue

        await log_event(
            pool,
            user_id=user_id,
            action="pipeline_run",
            stage="stage_1_5",
            details={"trade_count": len(signals), "settled_count": len(settled),
                     "input_data_hash": input_data_hash[:16]},
            message=f"Cross-trade aggregates for user {user_id[:8]} ({len(signals)} trades)",
            pipeline_run_id=pipeline_run_id,
        )

        results[user_id] = {"trade_count": len(signals), "settled_count": len(settled)}
        logger.info("Stage 1b: user %s aggregates updated (%d trades, %d settled)",
                    user_id[:8], len(signals), len(settled))

    return results


# ============================================================================
# Stage 4: Parameter Sweep
# ============================================================================

async def run_parameter_sweep(pool: asyncpg.Pool, pipeline_run_id: Optional[str] = None) -> dict | None:
    """Sweep confidence/edge thresholds on settled trades, PER USER.

    For each user with 10+ settled trades, runs the full sweep and:
      - UPSERTs to wiki_pages (user_id, page_type='sweep', page_key='parameter-sweep')
      - Appends a row to wiki_sweep_history (with user_id)
      - Logs to wiki_log with user_id
    Returns a summary dict of all users processed.
    """

    # --- Sweep logic (ported from trade_intelligence.py run_stage4) ---
    def sweep(field: str, thresholds: list[float], settled: list[dict], subset: list[dict] | None = None) -> list[dict]:
        data = subset if subset is not None else settled
        result_rows = []
        for thr in thresholds:
            passed = [s for s in data if (s.get(field) or 0) >= thr]
            filtered = [s for s in data if (s.get(field) or 0) < thr]
            if not passed:
                continue
            f_won = [s for s in filtered if s.get("won")]
            f_lost = [s for s in filtered if s.get("won") is False]
            result_rows.append({
                "threshold": thr,
                "kept": len(passed),
                "filtered": len(filtered),
                "wins_missed": len(f_won),
                "losses_avoided": len(f_lost),
                "net_delta": round(
                    -sum(s.get("pnl", 0) for s in f_lost)
                    - sum(s.get("pnl", 0) for s in f_won),
                    2,
                ),
                "win_rate": round(
                    sum(1 for s in passed if s.get("won")) / len(passed), 3
                ),
            })
        return result_rows

    # 1. Discover all users with settled trades
    try:
        user_rows = await pool.fetch(
            "SELECT DISTINCT user_id FROM trade_signals WHERE user_id IS NOT NULL"
        )
    except Exception as e:
        logger.error("Stage 4: failed to query distinct users: %s", e)
        return None

    if not user_rows:
        logger.info("Stage 4: no users with trade_signals found")
        return None

    summary: dict = {"users_processed": 0, "users_skipped": 0, "users_failed": 0, "details": {}}

    for user_row in user_rows:
        uid = str(user_row["user_id"])
        try:
            # 2a. Fetch settled trades for this user
            rows = await pool.fetch(
                """SELECT trade_id, confidence, edge_at_entry, won, pnl, category
                   FROM trade_signals
                   WHERE user_id = $1::uuid AND pnl IS NOT NULL""",
                uid,
            )

            settled = []
            for r in rows:
                d = dict(r)
                d["trade_id"] = str(d["trade_id"])
                for fld in ("confidence", "edge_at_entry", "pnl"):
                    if d.get(fld) is not None:
                        d[fld] = float(d[fld])
                settled.append(d)

            # 3. Skip users with <10 settled trades
            if len(settled) < 10:
                logger.info("Stage 4: user %s has only %d settled trades, need 10+", uid[:8], len(settled))
                summary["users_skipped"] += 1
                continue

            # 2b. Run the sweep logic
            conf_s = sweep("confidence", [x / 100 for x in range(50, 92, 2)], settled)
            settled_with_edge = [s for s in settled if s.get("edge_at_entry") is not None]
            edge_s = sweep("edge_at_entry", [x / 100 for x in range(2, 22, 1)], settled, settled_with_edge)

            # Per-category stats
            by_cat: dict[str, list[dict]] = {}
            for s in settled:
                by_cat.setdefault(s.get("category") or "?", []).append(s)
            cat_stats = {
                c: {
                    "n": len(ss),
                    "wins": sum(1 for s in ss if s.get("won")),
                    "pnl": round(sum(s.get("pnl", 0) for s in ss), 2),
                }
                for c, ss in by_cat.items()
            }

            # Optimal thresholds
            half = len(settled) // 2
            opt_c = max(
                [r for r in conf_s if r["kept"] >= half],
                key=lambda r: r["net_delta"],
                default=None,
            )
            half_edge = len(settled_with_edge) // 2
            opt_e = max(
                [r for r in edge_s if r["kept"] >= half_edge],
                key=lambda r: r["net_delta"],
                default=None,
            )

            # Compute input data hash (sha256 of sorted trade_ids)
            trade_ids_sorted = sorted(s["trade_id"] for s in settled)
            input_data_hash = hashlib.sha256(",".join(trade_ids_sorted).encode()).hexdigest()

            sweep_result = {
                "trade_count": len(settled),
                "confidence_sweep": conf_s,
                "edge_sweep": edge_s,
                "category_stats": cat_stats,
                "optimal_confidence": opt_c,
                "optimal_edge": opt_e,
                "provenance": {
                    "run_date": datetime.now(timezone.utc).isoformat(),
                    "pipeline_run_id": pipeline_run_id,
                    "input_data_hash": input_data_hash,
                    "trade_count": len(settled),
                },
            }

            logger.info(
                "Stage 4: user %s — swept %d trades. Optimal conf=%s, edge=%s",
                uid[:8],
                len(settled),
                opt_c["threshold"] if opt_c else "N/A",
                opt_e["threshold"] if opt_e else "N/A",
            )

            # 2c. UPSERT into wiki_pages (per-user)
            try:
                await pool.execute(
                    """INSERT INTO wiki_pages (user_id, page_type, page_key, data_snapshot, trade_count, last_trade_at, version)
                       VALUES ($1::uuid, 'sweep', 'parameter-sweep', $2::jsonb, $3, NOW(), 1)
                       ON CONFLICT (user_id, page_type, page_key)
                       DO UPDATE SET data_snapshot = $2::jsonb,
                                    trade_count = $3,
                                    version = wiki_pages.version + 1,
                                    updated_at = NOW()""",
                    uid,
                    json.dumps(sweep_result, default=str),
                    len(settled),
                )
            except Exception as e:
                logger.warning("Stage 4: wiki_pages upsert failed for user %s: %s", uid[:8], e)

            # 2d. APPEND to wiki_sweep_history (with user_id)
            try:
                await pool.execute(
                    """INSERT INTO wiki_sweep_history (
                           user_id, pipeline_run_id, trade_count, input_data_hash,
                           optimal_confidence, optimal_confidence_net_delta,
                           optimal_edge, optimal_edge_net_delta,
                           confidence_sweep, edge_sweep, category_stats
                       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)""",
                    uid,
                    pipeline_run_id,
                    len(settled),
                    input_data_hash,
                    opt_c["threshold"] if opt_c else None,
                    opt_c["net_delta"] if opt_c else None,
                    opt_e["threshold"] if opt_e else None,
                    opt_e["net_delta"] if opt_e else None,
                    json.dumps(conf_s, default=str),
                    json.dumps(edge_s, default=str),
                    json.dumps(cat_stats, default=str),
                )
                logger.info("Stage 4: appended sweep snapshot to wiki_sweep_history for user %s (run=%s)", uid[:8], str(pipeline_run_id)[:8] if pipeline_run_id else "?")
            except Exception as e:
                logger.warning("Stage 4: wiki_sweep_history insert failed for user %s: %s", uid[:8], e)

            # 2e. Log to wiki_log with user_id
            await log_event(
                pool,
                action="pipeline_run",
                stage="stage_4",
                user_id=uid,
                details={"trade_count": len(settled), "input_data_hash": input_data_hash[:16]},
                message=f"Parameter sweep on {len(settled)} settled trades",
                pipeline_run_id=pipeline_run_id,
            )

            summary["users_processed"] += 1
            summary["details"][uid[:8]] = {"trade_count": len(settled)}

        except Exception as e:
            # 4. One user's failure doesn't kill the loop
            logger.error("Stage 4: failed for user %s: %s", uid[:8], e)
            summary["users_failed"] += 1

    # 5. Return summary
    logger.info(
        "Stage 4: complete — %d users processed, %d skipped, %d failed",
        summary["users_processed"], summary["users_skipped"], summary["users_failed"],
    )
    return summary




# ============================================================================
# Stage 5: REMOVED — compute_platform_stats deleted in evaluations simplification.
# ============================================================================


# ============================================================================
# Stage 6: Wiki Update
# ============================================================================
# Implemented in wiki_generator.py (separate file).
# Imported and called from orchestration functions below.
#
# Signature:
#   async def update_wiki_pages(pool: asyncpg.Pool, config: WikiConfig) -> int:
#       """Create/update trade pages. Returns pages_updated count."""


async def _try_wiki_update(pool: asyncpg.Pool, config: WikiConfig) -> int:
    """Attempt to import and run wiki_generator. Returns 0 if not available."""
    try:
        from backend.app.services.wiki_generator import update_wiki_pages
        return await update_wiki_pages(pool, config)
    except ImportError:
        try:
            from .wiki_generator import update_wiki_pages  # type: ignore[no-redef]
            return await update_wiki_pages(pool, config)
        except ImportError:
            logger.info("Stage 6: wiki_generator not yet available, skipping")
            return 0
    except Exception as e:
        logger.error("Stage 6: wiki_generator failed: %s", e)
        return 0


# ============================================================================
# Stage 7: REMOVED — lint_wiki and capture_weekly_snapshots deleted in
#           evaluations simplification. Weekly snapshots tables renamed via
#           migration 039.
# ============================================================================


# ============================================================================
# Orchestration
# ============================================================================

async def run_incremental(config: WikiConfig) -> dict:
    """Stages 0, 1, 2, 6. Runs every 15 min."""
    import uuid
    pipeline_run_id = str(uuid.uuid4())
    summary: dict[str, Any] = {
        "pipeline_run_id": pipeline_run_id,
        "trades_found": 0,
        "signals_created": 0,
        "autopsies_created": 0,
        "pages_updated": 0,
    }
    pool = await create_pool(config)
    try:
        await log_event(
            pool, action="pipeline_run", stage="start",
            message=f"Incremental run started (run_id={pipeline_run_id[:8]})",
            details={"run_type": "incremental"},
            pipeline_run_id=pipeline_run_id,
        )

        # Stage 0: Pull new trades
        try:
            trades = await pull_new_trades(pool)
            summary["trades_found"] = len(trades)
        except Exception as e:
            logger.error("Stage 0 failed: %s", e)
            trades = []

        if not trades:
            logger.info("No new trades — incremental run complete")
            await log_event(
                pool, action="pipeline_run", stage="complete",
                details=summary, message="No new trades",
                pipeline_run_id=pipeline_run_id,
            )
            return summary

        # Stage 1: Extract signals
        try:
            summary["signals_created"] = await extract_and_store_signals(pool, trades, pipeline_run_id=pipeline_run_id)
            await log_event(
                pool, action="pipeline_run", stage="stage_1",
                details={"signals_created": summary["signals_created"]},
                message=f"Extracted {summary['signals_created']} signals from {len(trades)} trades",
                pipeline_run_id=pipeline_run_id,
            )
        except Exception as e:
            logger.error("Stage 1 failed: %s", e)
            await log_event(
                pool, action="pipeline_error", stage="stage_1",
                details={"error": str(e)},
                message=f"Signal extraction failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )

        # Stage 2: AI autopsies — DISABLED (output not used downstream; saves ~$10/day)
        # try:
        #     summary["autopsies_created"] = await run_autopsies(pool, config, pipeline_run_id=pipeline_run_id)
        #     await log_event(
        #         pool, action="pipeline_run", stage="stage_2",
        #         details={"autopsies_created": summary["autopsies_created"]},
        #         message=f"Created {summary['autopsies_created']} autopsies",
        #         pipeline_run_id=pipeline_run_id,
        #     )
        # except Exception as e:
        #     logger.error("Stage 2 failed: %s", e)
        #     await log_event(
        #         pool, action="pipeline_error", stage="stage_2",
        #         details={"error": str(e)},
        #         message=f"Autopsy stage crashed: {e}",
        #         pipeline_run_id=pipeline_run_id,
        #     )

        # Stage 6: Wiki update (if available)
        try:
            summary["pages_updated"] = await _try_wiki_update(pool, config)
            if summary["pages_updated"] > 0:
                await log_event(
                    pool, action="pipeline_run", stage="stage_6",
                    details={"pages_updated": summary["pages_updated"]},
                    message=f"Updated {summary['pages_updated']} wiki pages",
                    pipeline_run_id=pipeline_run_id,
                )
        except Exception as e:
            logger.error("Stage 6 failed: %s", e)
            await log_event(
                pool, action="pipeline_error", stage="stage_6",
                details={"error": str(e)},
                message=f"Wiki page update failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )

        await log_event(
            pool, action="pipeline_run", stage="complete",
            details=summary, message="Incremental run complete",
            pipeline_run_id=pipeline_run_id,
        )
    except Exception as e:
        logger.exception("Incremental pipeline failed: %s", e)
        try:
            await log_event(
                pool, action="pipeline_error", details={"error": str(e)},
                message=f"Incremental pipeline failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )
        except Exception:
            pass
    finally:
        await pool.close()
        logger.info("Database pool closed")

    return summary


async def run_daily(config: WikiConfig, force_refresh_autopsies: bool = False) -> dict:
    """Stages 1b, 4, 6. Runs once daily at 2 AM UTC.

    When force_refresh_autopsies=True, also reruns Stage 2 to regenerate ALL
    autopsies in place (used after data corrections like price backfills).
    """
    # Simplified: only trade pages generated. Bot/category/agent/dashboard pages removed in evaluations simplification.
    import uuid
    pipeline_run_id = str(uuid.uuid4())
    summary: dict[str, Any] = {
        "pipeline_run_id": pipeline_run_id,
        "autopsies_refreshed": 0,
        "aggregates_computed": 0,
        "sweep_computed": False,
        "pages_updated": 0,
    }
    pool = await create_pool(config)
    try:
        await log_event(
            pool, action="pipeline_run", stage="start",
            message=f"Daily run started (run_id={pipeline_run_id[:8]})",
            details={"run_type": "daily", "force_refresh_autopsies": force_refresh_autopsies},
            pipeline_run_id=pipeline_run_id,
        )

        # Stage 2 (optional): Force-refresh all autopsies — DISABLED
        # if force_refresh_autopsies:
        #     try:
        #         summary["autopsies_refreshed"] = await run_autopsies(
        #             pool, config, pipeline_run_id=pipeline_run_id, force_refresh=True,
        #         )
        #         await log_event(
        #             pool, action="pipeline_run", stage="stage_2",
        #             details={"autopsies_refreshed": summary["autopsies_refreshed"]},
        #             message=f"Force-refreshed {summary['autopsies_refreshed']} autopsies",
        #             pipeline_run_id=pipeline_run_id,
        #         )
        #     except Exception as e:
        #         logger.error("Stage 2 (force refresh) failed: %s", e)
        #         await log_event(
        #             pool, action="pipeline_error", stage="stage_2",
        #             details={"error": str(e)},
        #             message=f"Autopsy force-refresh failed: {e}",
        #             pipeline_run_id=pipeline_run_id,
        #         )

        # Stage 1b: Cross-trade aggregate signals (per user)
        try:
            agg_results = await compute_aggregate_signals(pool, pipeline_run_id=pipeline_run_id)
            summary["aggregates_computed"] = len(agg_results)
        except Exception as e:
            logger.error("Stage 1b failed: %s", e)
            await log_event(
                pool, action="pipeline_error", stage="stage_1b",
                details={"error": str(e)},
                message=f"Aggregate computation failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )

        # Stage 4: Parameter sweep (per-user)
        try:
            sweep = await run_parameter_sweep(pool, pipeline_run_id=pipeline_run_id)
            summary["sweep_computed"] = sweep is not None and sweep.get("users_processed", 0) > 0
        except Exception as e:
            logger.error("Stage 4 failed: %s", e)
            await log_event(
                pool, action="pipeline_error", stage="stage_4",
                details={"error": str(e)},
                message=f"Parameter sweep failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )

        # Stage 6: Wiki update (trade pages only)
        try:
            summary["pages_updated"] = await _try_wiki_update(pool, config)
        except Exception as e:
            logger.error("Stage 6 failed: %s", e)
            await log_event(
                pool, action="pipeline_error", stage="stage_6",
                details={"error": str(e)},
                message=f"Wiki page update failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )

        await log_event(
            pool, action="pipeline_run", stage="complete",
            details=summary, message="Daily run complete",
            pipeline_run_id=pipeline_run_id,
        )
    except Exception as e:
        logger.exception("Daily pipeline failed: %s", e)
        try:
            await log_event(
                pool, action="pipeline_error", details={"error": str(e)},
                message=f"Daily pipeline failed: {e}",
                pipeline_run_id=pipeline_run_id,
            )
        except Exception:
            pass
    finally:
        await pool.close()

    return summary


async def run_weekly(config: WikiConfig) -> dict:
    """Stage 3 ONLY. Runs once weekly on Sunday 3 AM UTC.

    Simplified: only weekly analysis. Lint + snapshots removed in evaluations simplification.
    """
    import uuid
    pipeline_run_id = str(uuid.uuid4())
    results: dict[str, Any] = {"pipeline_run_id": pipeline_run_id}
    pool = await create_pool(config)
    try:
        await log_event(pool, action="pipeline_run", stage="start", message=f"Weekly run started (run_id={pipeline_run_id[:8]})", pipeline_run_id=pipeline_run_id)

        # Stage 3: Weekly per-user LLM analysis
        try:
            analysis_result = await run_weekly_analysis(pool, config, pipeline_run_id=pipeline_run_id)
            results["analysis"] = analysis_result
        except Exception as e:
            logger.error("Stage 3 (weekly analysis) failed: %s", e)
            results["analysis_error"] = str(e)

        await log_event(
            pool, action="pipeline_run", stage="complete",
            details=results, message="Weekly run complete",
        )
    except Exception as e:
        logger.exception("Weekly pipeline failed: %s", e)
    finally:
        await pool.close()

    return results


async def run_backfill(config: WikiConfig) -> dict:
    """One-time: process ALL historical trades through Stages 0-6.

    Same as run_incremental but:
    - Does NOT check daily budget (processes everything).
    - Logs with action='backfill' instead of 'pipeline_run'.
    - After Stages 0-2, also runs Stages 1b, 3, 4 (daily stages).
    - Then runs Stage 6 (wiki update).
    """
    # Simplified: only trade pages generated. Bot/category/agent/dashboard pages removed in evaluations simplification.
    import uuid
    pipeline_run_id = str(uuid.uuid4())
    summary: dict[str, Any] = {
        "pipeline_run_id": pipeline_run_id,
        "trades_found": 0,
        "signals_created": 0,
        "autopsies_created": 0,
        "aggregates_computed": 0,
        "analysis_users_processed": 0,
        "sweep_computed": False,
        "pages_updated": 0,
    }

    # Override budget for backfill — set very high so nothing is skipped
    original_budget = config.daily_ai_budget
    config.daily_ai_budget = 999.0

    pool = await create_pool(config)
    try:
        await log_event(
            pool, action="backfill", stage="start",
            message=f"Backfill started (run_id={pipeline_run_id[:8]})",
            pipeline_run_id=pipeline_run_id,
        )

        # Stage 0: Pull all unprocessed trades
        try:
            trades = await pull_new_trades(pool)
            summary["trades_found"] = len(trades)
            logger.info("Backfill: %d trades to process", len(trades))
        except Exception as e:
            logger.error("Backfill Stage 0 failed: %s", e)
            await log_event(pool, action="pipeline_error", stage="stage_0",
                            details={"error": str(e)}, message=f"Backfill data pull failed: {e}",
                            pipeline_run_id=pipeline_run_id)
            trades = []

        # Stage 1: Extract signals
        if trades:
            try:
                summary["signals_created"] = await extract_and_store_signals(pool, trades, pipeline_run_id=pipeline_run_id)
            except Exception as e:
                logger.error("Backfill Stage 1 failed: %s", e)
                await log_event(pool, action="pipeline_error", stage="stage_1",
                                details={"error": str(e)}, message=f"Backfill signal extraction failed: {e}",
                                pipeline_run_id=pipeline_run_id)

        # Stage 2: AI autopsies — DISABLED
        # if trades:
        #     try:
        #         summary["autopsies_created"] = await run_autopsies(pool, config, pipeline_run_id=pipeline_run_id)
        #     except Exception as e:
        #         logger.error("Backfill Stage 2 failed: %s", e)
        #         await log_event(pool, action="pipeline_error", stage="stage_2",
        #                         details={"error": str(e)}, message=f"Backfill autopsy stage crashed: {e}",
        #                         pipeline_run_id=pipeline_run_id)

        # Stage 1b: Cross-trade aggregate signals (per user)
        try:
            agg_results = await compute_aggregate_signals(pool, pipeline_run_id=pipeline_run_id)
            summary["aggregates_computed"] = len(agg_results)
        except Exception as e:
            logger.error("Backfill Stage 1b failed: %s", e)
            await log_event(pool, action="pipeline_error", stage="stage_1b",
                            details={"error": str(e)}, message=f"Backfill aggregate computation failed: {e}",
                            pipeline_run_id=pipeline_run_id)

        # Stage 3: Weekly analysis
        try:
            analysis = await run_weekly_analysis(pool, config, pipeline_run_id=pipeline_run_id)
            summary["analysis_users_processed"] = analysis.get("users_processed", 0)
        except Exception as e:
            logger.error("Backfill Stage 3 failed: %s", e)
            await log_event(pool, action="pipeline_error", stage="stage_3",
                            details={"error": str(e)}, message=f"Backfill weekly analysis failed: {e}",
                            pipeline_run_id=pipeline_run_id)

        # Stage 4: Parameter sweep (per-user)
        try:
            sweep = await run_parameter_sweep(pool, pipeline_run_id=pipeline_run_id)
            summary["sweep_computed"] = sweep is not None and sweep.get("users_processed", 0) > 0
        except Exception as e:
            logger.error("Backfill Stage 4 failed: %s", e)
            await log_event(pool, action="pipeline_error", stage="stage_4",
                            details={"error": str(e)}, message=f"Backfill parameter sweep failed: {e}",
                            pipeline_run_id=pipeline_run_id)

        # Stage 6: Wiki update (trade pages only)
        try:
            summary["pages_updated"] = await _try_wiki_update(pool, config)
        except Exception as e:
            logger.error("Backfill Stage 6 failed: %s", e)
            await log_event(pool, action="pipeline_error", stage="stage_6",
                            details={"error": str(e)}, message=f"Backfill wiki update failed: {e}",
                            pipeline_run_id=pipeline_run_id)

        await log_event(
            pool, action="backfill", stage="complete",
            details=summary, message="Backfill complete",
        )
    except Exception as e:
        logger.exception("Backfill pipeline failed: %s", e)
    finally:
        config.daily_ai_budget = original_budget
        await pool.close()

    return summary


# ============================================================================
# Entry Point
# ============================================================================

async def main() -> None:
    """Parse CLI args, run the appropriate pipeline mode."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Trade Intelligence Wiki Pipeline")
    parser.add_argument(
        "mode",
        choices=["incremental", "daily", "weekly", "backfill"],
        help="Pipeline mode to run",
    )
    args = parser.parse_args()

    config = WikiConfig()
    config.validate()

    # Initialize Sentry if configured
    if config.sentry_dsn:
        try:
            import sentry_sdk
            sentry_sdk.init(dsn=config.sentry_dsn)
            logger.info("Sentry initialized")
        except ImportError:
            logger.warning("sentry-sdk not installed, skipping Sentry init")

    if args.mode == "incremental":
        result = await run_incremental(config)
    elif args.mode == "daily":
        result = await run_daily(config)
    elif args.mode == "weekly":
        result = await run_weekly(config)
    elif args.mode == "backfill":
        result = await run_backfill(config)
    else:
        logger.error("Unknown mode: %s", args.mode)
        return

    logger.info("Pipeline %s complete: %s", args.mode, result)


if __name__ == "__main__":
    asyncio.run(main())
