#!/usr/bin/env python3
"""Backfill historical market prices for Polymarket trades.

Fetches price history from the Polymarket CLOB API and updates trades
that currently have price=0 (skipped/rejected trades that were never priced).

Usage:
    # Dry run (default) — shows what would change without touching the DB:
    python backfill_prices.py

    # Actually update the database:
    python backfill_prices.py --execute
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg2
import psycopg2.extras

# ── Config ──────────────────────────────────────────────────────────────────

CLOB_API = "https://clob.polymarket.com"
API_DELAY = 0.3  # seconds between API calls

# Load DATABASE_URL from backend/.env if not already in environment
BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"


def load_env() -> str:
    """Return DATABASE_URL from env var or backend/.env file."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url

    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                # Strip optional quotes
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                return val

    raise SystemExit(
        "DATABASE_URL is not set. Export it or add it to backend/.env, e.g.\n"
        "  export DATABASE_URL='postgresql://USER:PASSWORD@HOST:6543/postgres'"
    )


# ── Polymarket API helpers ──────────────────────────────────────────────────

def fetch_market(client: httpx.Client, condition_id: str) -> dict | None:
    """GET /markets/{condition_id} → extract YES/NO token IDs.

    Returns dict with keys: yes_token_id, no_token_id, neg_risk, title
    or None on failure.
    """
    url = f"{CLOB_API}/markets/{condition_id}"
    try:
        resp = client.get(url)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ERROR fetching market {condition_id}: {e}")
        return None

    tokens = data.get("tokens", [])
    if len(tokens) < 2:
        print(f"  ERROR: market {condition_id} has {len(tokens)} tokens (expected 2)")
        return None

    neg_risk = data.get("neg_risk", False)

    # Determine YES/NO token IDs
    # For neg_risk markets: tokens[0] is YES, tokens[1] is NO
    # For non-neg_risk: match by outcome name
    if neg_risk:
        yes_token = tokens[0]["token_id"]
        no_token = tokens[1]["token_id"]
    else:
        yes_token = None
        no_token = None
        for t in tokens:
            outcome = t.get("outcome", "").upper()
            if outcome == "YES":
                yes_token = t["token_id"]
            elif outcome == "NO":
                no_token = t["token_id"]
        # Fallback: if outcomes are not YES/NO, use positional
        if not yes_token:
            yes_token = tokens[0]["token_id"]
        if not no_token:
            no_token = tokens[1]["token_id"]

    return {
        "yes_token_id": yes_token,
        "no_token_id": no_token,
        "neg_risk": neg_risk,
        "title": data.get("question", condition_id[:20]),
    }


def fetch_price_history(client: httpx.Client, token_id: str) -> list[dict] | None:
    """GET /prices-history for a token. Returns list of {t, p} or None."""
    url = f"{CLOB_API}/prices-history"
    params = {"market": token_id, "interval": "max", "fidelity": "1"}
    try:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ERROR fetching price history for token {token_id[:16]}...: {e}")
        return None

    history = data.get("history")
    if not history:
        return None
    return history


