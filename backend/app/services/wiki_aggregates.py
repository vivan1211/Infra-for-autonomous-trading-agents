"""Cross-trade signal aggregation — lifted verbatim from quant_report.py."""
from __future__ import annotations

import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

try:
    from backend.scripts.trade_intelligence import parse_datetime, is_superforecaster
except ImportError:
    from pathlib import Path as _Path
    import sys as _sys
    _scripts_dir = str(_Path(__file__).resolve().parents[2] / "scripts")
    if _scripts_dir not in _sys.path:
        _sys.path.insert(0, _scripts_dir)
    from trade_intelligence import parse_datetime, is_superforecaster  # type: ignore[import-untyped]

# ─── Constants ──────────────────────────────────────────────────────────────

SF_BOT_TOKENS = ("superforecaster",)  # bot_type_id substrings that mark SF
PLACED_STATUSES = ("executed", "paper", "open", "pending", "pending_fill")
CF_STATUSES = ("skipped", "rejected", "error", "paper")  # statuses eligible for counterfactual analysis
EARLY_SKIP_WORD_THRESHOLD = 100  # raw_reasoning < this many words = no real research

NUMERIC_SIGNAL_FIELDS = (
    "confidence",
    "edge_at_entry",
    "forecaster_edge_signed",  # signed (forecaster_prob - market_price); the *real* edge
    "hedge_score",
    "total_reasoning_words",
    "sources_cited",
    "model_agreement",
    "anchor_delta",
    "hours_to_close",
)

# ───────── Gated rate thresholds (C1 Wave 3) ─────────
MIN_N_DISPLAY = 5    # below this: show "— (n=X, too thin)", no point estimate
MIN_N_BOLD = 20      # bolding / any claim-strength formatting requires >= this
MIN_N_VERDICT = 30   # recommendations & bolded verdicts require n >= this AND CI exclusion of 0.50

PRICE_EDGES = [0.0, 0.20, 0.35, 0.50, 0.65, 0.80, 1.00]
PRICE_LABELS = ["<20c", "20-35c", "35-50c", "50-65c", "65-80c", "80c+"]
TIME_EDGES = [0, 24, 72, 168, 336, float("inf")]
TIME_LABELS = ["<24h", "24-72h", "3-7d", "7-14d", "14d+"]


# ─── Stat helpers ───────────────────────────────────────────────────────────

def _drop_none(xs: Iterable[Any]) -> list:
    return [x for x in xs if x is not None]


def s_mean(xs: Iterable[Any]) -> Optional[float]:
    xs = _drop_none(xs)
    return statistics.mean(xs) if xs else None


def s_median(xs: Iterable[Any]) -> Optional[float]:
    xs = _drop_none(xs)
    return statistics.median(xs) if xs else None


def s_stdev(xs: Iterable[Any]) -> Optional[float]:
    xs = _drop_none(xs)
    return statistics.stdev(xs) if len(xs) > 1 else None


def s_min(xs: Iterable[Any]) -> Optional[float]:
    xs = _drop_none(xs)
    return min(xs) if xs else None


def s_max(xs: Iterable[Any]) -> Optional[float]:
    xs = _drop_none(xs)
    return max(xs) if xs else None


def pearson(xs_in: Iterable[Any], ys_in: Iterable[Any]) -> Optional[float]:
    """Pearson correlation, ignoring rows where either value is None."""
    pairs = [(x, y) for x, y in zip(xs_in, ys_in) if x is not None and y is not None]
    if len(pairs) < 2:
        return None
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    num = sum((x - mx) * (y - my) for x, y in pairs)
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if den_x == 0 or den_y == 0:
        return None
    return num / (den_x * den_y)


