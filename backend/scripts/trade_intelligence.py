#!/usr/bin/env python3
"""Trade Intelligence System — local CSV pipeline.

Reads trades from a CSV export, runs 5-stage analysis pipeline,
saves results as local JSON files.

AI backend: OpenAI GPT-4o API (fast, parallel) or Claude CLI (slow, sequential).

Usage:
    # With OpenAI API (fast — 350 trades in ~15 min):
    OPENAI_API_KEY=sk-... python trade_intelligence.py --stage 1,2,3,5 --csv trades.csv

    # With Claude CLI (slow — ~48s/trade):
    python trade_intelligence.py --stage 1,2,3,5 --csv trades.csv --backend claude-cli

    # Save to Desktop:
    python trade_intelligence.py --stage 1,2,3,5 --csv trades.csv --output-dir ~/Desktop

    # Filter by bot type:
    python trade_intelligence.py --stage 1,2 --csv trades.csv --bot-type polymarket-v2 --limit 50
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

# ─── Paths ───────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
DEFAULT_RESULTS_DIR = SCRIPT_DIR / "results"
RESULTS_DIR = DEFAULT_RESULTS_DIR  # overridden by --output-dir


# ─── CSV Loading ─────────────────────────────────────────────────────────────

def load_trades(csv_path: str, bot_type: Optional[str] = None) -> List[dict]:
    """Load trades from CSV, optionally filter by bot_type_id."""
    with open(csv_path, newline="", encoding="utf-8") as f:
        trades = list(csv.DictReader(f))

    for t in trades:
        for k, v in t.items():
            if v in ("null", "NULL", ""):
                t[k] = None

    for t in trades:
        for field in ("price", "total_cost", "confidence", "pnl", "cf_pnl"):
            if t.get(field) is not None:
                try:
                    t[field] = float(t[field])
                except (ValueError, TypeError):
                    t[field] = None
        for field in ("count", "cf_count"):
            if t.get(field) is not None:
                try:
                    t[field] = int(t[field])
                except (ValueError, TypeError):
                    t[field] = None
        for field in ("settled", "cf_settled"):
            t[field] = t.get(field) in ("true", "True", True)

    if bot_type:
        trades = [t for t in trades if t.get("bot_type_id") == bot_type]
    return trades


# ─── AI Backend: OpenAI API ──────────────────────────────────────────────────

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-4o"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


async def call_openai(system: str, user: str, timeout: int = 60) -> Optional[dict]:
    """Call OpenAI API, return parsed JSON dict."""
    try:
        import httpx
    except ImportError:
        print("  ERROR: httpx not installed. Run: pip install httpx")
        return None

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 800,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(3):
            try:
                resp = await client.post(OPENAI_URL, json=payload, headers=headers)
                if resp.status_code == 429:
                    wait = min(2 ** attempt * 2, 30)
                    await asyncio.sleep(wait)
                    continue
                if resp.status_code >= 500:
                    await asyncio.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return parse_json_response(content)
            except httpx.TimeoutException:
                if attempt == 2:
                    return None
                await asyncio.sleep(2)
            except Exception as e:
                if attempt == 2:
                    print(f"  ERROR: OpenAI API: {e}")
                    return None
                await asyncio.sleep(2)
    return None


# ─── AI Backend: Claude CLI ──────────────────────────────────────────────────

def find_claude() -> Optional[str]:
    path = shutil.which("claude")
    if path:
        return path
    for candidate in ["/opt/homebrew/bin/claude", os.path.expanduser("~/.local/bin/claude")]:
        if os.path.isfile(candidate):
            return candidate
    return None


CLAUDE_PATH = find_claude()


def _get_env_with_path():
    env = os.environ.copy()
    extra = ["/opt/homebrew/bin", "/usr/local/bin", os.path.expanduser("~/.local/bin")]
    current = env.get("PATH", "")
    for p in extra:
        if p not in current:
            current = p + ":" + current
    env["PATH"] = current
    return env


def call_claude_cli(prompt: str, timeout: int = 180) -> Optional[dict]:
    """Call claude CLI with a prompt, parse JSON response."""
    if not CLAUDE_PATH:
        return None
    try:
        result = subprocess.run(
            [CLAUDE_PATH, "-p", prompt, "--output-format", "text"],
            capture_output=True, text=True, timeout=timeout,
            env=_get_env_with_path(),
        )
    except (subprocess.TimeoutExpired, Exception):
        return None
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return parse_json_response(result.stdout.strip())


# ─── JSON Parsing ────────────────────────────────────────────────────────────

def parse_json_response(text: str) -> Optional[dict]:
    """Extract JSON dict from text, handling markdown fences."""
    if not text:
        return None

    # Strip ```json ... ```
    if "```json" in text:
        try:
            start = text.index("```json") + 7
            end = text.rindex("```")
            return json.loads(text[start:end].strip())
        except (ValueError, json.JSONDecodeError):
            pass
    elif "```" in text:
        try:
            start = text.index("```") + 3
            end = text.rindex("```")
            return json.loads(text[start:end].strip())
        except (ValueError, json.JSONDecodeError):
            pass

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]+\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


# ─── Section Parsing ─────────────────────────────────────────────────────────

def parse_agent_sections(raw: str) -> Dict[str, str]:
    """Split raw_reasoning into agent sections."""
    if not raw:
        return {}
    parts = re.split(r"\n\n---\n\n|\n---\n", raw)
    sections = {}
    for part in parts:
        part = part.strip()
        if not part:
            continue
        header_match = re.match(
            r"(?:\[[\w_]+\]\s*)*\[(\w+(?:_\w+)*)\]\s*\(([^)]+)\)\s*(.*)",
            part, re.DOTALL,
        )
        if header_match:
            sections[header_match.group(1)] = part
        else:
            tag_match = re.match(r"\[(\w+(?:_\w+)*)\]\s*(.*)", part, re.DOTALL)
            if tag_match:
                sections[tag_match.group(1)] = part
    return sections


def extract_header_value(section_text: str, key: str) -> Optional[str]:
    first_line = section_text.split("\n")[0]
    match = re.search(rf"{key}=([\w.]+)", first_line, re.IGNORECASE)
    return match.group(1) if match else None


# ─── Stage 1: Deterministic Signal Extraction ────────────────────────────────

# Module-level constants ported verbatim from quant_report.py:83-109.
ANCHOR_THRESHOLD = 0.05  # forecaster within ±0.05 of price → "anchored"
SF_BOT_TOKENS = ("superforecaster",)  # bot_type_id substrings that mark SF
PLACED_STATUSES = ("executed", "paper", "open", "pending", "pending_fill")

# Sections used as skip-reason markers (verified empirically against the CSV)
SKIP_REASON_KEYS = (
    "edge_below_threshold",
    "ensemble_skip",
    "superforecaster_skip",
    "position_size_zero",
    "risk_manager_skip",
)

# Agents we recognize in the debate JSON. V2 has up to 6 (research +
# forecaster + bull + bear + risk_manager + trader); SF has 2 (research +
# superforecaster). Tail-buyer emits no debate JSON.
_KNOWN_AGENT_ROLES = (
    "research",
    "forecaster",
    "superforecaster",
    "bull_researcher",
    "bear_researcher",
    "risk_manager",
    "trader",
)


def count_agents_agreeing(sections: dict, trade_side: Optional[str]) -> Optional[int]:
    if not trade_side:
        return None
    side_lower = trade_side.lower()
    agreeing = checked = 0
    for role in ("forecaster", "bull_researcher", "bear_researcher", "risk_manager", "trader", "superforecaster"):
        sec = sections.get(role)
        if not sec:
            continue
        checked += 1
        side_val = extract_header_value(sec, "side")
        if side_val and side_val.lower() == side_lower:
            agreeing += 1
        elif not side_val and re.search(rf"\b(BUY|recommend|side)\s*[=:]\s*{trade_side}", sec, re.IGNORECASE):
            agreeing += 1
    return agreeing if checked > 0 else None


def parse_datetime(dt_val: object) -> Optional[datetime]:
    """Parse a datetime from string or pass through an existing datetime object.

    asyncpg returns TIMESTAMPTZ as datetime objects, not strings.
    The original version only handled strings, causing all weekly/rolling
    aggregates to silently return empty data.
    """
    if dt_val is None:
        return None
    # Already a datetime? Return directly.
    if isinstance(dt_val, datetime):
        return dt_val
    # String path
    if not isinstance(dt_val, str):
        return None
    try:
        s = dt_val.replace("+00", "+00:00").replace("Z", "+00:00")
        if "+" not in s and "-" not in s[10:]:
            s += "+00:00"
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def is_superforecaster(bot_id: Optional[str]) -> bool:
    """Ported verbatim from quant_report.py:435-438."""
    if not bot_id:
        return False
    return any(tok in bot_id.lower() for tok in SF_BOT_TOKENS)


def _parse_debate_json(raw: str) -> Optional[dict]:
    """Extract and parse the ---DEBATE_RESULTS_JSON--- tail from raw_reasoning.

    V2 and SF bots append this block at the end of raw_reasoning with the full
    agent output as a single JSON object. Wave 2 B2 verified 30/30 parse rate.
    Ported verbatim from quant_report.py:328-351.
    """
    if not raw:
        return None
    idx = raw.find("---DEBATE_RESULTS_JSON---")
    if idx < 0:
        return None
    body = raw[idx + 25:].strip()
    while body.endswith("---"):
        body = body[:-3].strip()
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        lo, hi = body.find("{"), body.rfind("}")
        if lo >= 0 and hi > lo:
            try:
                return json.loads(body[lo:hi + 1])
            except json.JSONDecodeError:
                return None
        return None


def _extract_per_agent(debate: Optional[dict]) -> List[dict]:
    """Normalize the debate JSON into a per-agent list of records.

    Each record has: {role, model, probability, reasoning_words}. The
    `probability` field is the agent's P(YES) estimate when one is
    recoverable, otherwise None. Returns [] on a missing/malformed debate.

    Probability conventions:
    - forecaster / superforecaster: `probability` key (canonical P(YES))
    - bull_researcher: `probability` or `probability_floor` (bull's P(YES))
    - bear_researcher: `probability` or `probability_ceiling` (bear's P(YES))
    - risk_manager: `true_probability` (the RM's re-estimate)
    - trader / research: no probability — trader is a decision agent and
      research is a context dump.

    Ported verbatim from quant_report.py:368-432.
    """
    if not isinstance(debate, dict):
        return []
    out: List[dict] = []
    for role in _KNOWN_AGENT_ROLES:
        entry = debate.get(role)
        if not isinstance(entry, dict):
            continue
        model = entry.get("_model")
        prob: Optional[float] = None
        if role in ("forecaster", "superforecaster"):
            prob = entry.get("probability")
        elif role == "bull_researcher":
            prob = entry.get("probability")
            if prob is None:
                prob = entry.get("probability_floor")
        elif role == "bear_researcher":
            prob = entry.get("probability")
            if prob is None:
                prob = entry.get("probability_ceiling")
        elif role == "risk_manager":
            prob = entry.get("true_probability")
        if prob is not None:
            try:
                prob = float(prob)
                if not (0.0 <= prob <= 1.0):
                    prob = None
            except (TypeError, ValueError):
                prob = None
        reasoning_raw = entry.get("reasoning") or entry.get("content") or ""
        words = len(str(reasoning_raw).split()) if reasoning_raw else 0
        out.append({
            "role": role,
            "model": model,
            "probability": prob,
            "reasoning_words": words,
        })
    # SF stores the research model inside `superforecaster._research_model`
    # instead of emitting a separate `research` section. Synthesize one so
    # the aggregator can still count it as a distinct agent invocation.
    if not any(a["role"] == "research" for a in out):
        sf = debate.get("superforecaster") or {}
        rm_model = sf.get("_research_model") if isinstance(sf, dict) else None
        if rm_model:
            out.insert(0, {
                "role": "research",
                "model": rm_model,
                "probability": None,
                "reasoning_words": 0,
            })
    return out


def extract_signals(trade: dict, anchor_threshold: float = ANCHOR_THRESHOLD) -> dict:
    """Deterministic signal extraction with bug fixes vs the prior implementation.

    Verbatim port of quant_report.py:441-689. Strict superset — keeps all 24
    existing fields and adds 28 new ones. Bug fixes:
      1. SF bots no longer report fake bear/bull word counts (those agents
         don't exist in SF) — they now return None.
      2. anchor_threshold loosened from 0.03 to 0.05 (configurable).
      3. New `anchor_delta` field surfaces the raw |f_prob - price| distance.
    """
    raw = trade.get("raw_reasoning") or ""
    sections = parse_agent_sections(raw)

    # Forecaster probability
    f_sec = sections.get("forecaster") or sections.get("superforecaster") or ""
    f_prob_str = extract_header_value(f_sec, "probability")
    f_prob: Optional[float] = None
    if f_prob_str:
        try:
            f_prob = float(f_prob_str)
        except ValueError:
            f_prob = None
    if f_prob is None and f_sec:
        m = re.search(r"P\(YES\)\s*=?\s*([\d.]+)%?", f_sec)
        if m:
            try:
                v = float(m.group(1))
                f_prob = v / 100 if v > 1 else v
            except ValueError:
                f_prob = None

    # Risk manager
    rm = sections.get("risk_manager") or ""
    st_str = extract_header_value(rm, "should_trade")
    if st_str is not None:
        rm_endorsed: Optional[bool] = st_str.lower() == "true"
    elif rm:
        rm_endorsed = not bool(re.search(
            r"(REJECT|VETO|DO NOT|SKIP|TOO RISKY|should_trade\s*=\s*false|should_trade\s*=\s*False)",
            rm, re.IGNORECASE,
        ))
    else:
        rm_endorsed = None
    if rm_endorsed is None and "superforecaster" in sections:
        sf_st = extract_header_value(sections["superforecaster"], "should_trade")
        if sf_st is not None:
            rm_endorsed = sf_st.lower() == "true"

    bot_id = trade.get("bot_type_id")
    price = trade.get("price")
    conf = trade.get("confidence")
    status = trade.get("status") or ""
    pnl = trade.get("pnl")
    cf_pnl = trade.get("cf_pnl")
    cf_settled = trade.get("cf_settled")

    # Bucket
    if status in ("skipped", "rejected", "error", "paper"):
        if cf_pnl is not None and cf_pnl > 0:
            bucket = f"{status}_would_have_won"
        elif cf_pnl is not None and cf_pnl < 0:
            bucket = f"{status}_would_have_lost"
        else:
            bucket = status
    elif pnl is not None and pnl > 0:
        bucket = "won"
    elif pnl is not None and pnl < 0:
        bucket = "lost"
    elif pnl is not None and pnl == 0:
        bucket = "breakeven"
    else:
        bucket = status or "unknown"

    # Outcome — won/eff_pnl. Track real vs counterfactual separately to avoid
    # the conflation Omega flagged.
    real_won: Optional[bool] = None
    cf_won: Optional[bool] = None
    if status in PLACED_STATUSES and pnl is not None and pnl != 0:
        real_won = pnl > 0
    if status in ("skipped", "rejected", "error", "paper") and cf_pnl is not None and cf_pnl != 0:
        cf_won = cf_pnl > 0

    # Combined "won" for backward compatibility — uses real PnL when available,
    # cf PnL otherwise. Still emitted but consumers should prefer real_won/cf_won.
    if real_won is not None:
        won = real_won
        eff_pnl = pnl
    elif cf_won is not None:
        won = cf_won
        eff_pnl = cf_pnl
    else:
        won = None
        eff_pnl = pnl if pnl is not None else cf_pnl

    ts = parse_datetime(trade.get("timestamp"))
    close = parse_datetime(trade.get("market_close_time"))
    htc = round((close - ts).total_seconds() / 3600, 2) if ts and close else None

    # ── BUG FIX 1: bull/bear word counts only valid for V2-style multi-agent bots ──
    if is_superforecaster(bot_id):
        bull_w: Optional[int] = None
        bear_w: Optional[int] = None
    else:
        bull_w = len(sections.get("bull_researcher", "").split())
        bear_w = len(sections.get("bear_researcher", "").split())

    # ── BUG FIX 2: anchor_delta + loosened threshold ──
    if f_prob is not None and price is not None:
        anchor_delta: Optional[float] = round(abs(f_prob - price), 4)
        anchored_to_price: Optional[bool] = anchor_delta < anchor_threshold
    else:
        anchor_delta = None
        anchored_to_price = None

    # ── NEW: skip_reason from architectural section markers ──
    # Day 7 bug fix: `parse_agent_sections` has a regex that eats a leading
    # `[skip_marker]` prefix when it's followed by another `[tag] (model)` on
    # the same line (e.g. `[edge_below_threshold] [research] (perplexity/sonar)`),
    # because the last `[tag]` before `(model)` wins as the section key. That
    # was dropping ~90% of skip markers (494/546 trades in 2026-04-11 run were
    # resolving to `unknown` even though the marker was physically present in
    # the raw text). Fix: check the leading `[...]` in the raw string first,
    # then fall back to section lookup for rows without a leading marker.
    skip_reason: Optional[str] = None
    leading_marker = re.match(r"\s*\[([\w_]+)\]", raw)
    if leading_marker and leading_marker.group(1) in SKIP_REASON_KEYS:
        skip_reason = leading_marker.group(1)
    if skip_reason is None:
        for k in SKIP_REASON_KEYS:
            if k in sections:
                skip_reason = k
                break

    # ── NEW: signed forecaster edge (the *real* edge, vs market price) ──
    if f_prob is not None and price is not None:
        forecaster_edge_signed: Optional[float] = round(f_prob - price, 4)
    else:
        forecaster_edge_signed = None

    edge_at_entry: Optional[float]
    if conf is not None and price is not None and price != 0:
        edge_at_entry = round(abs(conf - price), 4)
    else:
        edge_at_entry = None

    # ── NEW: debate JSON tail extraction (Wave 2 B2) ──
    debate = _parse_debate_json(raw) or {}
    rm_j = debate.get("risk_manager") or {}
    ev_estimate = rm_j.get("ev_estimate")
    risk_score = rm_j.get("risk_score")
    true_probability = rm_j.get("true_probability")
    recommended_size_pct = rm_j.get("recommended_size_pct")
    edge_durability_hours = rm_j.get("edge_durability_hours")
    rm_recommended_side = rm_j.get("recommended_side")

    bull_j = debate.get("bull_researcher") or {}
    bear_j = debate.get("bear_researcher") or {}
    probability_floor = bull_j.get("probability_floor")
    probability_ceiling = bear_j.get("probability_ceiling")
    if probability_floor is not None and probability_ceiling is not None:
        try:
            debate_bracket_width: Optional[float] = round(
                float(probability_ceiling) - float(probability_floor), 4
            )
        except (TypeError, ValueError):
            debate_bracket_width = None
    else:
        debate_bracket_width = None

    # SF-specific research_quality (10/15 samples populated; model-gated)
    sf_j = debate.get("superforecaster") or {}
    rq_j = sf_j.get("research_quality") or {}
    research_quality_score = rq_j.get("score")
    research_model = sf_j.get("_research_model")

    # Day 6: per-agent normalization for §B.*.7 per-agent performance tables.
    # Each signal carries its own agent roster (2 for SF, up to 6 for V2, [] for tail-buyer).
    per_agent = _extract_per_agent(debate)

    return {
        "trade_id": str(trade.get("id") or ""),
        "bot_type_id": bot_id,
        "market_title": trade.get("market_title"),
        "status": status,
        "bucket": bucket,
        "side": trade.get("side"),
        "category": trade.get("category"),
        "exchange": trade.get("exchange"),
        "environment": trade.get("environment"),
        "model": trade.get("model"),

        # Reasoning structure signals
        "base_rate_mentioned": bool(re.search(
            r"base.?rate|historical(ly)?|(\d+)% of (the )?time|prior probability",
            raw, re.IGNORECASE,
        )),
        "risk_manager_endorsed": rm_endorsed,
        "risk_manager_overridden": (
            rm_endorsed is not None and not rm_endorsed and status in PLACED_STATUSES
        ),
        "forecaster_probability": f_prob,
        "forecaster_anchored_to_price": anchored_to_price,
        "anchor_delta": anchor_delta,
        "forecaster_edge_signed": forecaster_edge_signed,
        "bull_word_count": bull_w,
        "bear_word_count": bear_w,
        "total_reasoning_words": len(raw.split()),
        "model_agreement": count_agents_agreeing(sections, trade.get("side")),
        "edge_at_entry": edge_at_entry,
        "sources_cited": len(re.findall(
            r"https?://|according to|reported by|data from|survey|poll|\[\d+\]",
            raw, re.IGNORECASE,
        )),
        "hedge_score": len(re.findall(
            r"\b(might|could|possibly|perhaps|uncertain|unclear|unlikely|risky"
            r"|not sure|hard to say|small edge|marginal|barely)\b",
            raw, re.IGNORECASE,
        )),
        "hours_to_close": htc,
        "skip_reason": skip_reason,

        # Trade primitives
        "confidence": conf,
        "price": price,
        "count": trade.get("count"),
        "total_cost": trade.get("total_cost"),
        "won": won,            # combined; consumers should prefer real_won/cf_won
        "real_won": real_won,  # only set when status in PLACED and pnl != 0
        "cf_won": cf_won,      # only set when status in skipped/rejected and cf_pnl != 0
        "pnl": eff_pnl,
        "real_pnl": pnl,
        "cf_pnl": cf_pnl,
        "cf_settled": bool(cf_settled) if cf_settled is not None else None,
        "settled": bool(trade.get("settled")) if trade.get("settled") is not None else None,
        "timestamp": str(trade.get("timestamp") or ""),

        # ── NEW (Wave 2 B2): debate JSON-tail fields ──
        "ev_estimate": ev_estimate,
        "risk_score": risk_score,
        "true_probability": true_probability,
        "recommended_size_pct": recommended_size_pct,
        "edge_durability_hours": edge_durability_hours,
        "rm_recommended_side": rm_recommended_side,
        "probability_floor": probability_floor,
        "probability_ceiling": probability_ceiling,
        "debate_bracket_width": debate_bracket_width,
        "research_quality_score": research_quality_score,
        "research_model": research_model,
        "per_agent": per_agent,

        # ── NEW (Wave 2 B1): deployment_snapshots LATERAL ──
        "cfg_at_trade": trade.get("cfg_at_trade"),
        "rules_at_trade": trade.get("rules_at_trade"),
        "mode_at_trade": trade.get("mode_at_trade"),
        "capital_alloc_at_trade": trade.get("capital_alloc_at_trade"),
        "cfg_deployed_at": trade.get("cfg_deployed_at"),
    }


def run_stage1(trades: List[dict], limit: int) -> List[dict]:
    print("\nSTAGE 1 — Signal Extraction")
    print(f"  Processing {min(len(trades), limit)} trades...")
    signals, fails = [], 0
    for t in trades[:limit]:
        if len(t.get("raw_reasoning") or "") < 10:
            fails += 1
            continue
        try:
            signals.append(extract_signals(t))
        except Exception as e:
            print(f"  WARN: {t.get('id', '?')[:8]}: {e}")
            fails += 1
    print(f"  Extracted {len(signals)}/{min(len(trades), limit)} signals ({fails} skipped)")
    return signals


# ─── Stage 2: AI Autopsy ─────────────────────────────────────────────────────

AUTOPSY_SYSTEM = """You are a prediction market trade analyst. You receive pre-computed structural signals (ground truth) and the debate transcript. Your job is CLASSIFICATION and NARRATIVE only. Do not recompute signals.
Output valid JSON matching the schema below. No markdown fences, just raw JSON.

FAILURE MODE DEFINITIONS:
- RISK_MANAGER_OVERRULED: Risk Manager recommended skip/reject but Trader proceeded
- BASE_RATE_NEGLECT: No historical base rate anchoring; probability estimated without priors
- ANCHORING_BIAS: Forecaster estimate suspiciously close to market price (< 3% difference)
- RECENCY_BIAS: Reasoning dominated by events from last 24-48h, ignoring longer-term trends
- INSUFFICIENT_EDGE: Edge at entry < 5%, trade should not have been taken
- RESOLUTION_MISREAD: Misunderstood the market's resolution criteria or timeline
- LOW_RESEARCH: Bear or Bull analysis under 100 words; superficial reasoning
- CORRECT_PROCESS: Sound reasoning, appropriate confidence (winners or unsettled with good reasoning)
- UNLUCKY_CORRECT_PROCESS: Sound reasoning but lost — outcome was noise (losers only)
- LUCKY_POOR_PROCESS: Poor reasoning but won — got lucky (winners only)
- STRUCTURAL_CATEGORY_WEAKNESS: Bot performs poorly in this category systematically
- For REJECTED trades: RULE_CORRECT | RULE_TOO_STRICT | RULE_TOO_LOOSE
- For SKIPPED trades: BOT_SKIP_CORRECT | BOT_SKIP_MISSED

AGENT SCORING SCALE: 1-3 harmful, 4-5 no value, 6-7 constructive, 8-9 strong, 10 exceptional.

For superforecaster bots with only [superforecaster]+[research] agents, score only agents present.

Return ONLY JSON:
{
  "failure_mode": "<from list above>",
  "narrative": "<2-3 sentences>",
  "agent_scores": {"<agent_role>": <1-10>, ...},
  "key_excerpt_agent": "<which agent's section to highlight>",
  "outcome_driver": "<HIGHER_CONFIDENCE_THRESHOLD|FOLLOW_RISK_MANAGER|REQUIRE_BASE_RATE|BLOCK_CATEGORY|REQUIRE_DEEPER_BEAR|REQUIRE_MORE_SOURCES|REDUCE_POSITION_SIZE|NONE_OUTCOME_WAS_NOISE>"
}"""

QUALITY_MAP = {
    "CORRECT_PROCESS": "GOOD_PROCESS", "UNLUCKY_CORRECT_PROCESS": "GOOD_PROCESS",
    "LUCKY_POOR_PROCESS": "POOR_PROCESS", "RISK_MANAGER_OVERRULED": "POOR_PROCESS",
    "BASE_RATE_NEGLECT": "POOR_PROCESS", "ANCHORING_BIAS": "POOR_PROCESS",
    "RECENCY_BIAS": "POOR_PROCESS", "RESOLUTION_MISREAD": "POOR_PROCESS",
    "LOW_RESEARCH": "POOR_PROCESS", "INSUFFICIENT_EDGE": "ACCEPTABLE",
    "STRUCTURAL_CATEGORY_WEAKNESS": "ACCEPTABLE",
    "RULE_CORRECT": "GOOD_PROCESS", "RULE_TOO_STRICT": "ACCEPTABLE",
    "RULE_TOO_LOOSE": "POOR_PROCESS", "BOT_SKIP_CORRECT": "GOOD_PROCESS",
    "BOT_SKIP_MISSED": "ACCEPTABLE",
}


def build_autopsy_user(trade: dict, sig: dict, avg_hedge: float) -> str:
    raw = trade.get("raw_reasoning") or ""
    if len(raw) > 6000:
        raw = raw[:6000] + "\n\n[... truncated ...]"

    if sig.get("won") is True:
        outcome = f"WON, P&L: ${sig.get('pnl', 0):.2f}"
    elif sig.get("won") is False:
        outcome = f"LOST, P&L: ${sig.get('pnl', 0):.2f}"
    else:
        outcome = "UNKNOWN (not yet settled)"

    return f"""## Trade
- Market: "{trade.get('market_title', 'Unknown')}"
- Side: {trade.get('side', '?')} at ${trade.get('price', 0)} (confidence: {trade.get('confidence', '?')})
- Outcome: {outcome}
- Bucket: {sig.get('bucket', '?')}
- Note: For REJECTED, evaluate rule correctness. For SKIPPED, evaluate bot judgment. If UNKNOWN, evaluate reasoning quality.

## Pre-Computed Signals (ground truth)
- Base rate mentioned: {sig.get('base_rate_mentioned')}
- Risk Manager endorsed: {sig.get('risk_manager_endorsed')}
- Risk Manager overridden: {sig.get('risk_manager_overridden')}
- Forecaster anchored to price: {sig.get('forecaster_anchored_to_price')}
- Bear depth: {sig.get('bear_word_count', 0)}w | Bull depth: {sig.get('bull_word_count', 0)}w
- Model agreement: {sig.get('model_agreement', '?')}/5
- Edge at entry: {sig.get('edge_at_entry', '?')}
- Sources: {sig.get('sources_cited', 0)} | Hedge score: {sig.get('hedge_score', 0)} (avg: ~{avg_hedge:.1f})
- Hours to close: {sig.get('hours_to_close', '?')}

## Debate Transcript
{raw}"""


def extract_key_excerpt(raw: str, agent_name: Optional[str]) -> Optional[str]:
    if not agent_name or not raw:
        return None
    sections = parse_agent_sections(raw)
    text = sections.get(agent_name, "")
    if not text:
        return None
    lines = text.split("\n", 1)
    body = lines[1] if len(lines) > 1 else lines[0]
    sentences = re.split(r"[.!?]\s+", body.strip())
    if sentences:
        excerpt = ". ".join(sentences[:2]).strip()
        return excerpt + ("." if excerpt and not excerpt.endswith(".") else "")
    return None


def postprocess_autopsy(autopsy: dict, trade: dict, sig: dict, model_name: str) -> dict:
    fm = autopsy.get("failure_mode", "")
    autopsy["decision_quality"] = QUALITY_MAP.get(fm, "ACCEPTABLE")
    autopsy["key_excerpt"] = extract_key_excerpt(trade.get("raw_reasoning", ""), autopsy.get("key_excerpt_agent"))
    autopsy["trade_id"] = trade["id"]
    autopsy["bot_type_id"] = trade.get("bot_type_id")
    autopsy["market_title"] = trade.get("market_title")
    autopsy["bucket"] = sig.get("bucket")
    autopsy["model_used"] = model_name
    return autopsy


async def run_stage2_api(trades: List[dict], signals: List[dict], limit: int, concurrency: int = 15) -> List[dict]:
    """Stage 2 via OpenAI API with parallel async calls."""
    print(f"\nSTAGE 2 — AI Autopsy (OpenAI GPT-4o, {concurrency} parallel)")

    sig_by_id = {s["trade_id"]: s for s in signals}
    eligible = [t for t in trades if len(t.get("raw_reasoning") or "") > 200 and t["id"] in sig_by_id][:limit]
    print(f"  {len(eligible)} trades with raw_reasoning > 200 chars")
    if not eligible:
        return []

    all_hedges = [s["hedge_score"] for s in signals if s.get("hedge_score") is not None]
    avg_hedge = mean(all_hedges) if all_hedges else 5.0

    sem = asyncio.Semaphore(concurrency)
    autopsies = []
    failures = 0
    completed = 0

    async def process_one(t: dict) -> Optional[dict]:
        nonlocal failures, completed
        sig = sig_by_id[t["id"]]
        user_msg = build_autopsy_user(t, sig, avg_hedge)

        async with sem:
            result = await call_openai(AUTOPSY_SYSTEM, user_msg)

        completed += 1
        short_id = t["id"][:8]
        status = t.get("status", "?")

        if result is None or not result.get("failure_mode"):
            failures += 1
            print(f"  [{completed}/{len(eligible)}] {short_id} — {status} → FAILED")
            return None

        result = postprocess_autopsy(result, t, sig, f"openai/{OPENAI_MODEL}")
        fm = result.get("failure_mode", "?")
        print(f"  [{completed}/{len(eligible)}] {short_id} — {status} — {t.get('category', '?')} → {fm}")
        return result

    # Run all in parallel (bounded by semaphore)
    tasks = [process_one(t) for t in eligible]
    results = await asyncio.gather(*tasks)

    autopsies = [r for r in results if r is not None]
    print(f"  Completed {len(autopsies)}/{len(eligible)} ({failures} failures)")
    return autopsies


def run_stage2_cli(trades: List[dict], signals: List[dict], limit: int) -> List[dict]:
    """Stage 2 via Claude CLI (sequential, slow)."""
    print("\nSTAGE 2 — AI Autopsy (Claude CLI — sequential)")

    if not CLAUDE_PATH:
        print("  ERROR: claude CLI not found")
        return []

    sig_by_id = {s["trade_id"]: s for s in signals}
    eligible = [t for t in trades if len(t.get("raw_reasoning") or "") > 200 and t["id"] in sig_by_id][:limit]
    print(f"  {len(eligible)} trades with raw_reasoning > 200 chars")
    if not eligible:
        return []

    all_hedges = [s["hedge_score"] for s in signals if s.get("hedge_score") is not None]
    avg_hedge = mean(all_hedges) if all_hedges else 5.0

    autopsies = []
    failures = 0

    for i, t in enumerate(eligible):
        sig = sig_by_id[t["id"]]
        user_msg = build_autopsy_user(t, sig, avg_hedge)
        prompt = f"{AUTOPSY_SYSTEM}\n\n{user_msg}"

        short_id = t["id"][:8]
        status = t.get("status", "?")
        print(f"  [{i + 1}/{len(eligible)}] {short_id} — {status}", end="", flush=True)

        result = call_claude_cli(prompt)
        if result is None or not result.get("failure_mode"):
            print(" → FAILED")
            failures += 1
            time.sleep(2)
            continue

        result = postprocess_autopsy(result, t, sig, "claude-cli-opus-4.6")
        print(f" → {result.get('failure_mode', '?')}")
        autopsies.append(result)
        time.sleep(2)

    print(f"  Completed {len(autopsies)}/{len(eligible)} ({failures} failures)")
    return autopsies


# ─── Stage 3: Batch Pattern Analysis ─────────────────────────────────────────

# DEPRECATED — replaced by ANALYSIS_SYSTEM in Phase C. Kept for historical reference.
PATTERN_SYSTEM = """You are a quantitative trading analyst. All statistics below are pre-computed from trade data. Your job: identify 1-5 NON-OBVIOUS interactions between signals. Do NOT restate individual stats as patterns.

Bad pattern (restatement): "Base rates mentioned more in winners"
Good pattern (interaction): "When hedge_score > 12 AND bear_word_count < 100, loss rate is 82%"

Each suggested_action must be one of: (a) exact prompt text for specific agent, (b) config parameter change, (c) model swap, (d) new filter rule with exact logic.

Return ONLY JSON:
{
  "patterns": [{"pattern_id": "kebab-case-slug-max-40-chars", "title": "short", "description": "2-3 sentences with numbers", "evidence": "signal interaction", "severity": "critical|moderate|minor", "suggested_action": "specific change", "affected_bots": ["bot_type_id", ...]}],
  "top_agent": "name: 1 sentence why",
  "worst_agent": "name: 1 sentence why"
}
pattern_id: a stable kebab-case identifier for this pattern. If you detect the same issue in future runs, reuse the same pattern_id. Example: "high-hedge-low-bear-blindspot".
affected_bots: list of bot_type_id values from the Bots header that this pattern applies to. Use ["all"] only if the pattern genuinely affects every bot."""


ANALYSIS_SYSTEM = """You are a quantitative trading analyst producing a weekly performance report for a prediction-market trading bot system (Kalshi + Polymarket). All statistics below are PRE-COMPUTED from trade_signals data — do not recompute them. Your job is to produce an actionable analysis with five sections:

1. WEEK-OVER-WEEK COMPARISON TABLE: Build a markdown table comparing this week vs last week across key metrics: win rate, P&L, avg price, avg edge, avg confidence, placement rate, error count. Show the delta for each. Lead with whether things improved or deteriorated.

2. BOT-BY-BOT PERFORMANCE: For EACH bot in the per_bot and weekly_per_bot data, give a brief assessment (2-3 sentences). Include: win rate, P&L, number of trades placed vs skipped, and whether it improved or deteriorated from last week. Call out the best and worst performing bot. If a bot has very few trades, say so and note the data is thin.

3. WHAT ACTUALLY CHANGED (3-5 bullets): Explain the WHY behind the numbers. Focus on:
   - Price bracket shifts (are bots picking safer/riskier markets? cite hit_rate_by_price data)
   - Timing shifts (are bots trading closer-to-close or further out? cite hit_rate_by_timing data)
   - Category performance (which categories are making/losing money? cite categories data)
   - Edge behavior (is the model claiming smaller/larger edges? is that helping?)
   - Confidence calibration (is confidence predictive this week? cite correlations)
   - Filter effectiveness (is the rules engine adding or destroying value? cite counterfactual data)

4. NON-OBVIOUS INTERACTIONS (2-4): Cross-signal patterns the deterministic alerts MISSED. Each must reference 2+ aggregate sections. Be specific with numbers.

Bad: "Win rate is below 50%"
Good: "When price < 35c AND hours_to_close > 72h, loss rate is 90% — the bot performs worst on cheap long-dated markets"

5. CONFIG SUGGESTIONS (1-3): Concrete parameter changes. For each: field name, current value, suggested value, rationale with numbers. Draw from hit_rate_by_price, hit_rate_by_timing, categories, and weekly_per_bot data.

6. HONEST REASSESSMENT: If this is not the first report, revisit any prior suggestions. State whether each is still valid, less urgent, or should be dropped — based on the new data. Be honest — if the model self-corrected, say so.

IMPORTANT: A `deterministic_alerts` section is included below. Do NOT repeat those alerts. Focus on what the rules missed.

Return ONLY valid JSON:
{
  "narrative": "2-4 paragraph markdown string with the week-over-week table embedded",
  "bot_performance": [
    {
      "bot": "bot_type_id",
      "summary": "2-3 sentences: WR, PnL, trades placed/skipped, trend vs last week",
      "verdict": "strong|improving|flat|declining|insufficient_data"
    }
  ],
  "what_changed": [
    {
      "title": "short title (e.g. 'Price bracket shifted to safer markets')",
      "detail": "2-3 sentences with specific numbers",
      "impact": "positive|negative|neutral"
    }
  ],
  "interactions": [
    {
      "title": "short title",
      "description": "2-3 sentences with specific numbers",
      "evidence": "which aggregate sections you cross-referenced",
      "severity": "critical|high|moderate|info",
      "affected_bots": ["bot_type_id", ...]
    }
  ],
  "config_suggestions": [
    {
      "field": "config field name",
      "current_value": "from aggregates",
      "suggested_value": "new value",
      "rationale": "1-2 sentences with numbers"
    }
  ],
  "reassessment": "markdown string — revisit any prior suggestions if applicable, or 'First report — no prior suggestions to reassess.' if this is the first"
}"""


def compute_batch_stats(signals: List[dict], autopsies: List[dict] = None) -> dict:
    if autopsies:
        failure_counts = Counter(a.get("failure_mode") for a in autopsies if a.get("failure_mode"))

    if autopsies:
        agent_agg: Dict[str, List] = {}
        for a in autopsies:
            for agent, score in (a.get("agent_scores") or {}).items():
                if isinstance(score, (int, float)):
                    agent_agg.setdefault(agent, []).append(score)
        agent_scorecard = {a: {"avg": round(mean(s), 2), "n": len(s)} for a, s in agent_agg.items()}

    by_bucket: Dict[str, List[dict]] = {}
    for s in signals:
        by_bucket.setdefault(s.get("bucket", "?"), []).append(s)

    def sm(lst, key):
        vals = [x[key] for x in lst if x.get(key) is not None]
        return round(mean(vals), 3) if vals else None

    bucket_stats = {}
    for bk, sigs in by_bucket.items():
        bucket_stats[bk] = {
            "count": len(sigs), "avg_confidence": sm(sigs, "confidence"),
            "avg_edge": sm(sigs, "edge_at_entry"), "avg_hedge": sm(sigs, "hedge_score"),
            "avg_words": sm(sigs, "total_reasoning_words"),
            "avg_bear_w": sm(sigs, "bear_word_count"), "avg_bull_w": sm(sigs, "bull_word_count"),
            "base_rate_pct": round(sum(1 for s in sigs if s.get("base_rate_mentioned")) / len(sigs) * 100, 1),
            "avg_sources": sm(sigs, "sources_cited"),
        }

    by_cat: Dict[str, List[dict]] = {}
    for s in signals:
        by_cat.setdefault(s.get("category") or "?", []).append(s)
    cat_stats = {c: {"count": len(ss), "avg_hedge": sm(ss, "hedge_score")} for c, ss in by_cat.items()}

    return {
        "failure_modes": dict(failure_counts.most_common()) if autopsies else {},
        "agent_scorecard": agent_scorecard if autopsies else {},
        "bucket_comparison": bucket_stats,
        "category_stats": cat_stats,
        "total_autopsies": len(autopsies) if autopsies else 0,
        "total_signals": len(signals),
    }


async def run_stage3(signals: List[dict], autopsies: List[dict], backend: str) -> Optional[dict]:
    print("\nSTAGE 3 — Batch Pattern Analysis")
    if len(autopsies) < 5:
        print(f"  Only {len(autopsies)} autopsies — need 5+, skipping")
        return None

    stats = compute_batch_stats(signals, autopsies)
    print(f"  Computing patterns from {len(autopsies)} autopsies...")

    bt = Counter(s.get("bot_type_id") for s in signals)
    user_msg = f"""## Bots: {dict(bt)} — {len(signals)} trades ({len(autopsies)} autopsied)

## Failure Modes: {json.dumps(stats['failure_modes'], indent=2)}
## Agent Scorecard: {json.dumps(stats['agent_scorecard'], indent=2)}
## Bucket Comparison: {json.dumps(stats['bucket_comparison'], indent=2)}
## Category Stats: {json.dumps(stats['category_stats'], indent=2)}

Note: Most trades are skipped/rejected without settled outcomes. Focus on reasoning quality."""

    if backend == "openai" and OPENAI_API_KEY:
        result = await call_openai(PATTERN_SYSTEM, user_msg, timeout=120)
    elif CLAUDE_PATH:
        result = call_claude_cli(f"{PATTERN_SYSTEM}\n\n{user_msg}", timeout=240)
    else:
        print("  ERROR: No AI backend available")
        return None

    if not result:
        print("  FAILED — no response")
        return None

    result["deterministic_stats"] = stats
    patterns = result.get("patterns", [])
    print(f"  Found {len(patterns)} patterns")
    for p in patterns:
        print(f"    [{p.get('severity', '?')}] {p.get('title', '?')}")
    return result


# ─── Stage 4: Parameter Sweep ────────────────────────────────────────────────

def run_stage4(signals: List[dict]) -> Optional[dict]:
    print("\nSTAGE 4 — Parameter Sweep")
    settled = [s for s in signals if s.get("pnl") is not None]
    if len(settled) < 10:
        print(f"  Only {len(settled)} trades with PnL — need 10+, skipping")
        return None

    def sweep(field, thresholds):
        rows = []
        for thr in thresholds:
            passed = [s for s in settled if (s.get(field) or 0) >= thr]
            filtered = [s for s in settled if (s.get(field) or 0) < thr]
            if not passed:
                continue
            f_won = [s for s in filtered if s.get("won")]
            f_lost = [s for s in filtered if s.get("won") is False]
            rows.append({
                "threshold": thr, "kept": len(passed), "filtered": len(filtered),
                "wins_missed": len(f_won), "losses_avoided": len(f_lost),
                "net_delta": round(-sum(s.get("pnl", 0) for s in f_lost) - sum(s.get("pnl", 0) for s in f_won), 2),
                "win_rate": round(sum(1 for s in passed if s.get("won")) / len(passed), 3),
            })
        return rows

    conf_s = sweep("confidence", [x / 100 for x in range(50, 92, 2)])
    edge_s = sweep("edge_at_entry", [x / 100 for x in range(2, 22, 1)])

    by_cat = {}
    for s in settled:
        by_cat.setdefault(s.get("category") or "?", []).append(s)
    cat_stats = {c: {"n": len(ss), "wins": sum(1 for s in ss if s.get("won")),
                      "pnl": round(sum(s.get("pnl", 0) for s in ss), 2)} for c, ss in by_cat.items()}

    half = len(settled) // 2
    opt_c = max([r for r in conf_s if r["kept"] >= half], key=lambda r: r["net_delta"], default=None)
    opt_e = max([r for r in edge_s if r["kept"] >= half], key=lambda r: r["net_delta"], default=None)

    if opt_c:
        print(f"  Optimal minConf: {opt_c['threshold']} (net +${opt_c['net_delta']:.2f})")
    if opt_e:
        print(f"  Optimal edge: {opt_e['threshold']} (net +${opt_e['net_delta']:.2f})")

    return {"trade_count": len(settled), "confidence_sweep": conf_s, "edge_sweep": edge_s,
            "category_stats": cat_stats, "optimal_confidence": opt_c, "optimal_edge": opt_e}


# ─── Stage 5: Platform Stats ─────────────────────────────────────────────────

def run_stage5(trades: List[dict], signals: List[dict], autopsies: Optional[List[dict]]) -> dict:
    print("\nSTAGE 5 — Platform Stats")
    total = len(trades)
    status_dist = Counter(t.get("status") for t in trades)
    settled = [t for t in trades if t.get("settled")]
    with_pnl = [s for s in signals if s.get("pnl") is not None]

    cat_counts = Counter(t.get("category") for t in trades)
    bt_counts = Counter(t.get("bot_type_id") for t in trades)

    confs = [s["confidence"] for s in signals if s.get("confidence") is not None]
    edges = [s["edge_at_entry"] for s in signals if s.get("edge_at_entry") is not None]
    hedges = [s["hedge_score"] for s in signals if s.get("hedge_score") is not None]
    words = [s["total_reasoning_words"] for s in signals if s.get("total_reasoning_words")]
    pnls = [s["pnl"] for s in with_pnl]

    stats = {
        "total_trades": total,
        "status_distribution": dict(status_dist.most_common()),
        "settled_count": len(settled),
        "categories": dict(cat_counts.most_common()),
        "bot_types": dict(bt_counts.most_common()),
        "avg_confidence": round(mean(confs), 4) if confs else None,
        "avg_edge": round(mean(edges), 4) if edges else None,
        "avg_hedge_score": round(mean(hedges), 2) if hedges else None,
        "avg_reasoning_words": round(mean(words)) if words else None,
        "total_pnl": round(sum(pnls), 2) if pnls else None,
        "win_rate": round(sum(1 for p in pnls if p > 0) / len(pnls), 3) if pnls else None,
    }
    if autopsies:
        stats["failure_modes"] = dict(Counter(a.get("failure_mode") for a in autopsies if a.get("failure_mode")).most_common())
        stats["decision_quality"] = dict(Counter(a.get("decision_quality") for a in autopsies if a.get("decision_quality")).most_common())

    print(f"  {total} trades, {len(settled)} settled, avg confidence {stats.get('avg_confidence', '?')}")
    if stats.get("avg_edge"):
        print(f"  Avg edge: {stats['avg_edge']}, avg hedge: {stats.get('avg_hedge_score', '?')}")
    print(f"  Categories: {dict(cat_counts.most_common(5))}")
    return stats


# ─── Save & Main ─────────────────────────────────────────────────────────────

def save_results(data, filename: str):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULTS_DIR / filename
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  Saved → {path}")


async def async_main():
    global RESULTS_DIR, OPENAI_API_KEY

    parser = argparse.ArgumentParser(
        description="Trade Intelligence System — local CSV pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--stage", required=True, help="Stages: 1,2,3,4,5 (comma-separated)")
    parser.add_argument("--csv", required=True, help="Path to trades CSV")
    parser.add_argument("--bot-type", default=None, help="Filter by bot_type_id")
    parser.add_argument("--limit", type=int, default=500, help="Max trades per stage")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: ~/Desktop/trade-intelligence)")
    parser.add_argument("--backend", default="auto", choices=["auto", "openai", "claude-cli"],
                        help="AI backend: auto (OpenAI if key set, else CLI), openai, claude-cli")
    parser.add_argument("--concurrency", type=int, default=15, help="Parallel API calls (default: 15)")
    args = parser.parse_args()

    stages = [int(s.strip()) for s in args.stage.split(",")]

    # Output directory
    if args.output_dir:
        RESULTS_DIR = Path(os.path.expanduser(args.output_dir))
    else:
        RESULTS_DIR = Path(os.path.expanduser("~/Desktop/trade-intelligence"))

    # Backend selection
    backend = args.backend
    if backend == "auto":
        backend = "openai" if OPENAI_API_KEY else "claude-cli"

    if backend == "openai" and not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY not set. Export it or use --backend claude-cli")
        sys.exit(1)

    # Load trades
    csv_path = os.path.expanduser(args.csv)
    if not os.path.isfile(csv_path):
        print(f"ERROR: CSV not found: {csv_path}")
        sys.exit(1)

    trades = load_trades(csv_path, bot_type=args.bot_type)
    print(f"Loaded {len(trades)} trades from CSV")
    for bt, c in Counter(t.get("bot_type_id") for t in trades).most_common():
        print(f"  {bt}: {c}")

    if not trades:
        sys.exit(0)

    print(f"Backend: {backend} | Output: {RESULTS_DIR}")
    start = time.time()

    signals: List[dict] = []
    autopsies: List[dict] = []
    patterns = None

    # ── Stage 1 ──
    if 1 in stages:
        t0 = time.time()
        signals = run_stage1(trades, args.limit)
        save_results(signals, "stage1_signals.json")
        print(f"  Time: {time.time() - t0:.1f}s")
    else:
        p = RESULTS_DIR / "stage1_signals.json"
        if p.exists():
            signals = json.loads(p.read_text())
            print(f"\nLoaded {len(signals)} signals from {p}")
        elif any(s in stages for s in [2, 3, 4, 5]):
            print("\nWARN: No Stage 1 results — run Stage 1 first")

    # ── Stage 2 ──
    if 2 in stages:
        if not signals:
            print("\nSTAGE 2 — SKIPPED (no signals)")
        else:
            t0 = time.time()
            if backend == "openai":
                autopsies = await run_stage2_api(trades, signals, args.limit, args.concurrency)
            else:
                autopsies = run_stage2_cli(trades, signals, args.limit)
            save_results(autopsies, "stage2_autopsies.json")
            print(f"  Time: {time.time() - t0:.1f}s")
    else:
        p = RESULTS_DIR / "stage2_autopsies.json"
        if p.exists():
            autopsies = json.loads(p.read_text())
            print(f"\nLoaded {len(autopsies)} autopsies from {p}")

    # ── Stage 3 ──
    if 3 in stages:
        if not autopsies:
            print("\nSTAGE 3 — SKIPPED (no autopsies)")
        else:
            t0 = time.time()
            patterns = await run_stage3(signals, autopsies, backend)
            if patterns:
                save_results(patterns, "stage3_patterns.json")
            print(f"  Time: {time.time() - t0:.1f}s")

    # ── Stage 4 ──
    if 4 in stages:
        t0 = time.time()
        sweep = run_stage4(signals or [])
        if sweep:
            save_results(sweep, "stage4_sweep.json")
            print(f"  Time: {time.time() - t0:.1f}s")

    # ── Stage 5 ──
    if 5 in stages:
        t0 = time.time()
        stats = run_stage5(trades, signals or [], autopsies or None)
        save_results(stats, "stage5_stats.json")
        print(f"  Time: {time.time() - t0:.1f}s")

    print(f"\nDone in {time.time() - start:.1f}s")
    print(f"Results at: {RESULTS_DIR}")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