def find_closest_price(history: list[dict], target_ts: float) -> tuple[float, float]:
    """Binary search for closest price point to target_ts.

    Returns (price, abs_delta_seconds).
    """
    if not history:
        return 0.0, float("inf")

    lo, hi = 0, len(history) - 1
    best_idx = 0
    best_delta = abs(history[0]["t"] - target_ts)

    while lo <= hi:
        mid = (lo + hi) // 2
        delta = abs(history[mid]["t"] - target_ts)
        if delta < best_delta:
            best_delta = delta
            best_idx = mid
        if history[mid]["t"] < target_ts:
            lo = mid + 1
        elif history[mid]["t"] > target_ts:
            hi = mid - 1
        else:
            break  # exact match

    return history[best_idx]["p"], best_delta


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Backfill Polymarket trade prices.")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually update the database. Without this flag, runs in dry-run mode.",
    )
    args = parser.parse_args()
    dry_run = not args.execute

    print("=" * 70)
    print("Polymarket Trade Price Backfill")
    print(f"Mode: {'DRY RUN (no DB changes)' if dry_run else 'EXECUTE (will update DB)'}")
    print("=" * 70)

    db_url = load_env()
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ── Step 1: Find all trades needing price backfill ──────────────────────
    cur.execute("""
        SELECT id, market_ticker, market_title, side, timestamp, price
        FROM trades
        WHERE price = 0
          AND status IN ('skipped', 'rejected')
          AND exchange = 'polymarket'
        ORDER BY timestamp
    """)
    trades = cur.fetchall()
    print(f"\nFound {len(trades)} trades with price=0 (skipped/rejected, polymarket)\n")

    if not trades:
        print("Nothing to backfill. Done.")
        cur.close()
        conn.close()
        return

    # ── Step 2: Group by market_ticker ──────────────────────────────────────
    markets: dict[str, list[dict]] = {}
    for t in trades:
        ticker = t["market_ticker"]
        markets.setdefault(ticker, []).append(t)

    total_markets = len(markets)
    print(f"Grouped into {total_markets} unique markets\n")

    # ── Step 3: Process each market ─────────────────────────────────────────
    http = httpx.Client(timeout=15.0)
    market_cache: dict[str, dict] = {}  # condition_id → market info
    history_cache: dict[str, list[dict]] = {}  # token_id → price history

    updated = 0
    failed = 0
    skipped = 0

    for idx, (ticker, market_trades) in enumerate(markets.items(), 1):
        print(f"Processing market {idx}/{total_markets}: {ticker[:40]}...")

        # Fetch market info (cached)
        if ticker in market_cache:
            mkt = market_cache[ticker]
        else:
            mkt = fetch_market(http, ticker)
            time.sleep(API_DELAY)
            if mkt:
                market_cache[ticker] = mkt

        if not mkt:
            print(f"  SKIP: could not fetch market info ({len(market_trades)} trades affected)")
            failed += len(market_trades)
            continue

        title = mkt["title"]
        yes_token = mkt["yes_token_id"]

        # Fetch YES price history (cached)
        if yes_token in history_cache:
            history = history_cache[yes_token]
        else:
            history = fetch_price_history(http, yes_token)
            time.sleep(API_DELAY)
            if history:
                history_cache[yes_token] = history

        if not history:
            print(f"  SKIP: no price history for \"{title[:50]}\" ({len(market_trades)} trades)")
            skipped += len(market_trades)
            continue

        # Process each trade on this market
        for trade in market_trades:
            trade_ts = trade["timestamp"]
            if isinstance(trade_ts, datetime):
                target_ts = trade_ts.timestamp()
            else:
                target_ts = datetime.fromisoformat(str(trade_ts)).timestamp()

            yes_price, delta_secs = find_closest_price(history, target_ts)
            delta_minutes = delta_secs / 60.0

            side = (trade["side"] or "").lower()
            if side == "no":
                final_price = round(1.0 - yes_price, 4)
            else:
                final_price = round(yes_price, 4)

            trade_id = str(trade["id"])
            log_title = title[:45] if title else ticker[:45]
            print(
                f"  trade={trade_id[:8]}  "
                f"market=\"{log_title}\"  "
                f"side={side}  "
                f"old_price=0  new_price={final_price:.4f}  "
                f"time_delta={delta_minutes:.1f}min"
            )

            if not dry_run:
                cur.execute(
                    "UPDATE trades SET price = %s WHERE id = %s",
                    (final_price, trade["id"]),
                )

            updated += 1

    # ── Step 4: Commit and summarize ────────────────────────────────────────
    if not dry_run:
        conn.commit()
        print("\nDatabase changes committed.")
    else:
        conn.rollback()

    http.close()
    cur.close()
    conn.close()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Total trades found:    {len(trades)}")
    print(f"  Updated:               {updated}" + (" (dry run)" if dry_run else ""))
    print(f"  Failed (market error): {failed}")
    print(f"  Skipped (no history):  {skipped}")
    print("=" * 70)

    if dry_run and updated > 0:
        print("\nRe-run with --execute to apply changes:")
        print(f"  python {Path(__file__).name} --execute")


if __name__ == "__main__":
    main()