def wilson_interval(wins: int, n: int, z: float = 1.96) -> Optional[tuple[float, float]]:
    """Wilson score 95% CI for a binomial proportion. Returns (lo, hi) or None if n=0."""
    if n <= 0:
        return None
    p = wins / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = (z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def brier_score(forecasts_outcomes: list[tuple[float, bool]]) -> Optional[float]:
    """Mean Brier score = mean((p - outcome)**2). Lower = better calibrated.
    Domain: [0, 1]; baseline of always-0.5 is 0.25; perfect = 0; worst = 1."""
    if not forecasts_outcomes:
        return None
    return sum((p - (1.0 if o else 0.0)) ** 2 for p, o in forecasts_outcomes) / len(forecasts_outcomes)


def gated_rate(wins: int, n: int) -> dict:
    """Return a dict with {text, bold, p, ci, n}. Below MIN_N_DISPLAY, text is a stub.

    text  -- markdown-ready rate string
    bold  -- True iff n >= MIN_N_VERDICT AND the Wilson CI excludes 0.50
    p/ci  -- raw proportion and Wilson interval (None when n below threshold)
    n     -- sample size (for call-site re-use)
    """
    if n is None or n < MIN_N_DISPLAY:
        return {"text": f"— (n={n or 0}, too thin)", "bold": False, "p": None, "ci": None, "n": n or 0}
    p = wins / n
    ci = wilson_interval(wins, n)
    if ci is None:
        return {"text": f"{p:.1%} (n={n})", "bold": False, "p": p, "ci": None, "n": n}
    lo, hi = ci
    text = f"{p:.1%} [{lo:.0%}-{hi:.0%}] (n={n})"
    bold = n >= MIN_N_VERDICT and (lo > 0.50 or hi < 0.50)
    return {"text": text, "bold": bold, "p": p, "ci": ci, "n": n}


def fmt_gated(g: dict) -> str:
    """Format a gated_rate() dict -- bolds iff n >= MIN_N_VERDICT AND CI excludes 0.50."""
    return f"**{g['text']}**" if g.get("bold") else g["text"]


# ─── Aggregators ────────────────────────────────────────────────────────────

def overall_stats(signals: list[dict]) -> dict:
    n = len(signals)
    statuses = Counter(s["status"] or "unknown" for s in signals)
    cats = Counter((s["category"] or "Unknown") for s in signals)
    bots = Counter(s["bot_type_id"] or "unknown" for s in signals)
    sides = Counter(s["side"] or "unknown" for s in signals)
    envs = Counter(s["environment"] or "unknown" for s in signals)
    models = Counter((s["model"] or "unknown") for s in signals)

    placed = [s for s in signals if s["status"] in PLACED_STATUSES]
    real_decided = [s for s in placed if s["real_won"] is not None]
    real_won = [s for s in real_decided if s["real_won"]]

    cf_decided = [s for s in signals if s["cf_won"] is not None]
    cf_won = [s for s in cf_decided if s["cf_won"]]

    real_pnls = [s["real_pnl"] for s in placed if s["real_pnl"] is not None]
    # C2 patch: cf_pnl_sum must mirror cf_win_rate's scope (skipped/rejected only)
    # so we don't double-count placed trades that also happen to have cf_pnl populated.
    cf_pnls = [
        s["cf_pnl"] for s in signals
        if s["cf_pnl"] is not None
        and s["cf_settled"]
        and s["status"] in CF_STATUSES
    ]

    timestamps = sorted([s["timestamp"] for s in signals if s["timestamp"]])

    # Risk-adjusted metrics on placed+settled real pnl (per-trade Sharpe, MDD).
    # Needs >=2 trades for Sharpe; >=1 for MDD. Time-orders by trade timestamp
    # so drawdown reflects actual equity-curve shape, not arbitrary insert order.
    placed_settled_time_ordered = sorted(
        [s for s in placed if s.get("real_pnl") is not None and s.get("timestamp")],
        key=lambda s: s["timestamp"],
    )
    ts_pnls = [s["real_pnl"] for s in placed_settled_time_ordered]

    trade_sharpe: Optional[float] = None
    if len(ts_pnls) >= 2:
        mu = s_mean(ts_pnls)
        sd = s_stdev(ts_pnls)
        if mu is not None and sd is not None and sd > 0:
            trade_sharpe = mu / sd

    # Max drawdown on the cumulative equity curve. Reports both the absolute
    # worst peak-to-trough dollar drop and the peak value where it started.
    max_drawdown: Optional[float] = None
    max_drawdown_peak: Optional[float] = None
    max_drawdown_trough: Optional[float] = None
    if ts_pnls:
        cum = 0.0
        peak = 0.0
        worst = 0.0
        worst_peak = 0.0
        worst_trough = 0.0
        for p in ts_pnls:
            cum += p
            if cum > peak:
                peak = cum
            dd = cum - peak  # <= 0
            if dd < worst:
                worst = dd
                worst_peak = peak
                worst_trough = cum
        max_drawdown = worst
        max_drawdown_peak = worst_peak
        max_drawdown_trough = worst_trough

    return {
        "total_trades": n,
        "status_distribution": dict(statuses),
        "bot_distribution": dict(bots),
        "category_distribution": dict(cats),
        "side_distribution": dict(sides),
        "environment_distribution": dict(envs),
        "model_distribution": dict(models),

        "n_placed": len(placed),
        "n_real_settled": len(real_decided),
        "n_cf_settled": len(cf_decided),

        "real_pnl_sum": sum(real_pnls) if real_pnls else 0.0,
        "cf_pnl_sum": sum(cf_pnls) if cf_pnls else 0.0,
        "n_real_pnl_rows": len(real_pnls),
        "n_cf_pnl_rows": len(cf_pnls),

        "real_win_rate": (len(real_won) / len(real_decided)) if real_decided else None,
        "real_win_rate_ci": wilson_interval(len(real_won), len(real_decided)),
        "real_n_won": len(real_won),

        "cf_win_rate": (len(cf_won) / len(cf_decided)) if cf_decided else None,
        "cf_win_rate_ci": wilson_interval(len(cf_won), len(cf_decided)),
        "cf_n_won": len(cf_won),

        "avg_confidence_all": s_mean(s["confidence"] for s in signals),
        "avg_edge_all": s_mean(s["edge_at_entry"] for s in signals),
        "avg_signed_edge_all": s_mean(s["forecaster_edge_signed"] for s in signals),
        "avg_hedge_all": s_mean(s["hedge_score"] for s in signals),
        "first_trade_ts": timestamps[0] if timestamps else None,
        "last_trade_ts": timestamps[-1] if timestamps else None,

        # Risk-adjusted metrics (Day 5 addition)
        "trade_sharpe": trade_sharpe,
        "n_trade_sharpe": len(ts_pnls),
        "max_drawdown": max_drawdown,
        "max_drawdown_peak": max_drawdown_peak,
        "max_drawdown_trough": max_drawdown_trough,
    }


def per_bot_breakdown(signals: list[dict]) -> dict:
    out: dict[str, dict] = {}
    bots = sorted({s["bot_type_id"] or "unknown" for s in signals})
    for bot in bots:
        sf = is_superforecaster(bot)
        bs = [s for s in signals if (s["bot_type_id"] or "unknown") == bot]
        placed = [s for s in bs if s["status"] in PLACED_STATUSES]
        real_decided = [s for s in placed if s["real_won"] is not None]
        real_won = [s for s in real_decided if s["real_won"]]

        cf_decided = [s for s in bs if s["cf_won"] is not None]
        cf_won = [s for s in cf_decided if s["cf_won"]]

        if sf:
            bull_mean = bear_mean = None
            bull_bear_ratio = None
            bull_bear_label = "N/A -- phased reasoning"
        else:
            bull_vals = [s["bull_word_count"] for s in bs if s["bull_word_count"] is not None]
            bear_vals = [s["bear_word_count"] for s in bs if s["bear_word_count"] is not None]
            bull_mean = s_mean(bull_vals)
            bear_mean = s_mean(bear_vals)
            if bull_mean is not None and bear_mean is not None and bear_mean > 0:
                bull_bear_ratio = bull_mean / bear_mean
            else:
                bull_bear_ratio = None
            bull_bear_label = None

        real_pnl = sum(s["real_pnl"] for s in placed if s["real_pnl"] is not None)
        cf_pnl = sum(
            s["cf_pnl"] for s in bs
            if s["cf_pnl"] is not None and s["cf_settled"]
            and s["status"] in CF_STATUSES
        )
        # Dollar-weighted real win rate (uses total_cost as weight)
        weighted_pairs = [
            (s["real_won"], s["total_cost"])
            for s in real_decided
            if s["total_cost"] is not None
        ]
        if weighted_pairs:
            weight_total = sum(c for _, c in weighted_pairs)
            weighted_wins = sum(c for w, c in weighted_pairs if w)
            dollar_wr = weighted_wins / weight_total if weight_total > 0 else None
        else:
            dollar_wr = None

        out[bot] = {
            "n_total": len(bs),
            "n_placed": len(placed),
            "n_skipped": sum(1 for s in bs if s["status"] == "skipped"),
            "n_rejected": sum(1 for s in bs if s["status"] == "rejected"),
            "n_real_settled": len(real_decided),
            "n_cf_settled": len(cf_decided),

            "real_win_rate": (len(real_won) / len(real_decided)) if real_decided else None,
            "real_win_rate_ci": wilson_interval(len(real_won), len(real_decided)),
            "real_n_won": len(real_won),
            "dollar_weighted_win_rate": dollar_wr,

            "cf_win_rate": (len(cf_won) / len(cf_decided)) if cf_decided else None,
            "cf_win_rate_ci": wilson_interval(len(cf_won), len(cf_decided)),

            "real_pnl": real_pnl,
            "cf_pnl": cf_pnl,
            "real_pnl_per_trade": real_pnl / len(real_decided) if real_decided else None,

            "avg_confidence": s_mean(s["confidence"] for s in bs),
            "avg_edge": s_mean(s["edge_at_entry"] for s in bs),
            "avg_signed_edge": s_mean(s["forecaster_edge_signed"] for s in bs),
            "avg_hedge": s_mean(s["hedge_score"] for s in bs),
            "avg_words": s_mean(s["total_reasoning_words"] for s in bs),
            "avg_sources": s_mean(s["sources_cited"] for s in bs),

            "place_rate": len(placed) / len(bs) if bs else None,
            "base_rate_pct": (
                sum(1 for s in bs if s["base_rate_mentioned"]) / len(bs)
                if bs else None
            ),
            "bull_words_mean": bull_mean,
            "bear_words_mean": bear_mean,
            "bull_bear_ratio": bull_bear_ratio,
            "bull_bear_note": bull_bear_label,
        }
    return out


def pipeline_bimodality(signals: list[dict]) -> dict:
    out: dict = {}
    bots = sorted({s["bot_type_id"] or "unknown" for s in signals})
    for bot in bots:
        bs = [s for s in signals if (s["bot_type_id"] or "unknown") == bot]
        early = [s for s in bs if (s["total_reasoning_words"] or 0) < EARLY_SKIP_WORD_THRESHOLD]
        deep = [s for s in bs if (s["total_reasoning_words"] or 0) >= EARLY_SKIP_WORD_THRESHOLD]
        out[bot] = {
            "n_total": len(bs),
            "n_early_skip": len(early),
            "n_research_reaching": len(deep),
            "early_skip_pct": len(early) / len(bs) if bs else 0,
            "deep_avg_confidence": s_mean(s["confidence"] for s in deep),
            "deep_avg_edge": s_mean(s["edge_at_entry"] for s in deep),
            "deep_avg_signed_edge": s_mean(s["forecaster_edge_signed"] for s in deep),
            "deep_avg_words": s_mean(s["total_reasoning_words"] for s in deep),
            "deep_avg_sources": s_mean(s["sources_cited"] for s in deep),
        }
    return out


def conf_edge_inversion(signals: list[dict]) -> dict:
    """Bucket-level conf-edge gap analysis using BOTH the absolute and signed edges."""
    by_bucket: dict[str, dict] = {}
    buckets = {
        "skipped": [s for s in signals if s["status"] == "skipped"],
        "rejected": [s for s in signals if s["status"] == "rejected"],
        "placed": [s for s in signals if s["status"] in PLACED_STATUSES],
    }
    for name, group in buckets.items():
        confs = [s["confidence"] for s in group if s["confidence"] is not None]
        edges = [s["edge_at_entry"] for s in group if s["edge_at_entry"] is not None]
        signed = [s["forecaster_edge_signed"] for s in group if s["forecaster_edge_signed"] is not None]
        gaps = [
            (s["confidence"] - s["edge_at_entry"])
            for s in group
            if s["confidence"] is not None and s["edge_at_entry"] is not None
        ]
        by_bucket[name] = {
            "n": len(group),
            "avg_confidence": s_mean(confs),
            "avg_edge_abs": s_mean(edges),
            "avg_signed_edge": s_mean(signed),
            "mean_gap": s_mean(gaps),
            "median_gap": s_median(gaps),
            "max_gap": s_max(gaps),
        }

    research = [
        s for s in signals
        if (s["total_reasoning_words"] or 0) >= EARLY_SKIP_WORD_THRESHOLD
        and s["confidence"] is not None
        and s["edge_at_entry"] is not None
    ]
    heatmap: list[dict] = []
    if len(research) >= 25:
        confs_sorted = sorted([s["confidence"] for s in research])
        edges_sorted = sorted([s["edge_at_entry"] for s in research])

        def quintile(value: float, sorted_vals: list[float]) -> int:
            n = len(sorted_vals)
            for q in range(1, 5):
                if value <= sorted_vals[max(0, int(n * q / 5) - 1)]:
                    return q
            return 5

        cells: dict[tuple[int, int], list] = defaultdict(list)
        for s in research:
            qc = quintile(s["confidence"], confs_sorted)
            qe = quintile(s["edge_at_entry"], edges_sorted)
            cells[(qc, qe)].append(s)
        for (qc, qe), members in sorted(cells.items()):
            placed_in = [m for m in members if m["status"] in PLACED_STATUSES]
            decided = [m for m in placed_in if m["real_won"] is not None]
            won = [m for m in decided if m["real_won"]]
            heatmap.append({
                "conf_quintile": qc,
                "edge_quintile": qe,
                "n": len(members),
                "n_placed": len(placed_in),
                "real_win_rate": (len(won) / len(decided)) if decided else None,
            })

    return {"by_bucket": by_bucket, "heatmap": heatmap}


def correlation_matrix(signals: list[dict]) -> dict:
    research = [s for s in signals if (s["total_reasoning_words"] or 0) >= EARLY_SKIP_WORD_THRESHOLD]
    fields = list(NUMERIC_SIGNAL_FIELDS)
    matrix: dict[str, dict[str, Optional[float]]] = {}
    for f1 in fields:
        matrix[f1] = {}
        col1 = [s.get(f1) for s in research]
        for f2 in fields:
            col2 = [s.get(f2) for s in research]
            matrix[f1][f2] = pearson(col1, col2)

    decided = [s for s in research if s["real_won"] is not None]
    won_corrs: dict[str, Optional[float]] = {}
    if decided:
        won_int = [1.0 if s["real_won"] else 0.0 for s in decided]
        for f in fields:
            col = [s.get(f) for s in decided]
            won_corrs[f] = pearson(col, won_int)
    return {
        "matrix": matrix,
        "n_rows": len(research),
        "won_correlations": won_corrs,
        "n_won_rows": len(decided),
    }


def placed_trade_forensics(signals: list[dict]) -> dict:
    placed = [s for s in signals if s["status"] in PLACED_STATUSES]
    decided = [s for s in placed if s["real_won"] is not None]
    won = [s for s in decided if s["real_won"]]
    lost = [s for s in decided if not s["real_won"]]
    open_positions = [s for s in placed if s["real_won"] is None]

    settled_with_pnl = [s for s in placed if s["real_pnl"] is not None]
    by_pnl_desc = sorted(settled_with_pnl, key=lambda s: s["real_pnl"], reverse=True)
    top_winners = by_pnl_desc[:10]
    top_losers = sorted(settled_with_pnl, key=lambda s: s["real_pnl"])[:10]

    gaps = [
        s["confidence"] - s["edge_at_entry"]
        for s in placed
        if s["confidence"] is not None and s["edge_at_entry"] is not None
    ]

    def fmt_row(s: dict) -> dict:
        return {
            "trade_id": s["trade_id"][:8],
            "bot": s["bot_type_id"],
            "market": (s["market_title"] or "")[:60],
            "side": s["side"],
            "price": s["price"],
            "confidence": s["confidence"],
            "edge_abs": s["edge_at_entry"],
            "signed_edge": s["forecaster_edge_signed"],
            "pnl": s["real_pnl"],
            "won": s["real_won"],
        }

    return {
        "n_placed": len(placed),
        "n_settled": len(decided),
        "n_open": len(open_positions),
        "n_won": len(won),
        "n_lost": len(lost),
        "win_rate": (len(won) / len(decided)) if decided else None,
        "win_rate_ci": wilson_interval(len(won), len(decided)),
        "avg_confidence_winners": s_mean(s["confidence"] for s in won),
        "avg_confidence_losers": s_mean(s["confidence"] for s in lost),
        "avg_edge_winners": s_mean(s["edge_at_entry"] for s in won),
        "avg_edge_losers": s_mean(s["edge_at_entry"] for s in lost),
        "avg_signed_edge_winners": s_mean(s["forecaster_edge_signed"] for s in won),
        "avg_signed_edge_losers": s_mean(s["forecaster_edge_signed"] for s in lost),
        "avg_gap": s_mean(gaps),
        "max_gap": s_max(gaps),
        "top_winners": [fmt_row(s) for s in top_winners],
        "top_losers": [fmt_row(s) for s in top_losers],
    }


def category_dynamics(signals: list[dict]) -> dict:
    by_cat: dict[str, dict] = {}
    cats = Counter((s["category"] or "Unknown") for s in signals)
    for cat, count in cats.most_common():
        cs = [s for s in signals if (s["category"] or "Unknown") == cat]
        placed = [s for s in cs if s["status"] in PLACED_STATUSES]
        decided = [s for s in placed if s["real_won"] is not None]
        won = [s for s in decided if s["real_won"]]
        realized = sum(s["real_pnl"] for s in placed if s["real_pnl"] is not None)
        cf = [s for s in cs if s["status"] in CF_STATUSES]
        cf_decided = [s for s in cf if s.get("cf_won") is not None]
        cf_won = [s for s in cf_decided if s["cf_won"]]
        cf_realized = sum(s["cf_pnl"] for s in cf if s.get("cf_pnl") is not None)
        by_cat[cat] = {
            "n": count,
            "n_placed": len(placed),
            "n_decided": len(decided),
            "real_n_won": len(won),
            "real_win_rate": (len(won) / len(decided)) if decided else None,
            "real_win_rate_ci": wilson_interval(len(won), len(decided)),
            "avg_confidence": s_mean(s["confidence"] for s in cs),
            "avg_edge": s_mean(s["edge_at_entry"] for s in cs),
            "avg_signed_edge": s_mean(s["forecaster_edge_signed"] for s in cs),
            "avg_hedge": s_mean(s["hedge_score"] for s in cs),
            "real_pnl": realized,
            "n_cf": len(cf),
            "cf_n_decided": len(cf_decided),
            "cf_n_won": len(cf_won),
            "cf_win_rate": (len(cf_won) / len(cf_decided)) if cf_decided else None,
            "cf_pnl": cf_realized,
        }
    return by_cat


def side_breakdown(signals: list[dict]) -> dict:
    """YES vs NO performance -- Polymarket markets are symmetric, asymmetric
    behavior here is a major signal."""
    out: dict[str, dict] = {}
    for side in ("yes", "no"):
        ss = [s for s in signals if (s["side"] or "").lower() == side]
        placed = [s for s in ss if s["status"] in PLACED_STATUSES]
        decided = [s for s in placed if s["real_won"] is not None]
        won = [s for s in decided if s["real_won"]]
        out[side] = {
            "n_total": len(ss),
            "n_placed": len(placed),
            "n_decided": len(decided),
            "real_win_rate": (len(won) / len(decided)) if decided else None,
            "real_win_rate_ci": wilson_interval(len(won), len(decided)),
            "avg_confidence": s_mean(s["confidence"] for s in ss),
            "avg_signed_edge": s_mean(s["forecaster_edge_signed"] for s in ss),
            "real_pnl": sum(s["real_pnl"] for s in placed if s["real_pnl"] is not None),
        }
    return out


def per_model_breakdown(signals: list[dict]) -> dict:
    """Per-LLM performance -- which model is actually paying its bills?"""
    out: dict[str, dict] = {}
    models = sorted({s["model"] or "unknown" for s in signals})
    for m in models:
        ms = [s for s in signals if (s["model"] or "unknown") == m]
        placed = [s for s in ms if s["status"] in PLACED_STATUSES]
        decided = [s for s in placed if s["real_won"] is not None]
        won = [s for s in decided if s["real_won"]]
        if not ms:
            continue
        out[m] = {
            "n_total": len(ms),
            "n_placed": len(placed),
            "n_decided": len(decided),
            "real_win_rate": (len(won) / len(decided)) if decided else None,
            "real_win_rate_ci": wilson_interval(len(won), len(decided)),
            "avg_confidence": s_mean(s["confidence"] for s in ms),
            "avg_signed_edge": s_mean(s["forecaster_edge_signed"] for s in ms),
            "real_pnl": sum(s["real_pnl"] for s in placed if s["real_pnl"] is not None),
        }
    return out


def calibration_analysis(signals: list[dict]) -> dict:
    """Brier score + reliability diagram on forecaster_probability vs real outcome.
    This is the foundation metric -- if the forecaster isn't calibrated, every
    downstream signal is poisoned."""
    # Use REAL outcomes only -- never mix in counterfactuals
    decided = [
        s for s in signals
        if s["forecaster_probability"] is not None and s["real_won"] is not None
    ]
    if not decided:
        return {
            "n": 0,
            "brier": None,
            "brier_baseline_05": 0.25,
            "buckets": [],
        }

    # forecaster_probability is the probability of YES.
    # The bot took side `s["side"]`, and won iff (side==yes AND yes happened) OR (side==no AND no happened).
    # We want to compare forecaster's stated YES probability against the actual YES outcome.
    # Recover actual YES outcome from `real_won` and `side`:
    #   if side=yes and won -> YES happened
    #   if side=yes and lost -> NO happened
    #   if side=no and won -> NO happened
    #   if side=no and lost -> YES happened
    pairs: list[tuple[float, bool]] = []
    for s in decided:
        side = (s["side"] or "").lower()
        if side not in ("yes", "no"):
            continue
        if side == "yes":
            yes_happened = bool(s["real_won"])
        else:
            yes_happened = not bool(s["real_won"])
        pairs.append((s["forecaster_probability"], yes_happened))

    if not pairs:
        return {"n": 0, "brier": None, "brier_baseline_05": 0.25, "buckets": []}

    brier = brier_score(pairs)

    # Bootstrap 95% CI on Brier -- resample (p, outcome) pairs with replacement.
    # Wave 3 C2 patch: recs need this CI to distinguish "n large enough for a
    # calibration claim" from "Brier point estimate in a noisy range".
    brier_ci: Optional[tuple[float, float]] = None
    if len(pairs) >= 20:
        import random as _rand
        rng = _rand.Random(42)  # deterministic for reproducibility
        boots: list[float] = []
        for _ in range(1000):
            sample = [pairs[rng.randrange(len(pairs))] for _ in range(len(pairs))]
            b = sum((p - (1.0 if o else 0.0)) ** 2 for p, o in sample) / len(sample)
            boots.append(b)
        boots.sort()
        brier_ci = (boots[25], boots[974])  # 2.5th / 97.5th percentile

    # Reliability diagram: bucket forecasts into deciles, compute empirical YES freq
    buckets: list[dict] = []
    for lo, hi in [(0.0, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 0.4), (0.4, 0.5),
                   (0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.001)]:
        bucket = [(p, o) for p, o in pairs if lo <= p < hi]
        n = len(bucket)
        if n == 0:
            buckets.append({
                "range": f"[{lo:.1f}, {hi:.1f})",
                "n": 0,
                "predicted_mean": None,
                "actual_yes_rate": None,
                "ci": None,
            })
            continue
        pred_mean = sum(p for p, _ in bucket) / n
        n_yes = sum(1 for _, o in bucket if o)
        actual = n_yes / n
        buckets.append({
            "range": f"[{lo:.1f}, {hi:.1f})",
            "n": n,
            "predicted_mean": pred_mean,
            "actual_yes_rate": actual,
            "ci": wilson_interval(n_yes, n),
        })
    return {
        "n": len(pairs),
        "brier": brier,
        "brier_ci": brier_ci,
        "brier_baseline_05": 0.25,  # always-predict-50% baseline
        "buckets": buckets,
    }


def _quintile_edges(values: list[float]) -> list[float]:
    """Return 6 edges that split `values` into 5 equal-count buckets.

    Used for dynamic hit-rate bucketing when n_placed >= 50 (C2 patch for
    the hardcoded edges that produced n=1-5 buckets at n=43).
    """
    if not values:
        return []
    sv = sorted(values)
    n = len(sv)
    edges = [sv[0]]
    for q in (0.2, 0.4, 0.6, 0.8):
        idx = min(n - 1, int(q * n))
        edges.append(sv[idx])
    edges.append(sv[-1])
    # Deduplicate-while-preserving-order for ties (e.g. lots of 0.60 confidences)
    out: list[float] = []
    for e in edges:
        if not out or e > out[-1]:
            out.append(e)
    return out


def _relabel_buckets(result: dict, labels: list[str]) -> dict:
    """Replace generic range strings in hit_rate_by_bucket output with human labels."""
    buckets = result.get("buckets", [])
    for i, b in enumerate(buckets):
        if i < len(labels):
            b["range"] = labels[i]
    return result


def hit_rate_by_bucket(signals: list[dict], field: str, edges: list[float]) -> dict:
    """Generic: bucket signals by `field` value, compute real + CF win rate per bucket."""
    placed = [s for s in signals if s["status"] in PLACED_STATUSES and s[field] is not None]
    cf_sigs = [s for s in signals if s["status"] in CF_STATUSES and s[field] is not None]
    if not placed and not cf_sigs:
        return {"buckets": [], "field": field}
    buckets: list[dict] = []
    for i in range(len(edges) - 1):
        lo, hi = edges[i], edges[i + 1]
        # use inclusive-low, exclusive-high except for the final bucket
        is_last = i == len(edges) - 2
        if is_last:
            members = [s for s in placed if lo <= s[field] <= hi]
            cf_members = [s for s in cf_sigs if lo <= s[field] <= hi]
        else:
            members = [s for s in placed if lo <= s[field] < hi]
            cf_members = [s for s in cf_sigs if lo <= s[field] < hi]
        decided = [s for s in members if s["real_won"] is not None]
        won = [s for s in decided if s["real_won"]]
        cf_decided = [s for s in cf_members if s.get("cf_won") is not None]
        cf_won = [s for s in cf_decided if s["cf_won"]]
        buckets.append({
            "range": f"[{lo:.2f}, {hi:.2f})" if not is_last else f"[{lo:.2f}, {hi:.2f}]",
            "n_placed": len(members),
            "n_decided": len(decided),
            "n_won": len(won),
            "win_rate": (len(won) / len(decided)) if decided else None,
            "ci": wilson_interval(len(won), len(decided)),
            "real_pnl": sum(s["real_pnl"] for s in members if s["real_pnl"] is not None),
            "n_cf": len(cf_members),
            "cf_n_decided": len(cf_decided),
            "cf_n_won": len(cf_won),
            "cf_win_rate": (len(cf_won) / len(cf_decided)) if cf_decided else None,
            "cf_pnl": sum(s["cf_pnl"] for s in cf_members if s.get("cf_pnl") is not None),
        })
    return {"buckets": buckets, "field": field, "n_placed": len(placed), "n_cf": len(cf_sigs)}


def risk_manager_audit(signals: list[dict]) -> dict:
    """Did the risk manager add value? Compare:
       - placed trades where RM endorsed
       - placed trades where RM said no but bot overrode (risk_manager_overridden)
       - all skipped trades where RM said no (the RM "save" cases)
    """
    placed = [s for s in signals if s["status"] in PLACED_STATUSES]

    rm_endorsed = [s for s in placed if s["risk_manager_endorsed"] is True]
    rm_overridden = [s for s in placed if s["risk_manager_overridden"]]
    rm_unknown = [s for s in placed if s["risk_manager_endorsed"] is None]

    def stats_for(group: list[dict]) -> dict:
        decided = [s for s in group if s["real_won"] is not None]
        won = [s for s in decided if s["real_won"]]
        return {
            "n": len(group),
            "n_decided": len(decided),
            "n_won": len(won),
            "win_rate": (len(won) / len(decided)) if decided else None,
            "ci": wilson_interval(len(won), len(decided)),
            "real_pnl": sum(s["real_pnl"] for s in group if s["real_pnl"] is not None),
        }

    # RM "saves" -- skipped/rejected trades where RM said no, looking at counterfactual outcome
    rm_blocked = [
        s for s in signals
        if s["status"] in CF_STATUSES
        and s["risk_manager_endorsed"] is False
        and s["cf_won"] is not None
    ]
    blocked_decided = rm_blocked
    blocked_correct = [s for s in blocked_decided if not s["cf_won"]]  # would have lost = correct save

    return {
        "rm_endorsed_placed": stats_for(rm_endorsed),
        "rm_overridden_placed": stats_for(rm_overridden),
        "rm_unknown_placed": stats_for(rm_unknown),
        "rm_save_correct_rate": (
            len(blocked_correct) / len(blocked_decided) if blocked_decided else None
        ),
        "rm_save_n": len(blocked_decided),
        "rm_save_n_correct": len(blocked_correct),
        "rm_save_cf_pnl_avoided": sum(
            -s["cf_pnl"] for s in blocked_correct if s["cf_pnl"] is not None
        ),
    }


def skip_reason_breakdown(signals: list[dict]) -> dict:
    out: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    skipped = [s for s in signals if s["status"] in CF_STATUSES]
    for s in skipped:
        bot = s["bot_type_id"] or "unknown"
        reason = s["skip_reason"] or "no_marker"
        out[bot][reason] += 1
    return {bot: dict(sorted(d.items(), key=lambda kv: -kv[1])) for bot, d in out.items()}


def counterfactual_analysis(signals: list[dict]) -> dict:
    out: dict[str, dict] = {}
    bots = sorted({s["bot_type_id"] or "unknown" for s in signals})
    for bot in bots:
        skipped = [
            s for s in signals
            if (s["bot_type_id"] or "unknown") == bot
            and s["status"] in CF_STATUSES
            and s["cf_settled"]
            and s["cf_pnl"] is not None
        ]
        if not skipped:
            continue
        would_won = [s for s in skipped if s["cf_pnl"] > 0]
        cf_total = sum(s["cf_pnl"] for s in skipped)
        out[bot] = {
            "n_with_counterfactual": len(skipped),
            "n_would_have_won": len(would_won),
            "would_win_rate": len(would_won) / len(skipped),
            "would_win_rate_ci": wilson_interval(len(would_won), len(skipped)),
            "cf_pnl_total": cf_total,
            "cf_pnl_mean": cf_total / len(skipped),
        }
    return out


def _ols_slope(xs: list[float], ys: list[float]) -> Optional[float]:
    """Ordinary-least-squares slope; returns None on degenerate input."""
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 2:
        return None
    xs_ = [p[0] for p in pairs]
    ys_ = [p[1] for p in pairs]
    mx = statistics.mean(xs_)
    my = statistics.mean(ys_)
    num = sum((x - mx) * (y - my) for x, y in pairs)
    den = sum((x - mx) ** 2 for x in xs_)
    if den == 0:
        return None
    return num / den


def rolling_window_perf(
    signals: list[dict],
    window_days: int = 7,
    step_days: int = 1,
) -> dict:
    """Rolling 7-day performance on placed, settled trades.

    Designed by Wave 3 C1 to answer: does the 94% signed-edge alpha bucket
    survive holdout, or is it sample-path luck from a single week?

    Uses existing signal fields only -- no new extraction needed.
    """
    placed = [
        s for s in signals
        if s.get("status") in PLACED_STATUSES
        and s.get("real_won") is not None
        and s.get("timestamp")
    ]
    placed_dt = []
    for s in placed:
        dt = parse_datetime(s.get("timestamp"))
        if dt is not None:
            placed_dt.append((dt, s))
    placed_dt.sort(key=lambda p: p[0])
    if not placed_dt:
        return {"windows": [], "window_days": window_days, "step_days": step_days, "n_placed": 0}

    first = placed_dt[0][0]
    last = placed_dt[-1][0]
    # Normalize both to aware or both to naive (avoid comparison errors)
    if first.tzinfo is None and last.tzinfo is not None:
        last = last.replace(tzinfo=None)
    elif first.tzinfo is not None and last.tzinfo is None:
        first = first.replace(tzinfo=None)

    windows: list[dict] = []
    cur = first
    w = timedelta(days=window_days)
    step = timedelta(days=step_days)
    while cur <= last:
        end = cur + w
        in_w = [s for (dt, s) in placed_dt if cur <= dt < end]
        if not in_w:
            cur += step
            continue
        wins = [s for s in in_w if s.get("real_won")]
        pnls = [s.get("real_pnl") or 0 for s in in_w]
        edges = [s.get("forecaster_edge_signed") for s in in_w
                 if s.get("forecaster_edge_signed") is not None]
        alpha_bucket = [s for s in in_w
                        if (s.get("forecaster_edge_signed") or 0) <= -0.20]
        windows.append({
            "start": cur.isoformat(),
            "end": end.isoformat(),
            "n": len(in_w),
            "n_won": len(wins),
            "win_rate": len(wins) / len(in_w),
            "win_rate_ci": wilson_interval(len(wins), len(in_w)),
            "real_pnl": sum(pnls),
            "avg_signed_edge": s_mean(edges) if edges else None,
            "alpha_bucket_n": len(alpha_bucket),
            "alpha_bucket_share": len(alpha_bucket) / len(in_w) if in_w else None,
        })
        cur += step

    # Edge-decay slope (Day 5 addition): ordinary least-squares slope of
    # win_rate versus window index. Negative slope = later windows do worse =
    # edge is decaying. Only meaningful with >=3 windows; below that, emit None.
    win_rate_slope: Optional[float] = None
    avg_signed_edge_slope: Optional[float] = None
    if len(windows) >= 3:
        xs = list(range(len(windows)))
        wr_ys = [w["win_rate"] for w in windows]
        win_rate_slope = _ols_slope(xs, wr_ys)
        se_ys = [w.get("avg_signed_edge") for w in windows if w.get("avg_signed_edge") is not None]
        if len(se_ys) >= 3:
            avg_signed_edge_slope = _ols_slope(
                list(range(len(se_ys))), se_ys
            )

    return {
        "windows": windows,
        "window_days": window_days,
        "step_days": step_days,
        "n_placed": len(placed_dt),
        "win_rate_slope": win_rate_slope,
        "avg_signed_edge_slope": avg_signed_edge_slope,
    }


def weekly_per_bot_breakdown(signals: list[dict]) -> dict:
    """Group trades by ISO year-week and by bot_type_id so the report can show
    a per-bot week-over-week trend: real win% (with CI), PnL, counterfactual
    win%, n placed, n skipped.

    Returns: {
        "weeks": [iso_week_str, ...],          # sorted asc
        "bots":  [bot_type_id, ...],           # sorted
        "rows":  {bot: {iso_week: {n_placed, n_decided, n_won, real_pnl,
                                   cf_n_decided, cf_n_won, n_skipped}}}
    }
    """
    weeks_set: set[str] = set()
    bots_set: set[str] = set()
    rows: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {
        "n_trades": 0,
        "n_placed": 0,
        "n_decided": 0,
        "n_won": 0,
        "real_pnl": 0.0,
        "n_skipped": 0,
        "cf_n_decided": 0,
        "cf_n_won": 0,
        "cf_pnl": 0.0,
    }))
    for s in signals:
        ts = s.get("timestamp")
        if not ts:
            continue
        dt = parse_datetime(ts)
        if dt is None:
            continue
        iso = dt.isocalendar()  # (year, week, weekday)
        iso_week = f"{iso[0]}-W{iso[1]:02d}"
        bot = s.get("bot_type_id") or "unknown"
        weeks_set.add(iso_week)
        bots_set.add(bot)
        cell = rows[bot][iso_week]
        cell["n_trades"] += 1

        status = s.get("status")
        if status in PLACED_STATUSES:
            cell["n_placed"] += 1
            if s.get("real_pnl") is not None:
                cell["real_pnl"] += float(s["real_pnl"])
            if s.get("real_won") is not None:
                cell["n_decided"] += 1
                if s["real_won"]:
                    cell["n_won"] += 1
        else:
            cell["n_skipped"] += 1

        # Counterfactual applies to skipped/rejected/error/paper trades.
        if s.get("cf_won") is not None and status in CF_STATUSES:
            cell["cf_n_decided"] += 1
            if s["cf_won"]:
                cell["cf_n_won"] += 1
            if s.get("cf_pnl") is not None:
                cell["cf_pnl"] += float(s["cf_pnl"])

    return {
        "weeks": sorted(weeks_set),
        "bots": sorted(bots_set),
        "rows": {bot: dict(rows[bot]) for bot in rows},
    }


def config_cohort_breakdown(signals: list[dict]) -> dict:
    """Group placed trades by the config hash active at their trade time.

    Uses the new `cfg_at_trade` JSONB column from `deployment_snapshots`. A cohort
    is defined by a hash of the subset of config keys that influence placement:
    edge threshold, min confidence, risk threshold, max position pct. Per cohort,
    report n, win%, real PnL, earliest deploy time. Also computes `stale_trade_share`
    = fraction of trades that ran under a non-latest cohort.
    """
    KEY_FIELDS = (
        "edge_threshold", "min_confidence",
        "risk_threshold", "max_position_pct",
    )
    buckets: dict[str, list[dict]] = defaultdict(list)
    for s in signals:
        cfg = s.get("cfg_at_trade") or {}
        if not isinstance(cfg, dict):
            continue
        keyed = {k: cfg.get(k) for k in KEY_FIELDS}
        hashable = json.dumps(keyed, sort_keys=True, default=str)
        h = hashlib.md5(hashable.encode()).hexdigest()[:8]
        buckets[h].append(s)

    out: dict[str, dict] = {}
    for h, rows in buckets.items():
        placed = [
            r for r in rows
            if r.get("status") in PLACED_STATUSES and r.get("real_won") is not None
        ]
        wins = [r for r in placed if r.get("real_won")]
        deploy_ts = [r.get("cfg_deployed_at") for r in rows if r.get("cfg_deployed_at")]
        cfg_sample = rows[0].get("cfg_at_trade") if rows else None
        keyed_sample = {
            k: (cfg_sample or {}).get(k) if isinstance(cfg_sample, dict) else None
            for k in KEY_FIELDS
        }
        out[h] = {
            "hash": h,
            "n_rows_total": len(rows),
            "n_placed_settled": len(placed),
            "n_won": len(wins),
            "win_rate": (len(wins) / len(placed)) if placed else None,
            "win_rate_ci": wilson_interval(len(wins), len(placed)) if placed else None,
            "real_pnl": sum((r.get("real_pnl") or 0) for r in placed),
            "deployed_at": min(deploy_ts) if deploy_ts else None,
            "key_fields": keyed_sample,
        }

    latest_hash: Optional[str] = None
    if out:
        dated = [(h, c["deployed_at"]) for h, c in out.items() if c["deployed_at"]]
        if dated:
            latest_hash = max(dated, key=lambda kv: kv[1])[0]

    total_rows = sum(c["n_rows_total"] for c in out.values())
    stale_rows = sum(
        c["n_rows_total"] for h, c in out.items() if latest_hash and h != latest_hash
    )
    return {
        "cohorts": out,
        "latest_hash": latest_hash,
        "n_cohorts": len(out),
        "stale_trade_share": (stale_rows / total_rows) if total_rows else None,
    }


def forecaster_vs_rm_brier(signals: list[dict]) -> dict:
    """Head-to-head Brier of forecaster_probability vs RM true_probability.

    Designed by Wave 3 C1 to answer: is the RM layer better-calibrated than
    the forecaster, or is it a distractor consuming Opus/Grok inference cost
    without adding PnL-relevant information?

    Both probabilities are compared against the SAME realized YES outcome
    (i.e. real_won for YES-side trades, NOT real_won for NO-side).
    """
    pairs: list[tuple[float, float, bool]] = []
    for s in signals:
        fp = s.get("forecaster_probability")
        tp = s.get("true_probability")
        rw = s.get("real_won")
        side = (s.get("side") or "").lower()
        if fp is None or tp is None or rw is None or side not in ("yes", "no"):
            continue
        yes_outcome = bool(rw) if side == "yes" else (not bool(rw))
        pairs.append((float(fp), float(tp), yes_outcome))
    n = len(pairs)
    if n == 0:
        return {
            "n": 0,
            "brier_forecaster": None,
            "brier_rm": None,
            "delta": None,
            "verdict": "-- (no paired forecaster/RM probabilities)",
        }
    bf = sum((pf - (1.0 if y else 0.0)) ** 2 for pf, _, y in pairs) / n
    br = sum((pr - (1.0 if y else 0.0)) ** 2 for _, pr, y in pairs) / n
    delta = bf - br
    if n < 50:
        verdict = f"DIRECTIONAL ONLY (n={n}, need >=50)"
    elif abs(delta) < 0.01:
        verdict = f"Indistinguishable (|delta|={abs(delta):.3f} on n={n}) -- RM layer adds no calibration signal."
    elif delta > 0:
        verdict = f"RM better-calibrated by delta={delta:+.3f} on n={n}."
    else:
        verdict = f"Forecaster better-calibrated by delta={-delta:+.3f} on n={n} -- RM layer is a distractor."
    return {
        "n": n,
        "brier_forecaster": bf,
        "brier_rm": br,
        "delta": delta,
        "verdict": verdict,
    }


def debate_bracket_analysis(signals: list[dict]) -> dict:
    """Does `debate_bracket_width` (ceiling - floor) predict outcome or size of surprise?

    Partitions placed+settled trades (any with real_won populated) into 4 width
    buckets and computes per-bucket win rate, total real PnL, and PnL stdev. Also
    reports the Pearson correlation between bracket width and |real_pnl| -- a
    positive r would mean "wider brackets correlate with bigger surprises",
    supporting using bracket width as a risk signal.

    Depends on `debate_bracket_width` populated by `_parse_debate_json()` (Day 2).
    """
    qual = [
        s for s in signals
        if s.get("debate_bracket_width") is not None
        and s.get("real_won") is not None
    ]
    bucket_bounds = [(0.0, 0.10), (0.10, 0.20), (0.20, 0.35), (0.35, 1.01)]
    buckets: list[dict] = []
    for lo, hi in bucket_bounds:
        members = [s for s in qual if lo <= s["debate_bracket_width"] < hi]
        wins = [s for s in members if s["real_won"]]
        pnls = [s.get("real_pnl") for s in members if s.get("real_pnl") is not None]
        buckets.append({
            "range": f"[{lo:.2f},{hi:.2f})",
            "n": len(members),
            "n_won": len(wins),
            "win_rate_gated": gated_rate(len(wins), len(members)),
            "real_pnl": sum(pnls),
            "pnl_stdev": s_stdev(pnls),
        })
    corr = pearson(
        [s["debate_bracket_width"] for s in qual],
        [abs(s.get("real_pnl") or 0) for s in qual],
    )
    return {
        "n": len(qual),
        "buckets": buckets,
        "corr_width_abs_pnl": corr,
    }


def ev_calibration(signals: list[dict]) -> dict:
    """Does the RM's `ev_estimate` predict realized $/share?

    Pearson correlation between predicted per-share EV (`ev_estimate`) and
    realized per-share return (`real_pnl / count`). Also splits into 5 quintiles
    by predicted EV, reporting mean predicted vs mean realized in each quintile.
    Verdict is gated on n >= 50; below that, marked DIRECTIONAL ONLY.

    Depends on `ev_estimate` populated by `_parse_debate_json()` (Day 2).
    """
    qual = [
        s for s in signals
        if s.get("ev_estimate") is not None
        and s.get("real_pnl") is not None
        and (s.get("count") or 0) > 0
    ]
    if not qual:
        return {
            "n": 0,
            "pearson_ev_realized": None,
            "quintile_table": [],
            "ev_overpredicts_by": None,
            "verdict": "-- (no rows with both ev_estimate and real_pnl)",
        }
    ev_pred = [float(s["ev_estimate"]) for s in qual]
    realized = [float(s["real_pnl"]) / float(s["count"]) for s in qual]
    r = pearson(ev_pred, realized)

    # 5-quintile breakdown, sorted by predicted EV asc
    sp = sorted(zip(ev_pred, realized), key=lambda t: t[0])
    n = len(sp)
    q = max(1, n // 5)
    quintile_table: list[dict] = []
    for i in range(5):
        start = i * q
        end = (i + 1) * q if i < 4 else n
        chunk = sp[start:end]
        if not chunk:
            quintile_table.append({
                "quintile": i + 1, "n": 0,
                "mean_predicted_ev": None, "mean_realized": None,
            })
            continue
        quintile_table.append({
            "quintile": i + 1,
            "n": len(chunk),
            "mean_predicted_ev": s_mean(x[0] for x in chunk),
            "mean_realized": s_mean(x[1] for x in chunk),
        })
    bias = s_mean(p - rlz for p, rlz in zip(ev_pred, realized))

    if n < 50:
        verdict = f"DIRECTIONAL ONLY (n={n}, need >=50)"
    elif r is None:
        verdict = f"Pearson undefined (zero variance) on n={n}."
    elif abs(r) < 0.15:
        verdict = (
            f"RM ev_estimate r={r:+.2f} on n={n} -- uncorrelated with realized $/share. "
            "RM sizing signal is noise."
        )
    elif r < 0:
        verdict = (
            f"RM ev_estimate r={r:+.2f} on n={n} -- negatively correlated with realized. "
            "RM is anti-predictive."
        )
    else:
        verdict = (
            f"RM ev_estimate r={r:+.2f} on n={n} -- positively correlated with realized "
            f"(bias {bias:+.3f}/share; + = RM overpredicts)."
        )
    return {
        "n": n,
        "pearson_ev_realized": r,
        "quintile_table": quintile_table,
        "ev_overpredicts_by": bias,
        "verdict": verdict,
    }


def per_agent_performance(signals: list[dict]) -> dict:
    """Per-agent performance rollup, grouped by bot.

    Each signal's `per_agent` list (built by `_extract_per_agent`) is iterated
    once per agent invocation. For each (bot, role) pair we aggregate:
    - n_total / n_placed / n_decided / n_won / real_pnl
    - distinct model count + top model seen
    - Brier score on agents that emit a P(YES) -- aligned with trade side
    - per-model Brier sub-dict. Each role's entry includes
      `per_model_brier: {model_name: {n, brier}}` so you can tell whether a
      role's aggregate Brier is driven by one model or a mix.

    Returns: {bot_id: {role: {n_total, n_placed, n_decided, n_won, real_pnl,
                              win_rate, top_model, n_distinct_models, brier,
                              n_brier, per_model_brier}}}. Bots with no debate
    JSON (e.g. tail-buyer) are simply absent from the dict.
    """
    out: dict[str, dict[str, dict]] = {}
    for s in signals:
        bot = s.get("bot_type_id") or "unknown"
        agents = s.get("per_agent") or []
        if not agents:
            continue
        placed = s.get("status") in PLACED_STATUSES
        real_won = s.get("real_won")
        real_pnl = s.get("real_pnl")
        side = s.get("side")
        for agent in agents:
            role = agent.get("role")
            if not role:
                continue
            bot_bucket = out.setdefault(bot, {})
            entry = bot_bucket.setdefault(role, {
                "n_total": 0,
                "n_placed": 0,
                "n_decided": 0,
                "n_won": 0,
                "real_pnl": 0.0,
                "_models": Counter(),
                "_forecasts": [],  # (p_win, real_won_bool) pairs for Brier
                "_per_model_forecasts": defaultdict(list),  # model -> forecasts
            })
            entry["n_total"] += 1
            model = agent.get("model")
            if model:
                entry["_models"][model] += 1
            if placed:
                entry["n_placed"] += 1
                if real_won is not None:
                    entry["n_decided"] += 1
                    if real_won:
                        entry["n_won"] += 1
                    if real_pnl is not None:
                        entry["real_pnl"] += real_pnl
            # Per-agent Brier: convert agent P(YES) -> P(trade won) via side.
            p_yes = agent.get("probability")
            if (p_yes is not None and real_won is not None
                    and side in ("yes", "no")):
                p_win = p_yes if side == "yes" else 1.0 - p_yes
                entry["_forecasts"].append((p_win, bool(real_won)))
                if model:
                    entry["_per_model_forecasts"][model].append(
                        (p_win, bool(real_won))
                    )

    for bot, roles in out.items():
        for role, e in roles.items():
            e["real_pnl"] = round(e["real_pnl"], 2)
            e["win_rate"] = (
                e["n_won"] / e["n_decided"] if e["n_decided"] else None
            )
            models: Counter = e.pop("_models")  # type: ignore[assignment]
            if models:
                e["top_model"], _ = models.most_common(1)[0]
                e["n_distinct_models"] = len(models)
            else:
                e["top_model"] = None
                e["n_distinct_models"] = 0
            forecasts = e.pop("_forecasts")
            e["n_brier"] = len(forecasts)
            e["brier"] = brier_score(forecasts) if len(forecasts) >= 5 else None
            # per-model Brier breakdown. Same 5-forecast gate as
            # the aggregate Brier so the two fields are comparable.
            per_model_forecasts = e.pop("_per_model_forecasts")
            per_model_brier: dict[str, dict] = {}
            for model_name, mf in per_model_forecasts.items():
                per_model_brier[model_name] = {
                    "n": len(mf),
                    "brier": brier_score(mf) if len(mf) >= 5 else None,
                }
            e["per_model_brier"] = per_model_brier
    return out


def agent_cross_bot_calibration(per_agent_stats: dict) -> list[dict]:
    """Cross-bot agent calibration.

    Flattens the per_agent_performance output into a one-row-per-(role, bot_id)
    list sorted by `(role asc, brier asc)`. Lets the reader answer questions
    like "is V2's forecaster better calibrated than SF's superforecaster?" in
    one glance, without drilling into each bot's Part B section.

    Input: the already-computed `per_agent_performance(signals)` dict. Pure
    transformation -- takes the aggregator output as input to avoid walking
    `signals` twice. Rows without a Brier score are filtered out since the
    whole point of this table is head-to-head Brier comparison.

    Output: list of rows, each with:
      - role, bot_id
      - n (Brier sample size, == n_brier on the source entry)
      - brier (point estimate)
      - n_decided, n_won, win_rate, win_rate_ci (Wilson on decided/won)
    """
    rows: list[dict] = []
    for bot_id, roles in (per_agent_stats or {}).items():
        for role, e in roles.items():
            if e.get("brier") is None:
                continue
            n_decided = e.get("n_decided") or 0
            n_won = e.get("n_won") or 0
            rows.append({
                "role": role,
                "bot_id": bot_id,
                "n": e.get("n_brier") or 0,
                "brier": e["brier"],
                "n_decided": n_decided,
                "n_won": n_won,
                "win_rate": e.get("win_rate"),
                "win_rate_ci": wilson_interval(n_won, n_decided),
            })
    rows.sort(key=lambda r: (r["role"], r["brier"]))
    return rows


def cf_deep_dive(signals: list[dict]) -> dict:
    """Counterfactual deep-dive across all skipped/rejected trades.

    Extends per-bot cf totals with five subsections designed to answer
    *which filters are most often wrong* and *where profitable trades are
    leaking through the skip gate*:

    1. skip_attribution -- group by `skip_reason`: n, cf_win_rate, cf_pnl_sum.
       Identifies which filter is responsible for the most missed money.
    2. cf_by_category -- cf_pnl and cf_win_rate per market category, sorted by
       most-negative cf_pnl first (i.e. categories where skipping costs the
       most). n<3 categories are dropped.
    3. cf_by_side -- YES vs NO cf performance on skipped rows. Reveals
       asymmetric skip bias.
    4. top_near_misses -- top 20 skipped trades by positive cf_pnl, sorted
       desc. Each row includes skip_reason + conf/edge for triage.
    5. cf_heatmap -- conf x signed-edge quintile grid for skipped rows with
       cf_won populated. Only emitted on n >= 25 (same gate as conf_edge_inversion).
    """
    skipped = [s for s in signals if s.get("status") in CF_STATUSES]

    def _blank_cf() -> dict:
        return {"n": 0, "cf_pnl_sum": 0.0, "cf_n_won": 0, "cf_n_decided": 0}

    # 1. Skip attribution
    skip_attr: dict[str, dict] = defaultdict(_blank_cf)
    for s in skipped:
        e = skip_attr[s.get("skip_reason") or "unknown"]
        e["n"] += 1
        if s.get("cf_pnl") is not None:
            e["cf_pnl_sum"] += s["cf_pnl"]
        if s.get("cf_won") is not None:
            e["cf_n_decided"] += 1
            if s["cf_won"]:
                e["cf_n_won"] += 1
    skip_attr_list = []
    for reason, e in sorted(skip_attr.items(), key=lambda kv: -kv[1]["n"]):
        skip_attr_list.append({
            "reason": reason,
            "n": e["n"],
            "cf_pnl_sum": round(e["cf_pnl_sum"], 2),
            "cf_n_won": e["cf_n_won"],
            "cf_n_decided": e["cf_n_decided"],
        })

    # 2. CF by category
    cf_by_cat: dict[str, dict] = defaultdict(_blank_cf)
    for s in skipped:
        e = cf_by_cat[s.get("category") or "(uncategorized)"]
        e["n"] += 1
        if s.get("cf_pnl") is not None:
            e["cf_pnl_sum"] += s["cf_pnl"]
        if s.get("cf_won") is not None:
            e["cf_n_decided"] += 1
            if s["cf_won"]:
                e["cf_n_won"] += 1
    cf_by_cat_list = []
    for cat, e in sorted(cf_by_cat.items(), key=lambda kv: kv[1]["cf_pnl_sum"]):
        if e["n"] < 3:
            continue
        cf_by_cat_list.append({
            "category": cat,
            "n": e["n"],
            "cf_pnl_sum": round(e["cf_pnl_sum"], 2),
            "cf_n_won": e["cf_n_won"],
            "cf_n_decided": e["cf_n_decided"],
        })

    # 3. CF by side
    cf_by_side: dict[str, dict] = defaultdict(_blank_cf)
    for s in skipped:
        e = cf_by_side[(s.get("side") or "?").lower()]
        e["n"] += 1
        if s.get("cf_pnl") is not None:
            e["cf_pnl_sum"] += s["cf_pnl"]
        if s.get("cf_won") is not None:
            e["cf_n_decided"] += 1
            if s["cf_won"]:
                e["cf_n_won"] += 1
    cf_by_side_out = {
        k: {**v, "cf_pnl_sum": round(v["cf_pnl_sum"], 2)}
        for k, v in cf_by_side.items()
    }

    # 4. Top 20 closest-miss skipped winners. Rows carry `category` so the
    # clustered view (4b) below can group by (category, side) without walking
    # the signal list again.
    near_misses = []
    for s in skipped:
        if s.get("cf_won") and s.get("cf_pnl") is not None and s["cf_pnl"] > 0:
            near_misses.append({
                "trade_id": s.get("trade_id"),
                "bot": s.get("bot_type_id"),
                "market": s.get("market_title"),
                "category": s.get("category"),
                "side": s.get("side"),
                "confidence": s.get("confidence"),
                "signed_edge": s.get("forecaster_edge_signed"),
                "skip_reason": s.get("skip_reason"),
                "cf_pnl": round(s["cf_pnl"], 2),
            })
    near_misses.sort(key=lambda t: -t["cf_pnl"])
    top_near_misses = near_misses[:20]

    # 4b. Near-miss clusters by (category, side) -- the flat top-20 list in (4)
    # buries the pattern. Clustering by (category, side) lets the reader see
    # "5 Sports/YES near-misses totalling $X" up front instead of scanning 20
    # rows and mentally aggregating. Uses the full near-miss set, not just the
    # top-20, so the totals are exact.
    cluster_acc: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"n": 0, "cf_pnl_sum": 0.0}
    )
    for nm in near_misses:
        cat = nm.get("category") or "(uncategorized)"
        side = (nm.get("side") or "?").lower()
        cell = cluster_acc[(cat, side)]
        cell["n"] += 1
        cell["cf_pnl_sum"] += nm["cf_pnl"]
    near_miss_clusters = [
        {
            "category": cat,
            "side": side,
            "n": cell["n"],
            "cf_pnl_sum": round(cell["cf_pnl_sum"], 2),
        }
        for (cat, side), cell in sorted(
            cluster_acc.items(), key=lambda kv: -kv[1]["cf_pnl_sum"]
        )
    ]

    # 5. CF conf x signed-edge quintile heatmap on skipped rows with cf_won
    heatmap_qual = [
        s for s in skipped
        if s.get("confidence") is not None
        and s.get("forecaster_edge_signed") is not None
        and s.get("cf_won") is not None
    ]
    cf_heatmap: list[dict] = []
    if len(heatmap_qual) >= 25:
        c_edges = _quintile_edges([s["confidence"] for s in heatmap_qual])
        e_edges = _quintile_edges([s["forecaster_edge_signed"] for s in heatmap_qual])
        grid: dict[tuple[int, int], dict] = {}
        for s in heatmap_qual:
            c = s["confidence"]
            e = s["forecaster_edge_signed"]
            cq = min(sum(1 for b in c_edges[1:-1] if c >= b), 4)
            eq = min(sum(1 for b in e_edges[1:-1] if e >= b), 4)
            cell = grid.setdefault((cq, eq), {"n": 0, "n_won": 0, "cf_pnl": 0.0})
            cell["n"] += 1
            if s["cf_won"]:
                cell["n_won"] += 1
            if s.get("cf_pnl") is not None:
                cell["cf_pnl"] += s["cf_pnl"]
        for (cq, eq), cell in sorted(grid.items()):
            cf_heatmap.append({
                "conf_quintile": cq,
                "edge_quintile": eq,
                "n": cell["n"],
                "n_won": cell["n_won"],
                "cf_win_rate": cell["n_won"] / cell["n"] if cell["n"] else None,
                "cf_pnl": round(cell["cf_pnl"], 2),
            })

    return {
        "n_total_skipped": len(skipped),
        "skip_attribution": skip_attr_list,
        "cf_by_category": cf_by_cat_list,
        "cf_by_side": cf_by_side_out,
        "top_near_misses": top_near_misses,
        "near_miss_clusters": near_miss_clusters,
        "cf_heatmap": cf_heatmap,
    }


def rules_pnl_correlation(signals: list[dict]) -> dict:
    """Rules -> realized PnL correlation.

    For each numeric key found in `rules_at_trade` (pulled via the
    `deployment_snapshots` LATERAL join), compute over placed+settled rows:
    - Pearson r between the rule value and `real_pnl`
    - bucketed PnL per distinct rule value (mean, sum, win rate)

    Thresholds: >=10 pairs and >=2 distinct values required (else silently
    dropped -- no variance -> nothing to say). Booleans are filtered out (they
    become True/False buckets which `pearson` handles awkwardly).
    """
    all_keys: set[str] = set()
    for s in signals:
        rules = s.get("rules_at_trade")
        if isinstance(rules, dict):
            for k, v in rules.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    all_keys.add(k)

    result: dict = {}
    for key in sorted(all_keys):
        pairs: list[tuple[float, float]] = []
        for s in signals:
            rules = s.get("rules_at_trade")
            if not isinstance(rules, dict):
                continue
            v = rules.get(key)
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                continue
            if s.get("status") not in PLACED_STATUSES:
                continue
            pnl = s.get("real_pnl")
            if pnl is None:
                continue
            pairs.append((float(v), float(pnl)))
        if len(pairs) < 10:
            continue
        distinct = {p[0] for p in pairs}
        if len(distinct) < 2:
            continue
        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]
        r = pearson(xs, ys)
        by_value: dict[float, dict] = defaultdict(lambda: {
            "n": 0, "pnl_sum": 0.0, "n_won": 0,
        })
        for v, pnl in pairs:
            e = by_value[v]
            e["n"] += 1
            e["pnl_sum"] += pnl
            if pnl > 0:
                e["n_won"] += 1
        buckets = [
            {
                "value": v,
                "n": e["n"],
                "pnl_sum": round(e["pnl_sum"], 2),
                "pnl_mean": round(e["pnl_sum"] / e["n"], 2) if e["n"] else None,
                "n_won": e["n_won"],
            }
            for v, e in sorted(by_value.items())
        ]
        result[key] = {
            "n": len(pairs),
            "n_distinct_values": len(distinct),
            "pearson_r": r,
            "buckets": buckets,
        }
    return result


def recommendations(stats: dict) -> list[dict]:
    """Deterministic, rule-based recommendations triggered by aggregate thresholds.
    Updated to use signed edge, RM audit, calibration."""
    recs: list[dict] = []

    # Calibration check (Omega's #1 metric) -- C2 patch: require bootstrap CI lower > 0.25
    # to prevent firing on point estimates that a noisy n=43 could easily produce by chance.
    cal = stats.get("calibration", {})
    if cal.get("n", 0) >= 50:
        brier = cal.get("brier")
        brier_ci = cal.get("brier_ci")
        if (brier is not None
                and brier_ci is not None
                and brier_ci[0] > 0.25):
            recs.append({
                "severity": "critical",
                "rule": "miscalibrated_forecaster",
                "message": (
                    f"Brier score = {brier:.3f} "
                    f"[95% CI {brier_ci[0]:.3f}-{brier_ci[1]:.3f}] on n={cal['n']} settled forecasts. "
                    f"Always-50% baseline is 0.25, and the CI excludes it -- the forecaster is "
                    f"provably worse than random. Every downstream signal is unreliable."
                ),
            })

    # Conf-edge inversion at placement -- C2 patch: require n >= 30 placed trades,
    # else a point-estimate mean_gap on tiny samples reads as strong evidence.
    cei = stats.get("conf_edge_inversion", {}).get("by_bucket", {})
    placed = cei.get("placed", {})
    if (placed
            and placed.get("n", 0) >= MIN_N_VERDICT
            and (placed.get("mean_gap") or 0) > 0.3):
        recs.append({
            "severity": "high",
            "rule": "conf_edge_inversion_at_placement",
            "message": (
                f"Placed trades (n={placed['n']}) show a confidence-edge gap of "
                f"{placed['mean_gap']:.2f} (mean). Placement is being driven by "
                f"conviction not edge. Consider blocking trades with confidence > 0.70 AND edge < 0.15."
            ),
        })

    # Signed-edge sign inversion -- fires when the Pearson between
    # `forecaster_edge_signed` and `real_won` is strongly NEGATIVE on a sample
    # large enough to rule out chance.
    corr = stats.get("correlations", {}) or {}
    won_corrs = corr.get("won_correlations", {}) or {}
    signed_r = won_corrs.get("forecaster_edge_signed")
    signed_n = corr.get("n_won_rows") or 0
    if signed_r is not None and signed_n >= MIN_N_VERDICT and signed_r <= -0.30:
        recs.append({
            "severity": "critical",
            "rule": "signed_edge_sign_inversion",
            "message": (
                f"forecaster_edge_signed r={signed_r:+.2f} on n={signed_n} -- signed "
                f"edge is ANTI-predictive. Do not trust sign until retrained."
            ),
        })

    # Risk manager audit -- is the RM doing anything?
    # C2 patch: raise n threshold to 30 (was 10) AND require non-overlapping Wilson CIs
    rm = stats.get("risk_manager_audit", {})
    overridden = rm.get("rm_overridden_placed", {})
    endorsed = rm.get("rm_endorsed_placed", {})
    if (overridden.get("n_decided", 0) >= MIN_N_VERDICT
            and endorsed.get("n_decided", 0) >= MIN_N_VERDICT):
        ovr_wr = overridden.get("win_rate") or 0
        end_wr = endorsed.get("win_rate") or 0
        ovr_ci = wilson_interval(
            round(ovr_wr * overridden["n_decided"]), overridden["n_decided"]
        )
        end_ci = wilson_interval(
            round(end_wr * endorsed["n_decided"]), endorsed["n_decided"]
        )
        if ovr_ci and end_ci and ovr_ci[0] > end_ci[1]:
            recs.append({
                "severity": "high",
                "rule": "rm_overrides_outperform_endorsements",
                "message": (
                    f"RM-overridden trades win {ovr_wr:.0%} "
                    f"[{ovr_ci[0]:.0%}-{ovr_ci[1]:.0%}] (n={overridden['n_decided']}) "
                    f"vs RM-endorsed {end_wr:.0%} [{end_ci[0]:.0%}-{end_ci[1]:.0%}] "
                    f"(n={endorsed['n_decided']}). CIs do not overlap -- the risk manager is "
                    f"wrong more often than it's right; consider disabling it."
                ),
            })
        elif ovr_ci and end_ci and end_ci[0] > ovr_ci[1]:
            recs.append({
                "severity": "moderate",
                "rule": "rm_overrides_underperform",
                "message": (
                    f"RM overrides {ovr_wr:.0%} [{ovr_ci[0]:.0%}-{ovr_ci[1]:.0%}] "
                    f"vs endorsements {end_wr:.0%} [{end_ci[0]:.0%}-{end_ci[1]:.0%}]. "
                    f"CIs do not overlap -- stop overriding the risk manager."
                ),
            })

    # Per-bot underperformance with CI awareness
    per_bot = stats.get("per_bot", {})
    for bot, b in per_bot.items():
        n = b.get("n_real_settled") or 0
        ci = b.get("real_win_rate_ci")
        if n >= 30 and ci and ci[1] < 0.50:  # upper 95% CI bound below 50%
            recs.append({
                "severity": "high",
                "rule": "bot_significantly_underperforms",
                "message": (
                    f"{bot}: real win rate {b['real_win_rate']:.0%} on n={n}, "
                    f"95% CI [{ci[0]:.0%}-{ci[1]:.0%}] -- upper bound below 50%. Investigate."
                ),
            })
        place_rate = b.get("place_rate")
        signed_edge = b.get("avg_signed_edge")
        n_bot = b.get("n_total") or 0
        if (n_bot >= 30
                and place_rate is not None and place_rate > 0.20
                and signed_edge is not None and abs(signed_edge) < 0.05):
            recs.append({
                "severity": "moderate",
                "rule": "high_placement_low_signed_edge_magnitude",
                "message": (
                    f"{bot}: places {place_rate:.0%} of trades but average |signed edge| "
                    f"is only {abs(signed_edge):.2f} (signed={signed_edge:+.2f}). "
                    f"Low directional conviction; tighten edge filter."
                ),
            })

        # Bot unprofitable even under perfect filtering
        real_pnl = b.get("real_pnl")
        cf_pnl = b.get("cf_pnl")
        n_placed_b = b.get("n_placed") or 0
        if (n_placed_b >= 10
                and real_pnl is not None and real_pnl < 0
                and cf_pnl is not None and cf_pnl < 0):
            recs.append({
                "severity": "critical",
                "rule": "bot_unprofitable_even_filtered",
                "message": (
                    f"Bot `{bot}` unprofitable on BOTH real (${real_pnl:+.2f}) AND "
                    f"counterfactual (${cf_pnl:+.2f}) on n_placed={n_placed_b} -- "
                    f"even perfect filtering wouldn't save it. Recommend pause."
                ),
            })

    # Category PnL concentration
    cats_for_rec = stats.get("categories", {}) or {}
    for cat, c in cats_for_rec.items():
        cat_pnl = c.get("real_pnl")
        cat_n_placed = c.get("n_placed") or 0
        if (cat_pnl is not None
                and cat_n_placed >= 15
                and cat_pnl < -5.0):
            severity = "critical" if cat_pnl < -15.0 else "high"
            recs.append({
                "severity": severity,
                "rule": "category_pnl_concentration",
                "message": (
                    f"Category `{cat}` real PnL ${cat_pnl:+.2f} on n_placed={cat_n_placed} -- "
                    f"concentrated loss. Consider category filter or size cap."
                ),
            })

    # Side asymmetry -- C2 patch: require each side to have >= MIN_N_VERDICT placed
    sides = stats.get("sides", {})
    yes_p = sides.get("yes", {})
    no_p = sides.get("no", {})
    yp = yes_p.get("n_placed", 0)
    np_ = no_p.get("n_placed", 0)
    if yp >= MIN_N_VERDICT and np_ >= MIN_N_VERDICT:
        total = yp + np_
        if total > 0 and (yp / total < 0.25 or np_ / total < 0.25):
            dominant = "NO" if np_ > yp else "YES"
            recs.append({
                "severity": "moderate",
                "rule": "side_asymmetry_at_placement",
                "message": (
                    f"Placed trades are {max(yp,np_)/total:.0%} {dominant}-side "
                    f"(YES={yp}, NO={np_}). Polymarket markets are symmetric -- this asymmetry "
                    f"suggests a systematic bias (contrarian filter, base-rate anchoring, or bug)."
                ),
            })

    # Asymmetric side EDGE
    yes_nd = yes_p.get("n_decided") or 0
    no_nd = no_p.get("n_decided") or 0
    yes_wr = yes_p.get("real_win_rate")
    no_wr = no_p.get("real_win_rate")
    yes_ci = yes_p.get("real_win_rate_ci")
    no_ci = no_p.get("real_win_rate_ci")
    if (yes_nd >= MIN_N_VERDICT and no_nd >= MIN_N_VERDICT
            and yes_wr is not None and no_wr is not None
            and yes_ci is not None and no_ci is not None):
        non_overlap = (yes_ci[0] > no_ci[1]) or (no_ci[0] > yes_ci[1])
        if non_overlap:
            winning_side = "YES" if yes_wr > no_wr else "NO"
            recs.append({
                "severity": "high",
                "rule": "asymmetric_side_edge",
                "message": (
                    f"YES wins {yes_wr:.0%} [{yes_ci[0]:.0%}-{yes_ci[1]:.0%}] (n={yes_nd}), "
                    f"NO wins {no_wr:.0%} [{no_ci[0]:.0%}-{no_ci[1]:.0%}] (n={no_nd}); "
                    f"CIs non-overlapping. Recommend asymmetric placement floors "
                    f"(lower edge/confidence bar on {winning_side}-side)."
                ),
            })

    # Side PnL concentration
    yes_pnl = yes_p.get("real_pnl")
    no_pnl = no_p.get("real_pnl")
    total_placed_sides = yp + np_
    if (yes_pnl is not None and no_pnl is not None
            and total_placed_sides >= MIN_N_VERDICT
            and abs(no_pnl - yes_pnl) > 10.0):
        if no_pnl > yes_pnl:
            winning_side = "NO"
            winning_pnl = no_pnl
            losing_side = "YES"
            losing_pnl = yes_pnl
        else:
            winning_side = "YES"
            winning_pnl = yes_pnl
            losing_side = "NO"
            losing_pnl = no_pnl
        recs.append({
            "severity": "high",
            "rule": "side_pnl_concentration",
            "message": (
                f"{winning_side} carries ${winning_pnl:+.2f} vs {losing_side} "
                f"${losing_pnl:+.2f} (n_placed={total_placed_sides}) -- almost all "
                f"alpha on one side. Investigate structural bias."
            ),
        })

    # Per-model under/over performance -- C2 patch: require Wilson CIs on best and
    # worst models to be non-overlapping before recommending a routing change.
    pm = stats.get("per_model", {})
    if pm:
        decided_models = [(m, d) for m, d in pm.items() if (d.get("n_decided") or 0) >= MIN_N_VERDICT]
        if len(decided_models) >= 2:
            best = max(decided_models, key=lambda md: md[1].get("real_win_rate") or 0)
            worst = min(decided_models, key=lambda md: md[1].get("real_win_rate") or 1)
            best_wr = best[1].get("real_win_rate") or 0
            worst_wr = worst[1].get("real_win_rate") or 0
            best_nd = best[1].get("n_decided") or 0
            worst_nd = worst[1].get("n_decided") or 0
            best_ci = wilson_interval(round(best_wr * best_nd), best_nd)
            worst_ci = wilson_interval(round(worst_wr * worst_nd), worst_nd)
            if (best_ci and worst_ci
                    and best_wr - worst_wr > 0.15
                    and best_ci[0] > worst_ci[1]):
                recs.append({
                    "severity": "moderate",
                    "rule": "model_performance_spread",
                    "message": (
                        f"Per-model spread (CIs non-overlapping): best={best[0]} at {best_wr:.0%} "
                        f"[{best_ci[0]:.0%}-{best_ci[1]:.0%}] (n={best_nd}), "
                        f"worst={worst[0]} at {worst_wr:.0%} "
                        f"[{worst_ci[0]:.0%}-{worst_ci[1]:.0%}] (n={worst_nd}). "
                        f"Consider routing more trades to {best[0]}."
                    ),
                })

    # Pipeline bimodality -- C2 LOW #2: gate on n_total >= 20 to stop firing on 1/1.
    bimodality = stats.get("bimodality", {})
    for bot, b in bimodality.items():
        if (b.get("n_total") or 0) >= 20 and (b.get("early_skip_pct") or 0) > 0.30:
            recs.append({
                "severity": "info",
                "rule": "high_early_skip_rate",
                "message": (
                    f"{bot}: {b['early_skip_pct']:.0%} of trades exit before research "
                    f"({b['n_early_skip']}/{b['n_total']}). Aggregate stats may be "
                    f"distorted by early-skip nulls."
                ),
            })

    # Skipping winners (counterfactual analysis)
    cf = stats.get("counterfactual", {})
    for bot, c in cf.items():
        cf_total = c.get("cf_pnl_total") or 0
        ci = c.get("would_win_rate_ci")
        if (c.get("n_with_counterfactual", 0) >= 50
                and ci is not None and ci[0] > 0.50
                and cf_total > 0):
            recs.append({
                "severity": "high",
                "rule": "skipping_winners",
                "message": (
                    f"{bot}: of {c['n_with_counterfactual']} counterfactual-resolved "
                    f"skipped trades, {c['would_win_rate']:.0%} [{ci[0]:.0%}-{ci[1]:.0%}] "
                    f"would have won. Total opportunity cost: ${cf_total:+.2f}. Loosen filters."
                ),
            })

    # EV miscalibration
    ec = stats.get("ev_calibration", {})
    ec_n = ec.get("n") or 0
    ec_r = ec.get("pearson_ev_realized")
    if ec_n >= 50 and ec_r is not None and abs(ec_r) < 0.15:
        recs.append({
            "severity": "high",
            "rule": "ev_miscalibration",
            "message": (
                f"RM ev_estimate r={ec_r:+.2f} on n={ec_n}, uncorrelated with realized "
                f"$/share -- disable RM size-rec (or disregard ev_estimate output) "
                f"until recalibrated."
            ),
        })
    elif ec_n >= MIN_N_VERDICT and ec_r is not None and ec_r < -0.05:
        recs.append({
            "severity": "moderate",
            "rule": "ev_miscalibration",
            "message": (
                f"RM ev_estimate r={ec_r:+.2f} on n={ec_n} -- negatively correlated "
                f"with realized $/share (anti-predictive, not just noisy). Disable "
                f"RM size-rec in sizing until recalibrated."
            ),
        })

    # Stale config drift
    cc = stats.get("config_cohorts", {})
    stale_share = cc.get("stale_trade_share")
    cohorts = cc.get("cohorts") or {}
    latest_hash = cc.get("latest_hash")
    if stale_share is not None and stale_share > 0.30 and latest_hash:
        stale_negative = [
            (h, c) for h, c in cohorts.items()
            if h != latest_hash and (c.get("real_pnl") or 0) < 0
        ]
        if stale_negative:
            total_stale_pnl = sum((c.get("real_pnl") or 0) for _, c in stale_negative)
            latest_deploy = (cohorts.get(latest_hash, {}).get("deployed_at") or "")[:19]
            worst_hash, worst_cohort = min(
                stale_negative, key=lambda kv: kv[1].get("real_pnl") or 0
            )
            severity = "critical" if total_stale_pnl < -10 else "moderate"
            recs.append({
                "severity": severity,
                "rule": "stale_config_drift",
                "message": (
                    f"{stale_share:.0%} of trades ran under stale configs "
                    f"(latest deployed {latest_deploy or '?'}, "
                    f"cohort `{latest_hash}`). Worst stale cohort `{worst_hash}` "
                    f"PnL ${worst_cohort.get('real_pnl') or 0:+.2f}, "
                    f"total stale PnL ${total_stale_pnl:+.2f}. Redeploy."
                ),
            })

    if not recs:
        recs.append({
            "severity": "info",
            "rule": "no_alerts",
            "message": "No deterministic alerts triggered. All metrics within bands.",
        })
    return recs


def market_breakdown_per_bot(
    signals: list[dict], field: str, edges: list[float], labels: list[str],
) -> dict:
    """Compute hit_rate_by_bucket per bot_type + overall 'all'."""
    bots = sorted({s.get("bot_type_id") or "unknown" for s in signals})
    result = {"all": _relabel_buckets(hit_rate_by_bucket(signals, field, edges), labels)}
    for bot in bots:
        filtered = [s for s in signals if (s.get("bot_type_id") or "unknown") == bot]
        result[bot] = _relabel_buckets(hit_rate_by_bucket(filtered, field, edges), labels)
    return result


def categories_per_bot(signals: list[dict]) -> dict:
    """Compute category_dynamics per bot_type + overall 'all'."""
    bots = sorted({s.get("bot_type_id") or "unknown" for s in signals})
    result = {"all": category_dynamics(signals)}
    for bot in bots:
        filtered = [s for s in signals if (s.get("bot_type_id") or "unknown") == bot]
        result[bot] = category_dynamics(filtered)
    return result


def sides_per_bot(signals: list[dict]) -> dict:
    """Compute side_breakdown per bot_type + overall 'all'."""
    bots = sorted({s.get("bot_type_id") or "unknown" for s in signals})
    result = {"all": side_breakdown(signals)}
    for bot in bots:
        filtered = [s for s in signals if (s.get("bot_type_id") or "unknown") == bot]
        result[bot] = side_breakdown(filtered)
    return result


def market_breakdown_by_week(signals: list[dict]) -> dict:
    """Compute price/timing/categories/sides per ISO week (all bots, to limit size)."""
    by_week: dict[str, list[dict]] = {}
    for s in signals:
        ts = s.get("timestamp")
        if not ts:
            continue
        dt = parse_datetime(ts)
        if dt is None:
            continue
        iso = dt.isocalendar()
        iso_week = f"{iso[0]}-W{iso[1]:02d}"
        by_week.setdefault(iso_week, []).append(s)

    weeks = sorted(by_week.keys())
    price_by_week = {}
    timing_by_week = {}
    categories_by_week = {}
    sides_by_week = {}

    for wk in weeks:
        ws = by_week[wk]
        price_by_week[wk] = _relabel_buckets(
            hit_rate_by_bucket(ws, "price", PRICE_EDGES), PRICE_LABELS
        )
        timing_by_week[wk] = _relabel_buckets(
            hit_rate_by_bucket(ws, "hours_to_close", TIME_EDGES), TIME_LABELS
        )
        categories_by_week[wk] = category_dynamics(ws)
        sides_by_week[wk] = side_breakdown(ws)

    return {
        "weeks": weeks,
        "price_by_week": price_by_week,
        "timing_by_week": timing_by_week,
        "categories_by_week": categories_by_week,
        "sides_by_week": sides_by_week,
    }


# ─── Orchestrator ───────────────────────────────────────────────────────────

def aggregate_all(signals: list[dict]) -> dict:
    stats = {
        "_signals": signals,  # for renderer; stripped before saving
        "overall": overall_stats(signals),
        "per_bot": per_bot_breakdown(signals),
        "bimodality": pipeline_bimodality(signals),
        "calibration": calibration_analysis(signals),
        "conf_edge_inversion": conf_edge_inversion(signals),
        "hit_rate_by_confidence": hit_rate_by_bucket(
            signals, "confidence",
            _quintile_edges([s["confidence"] for s in signals
                             if s["status"] in PLACED_STATUSES
                             and s["confidence"] is not None])
            if len([s for s in signals
                    if s["status"] in PLACED_STATUSES and s["confidence"] is not None]) >= 50
            else [0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        ),
        "hit_rate_by_signed_edge": hit_rate_by_bucket(
            signals, "forecaster_edge_signed",
            _quintile_edges([s["forecaster_edge_signed"] for s in signals
                             if s["status"] in PLACED_STATUSES
                             and s["forecaster_edge_signed"] is not None])
            if len([s for s in signals
                    if s["status"] in PLACED_STATUSES
                    and s["forecaster_edge_signed"] is not None]) >= 50
            else [-1.0, -0.2, -0.1, -0.05, 0.0, 0.05, 0.1, 0.2, 1.0],
        ),
        "hit_rate_by_price": _relabel_buckets(
            hit_rate_by_bucket(signals, "price", PRICE_EDGES), PRICE_LABELS
        ),
        "hit_rate_by_timing": _relabel_buckets(
            hit_rate_by_bucket(signals, "hours_to_close", TIME_EDGES), TIME_LABELS
        ),
        "hit_rate_by_price_per_bot": market_breakdown_per_bot(
            signals, "price", PRICE_EDGES, PRICE_LABELS
        ),
        "hit_rate_by_timing_per_bot": market_breakdown_per_bot(
            signals, "hours_to_close", TIME_EDGES, TIME_LABELS
        ),
        "categories_per_bot": categories_per_bot(signals),
        "sides_per_bot": sides_per_bot(signals),
        "market_by_week": market_breakdown_by_week(signals),
        "correlations": correlation_matrix(signals),
        "sides": side_breakdown(signals),
        "per_model": per_model_breakdown(signals),
        "risk_manager_audit": risk_manager_audit(signals),
        "placed_forensics": placed_trade_forensics(signals),
        "categories": category_dynamics(signals),
        "skip_reasons": skip_reason_breakdown(signals),
        "counterfactual": counterfactual_analysis(signals),
        "rolling_window": rolling_window_perf(signals, window_days=7, step_days=1),
        "forecaster_vs_rm_brier": forecaster_vs_rm_brier(signals),
        "debate_bracket": debate_bracket_analysis(signals),
        "ev_calibration": ev_calibration(signals),
        "config_cohorts": config_cohort_breakdown(signals),
        "weekly_per_bot": weekly_per_bot_breakdown(signals),
        "per_agent": per_agent_performance(signals),
        "cf_deep_dive": cf_deep_dive(signals),
        "rules_pnl_correlation": rules_pnl_correlation(signals),
    }
    # Cross-bot agent calibration. Pure transformation over per_agent.
    stats["agent_cross_bot_calibration"] = agent_cross_bot_calibration(
        stats["per_agent"]
    )
    stats["recommendations"] = recommendations(stats)
    return stats
