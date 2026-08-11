"""Tail Buyer Polymarket Bot — Mechanical Tail-Buying Pipeline.

Single-cycle mode: ingest (tail-filtered) -> filter decided -> buy cheap side -> exit.
No AI, no debates, no research. Pure mechanical strategy.
"""

import asyncio
import logging
import os
import sys

import httpx

from src.config import Config, load_config
from src.clients.polymarket_client import PolymarketClient
from src.pipeline import ingest

logger = logging.getLogger("bot")


async def fetch_decided_markets(config: Config) -> set:
    """Fetch already-decided market tickers from backend (avoids re-buying)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(
                f"{config.intercept_url}/api/intercept/decided-markets",
                params={"agent_id": config.agent_id, "cooldown_hours": config.reanalyze_cooldown_hours},
                headers={"X-Bot-Token": config.bot_token},
            )
            if resp.status_code == 200:
                data = resp.json()
                return set(data.get("markets", {}).keys())
    except Exception as e:
        logger.warning(f"Could not fetch decided markets (duplicates may occur): {e}")
    return set()


async def fetch_agent_open_positions(config: Config) -> int | None:
    """Fetch this agent's open position count from backend (bot-level, not wallet-level).

    Returns the count, or None if the backend call fails (caller should fall back to exchange-level count).
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(
                f"{config.intercept_url}/api/intercept/open-positions",
                params={"agent_id": config.agent_id},
                headers={"X-Bot-Token": config.bot_token},
            )
            if resp.status_code == 200:
                data = resp.json()
                return int(data.get("open_positions", 0))
    except Exception as e:
        logger.debug(f"Could not fetch agent positions from backend: {e}")
    return None


async def run_cycle(config: Config) -> dict:
    """Run a single tail-buying trading cycle.

    Returns summary dict with counts of markets fetched, filtered, trades placed/skipped.
    """
    stats = {"markets_fetched": 0, "markets_filtered": 0, "trades_placed": 0, "trades_skipped": 0}

    # ── 1. Fetch markets (already filtered to tail range by ingest) ──
    logger.info("Fetching tail-priced markets from Polymarket...")
    try:
        markets = await ingest.fetch_markets(config)
    except Exception as e:
        logger.error(f"Ingestion failed: {e}", exc_info=True)
        return stats
    stats["markets_fetched"] = len(markets)

    if not markets:
        logger.info("No eligible tail markets found")
        return stats

    # ── 2. Filter out already-decided markets ──
    decided = await fetch_decided_markets(config)
    logger.info(f"Decided-markets cache: {len(decided)} tickers already processed")
    if decided:
        before = len(markets)
        markets = [m for m in markets if m.ticker not in decided]
        skipped = before - len(markets)
        logger.info(f"Filtered {skipped} already-decided markets ({len(markets)} remaining)")

    stats["markets_filtered"] = len(markets)

    if not markets:
        logger.info("All markets already decided — nothing to do")
        return stats

    # ── 3. Get balance + open positions ──
    client = PolymarketClient()
    try:
        balance_data = await client.get_balance()
        cash_cents = balance_data.get("balance", 0)
        cash = cash_cents / 100  # Convert cents to dollars
        logger.info(f"Balance: cash=${cash:.2f}")

        if cash < config.min_position_size:
            logger.warning(f"Cash ${cash:.2f} below minimum position size ${config.min_position_size}")
            return stats

        # Count open positions — use bot-level count from backend (not wallet-level)
        agent_positions = await fetch_agent_open_positions(config)
        if agent_positions is not None:
            open_positions = agent_positions
            logger.info(f"Open positions (bot-level): {open_positions}/{config.max_positions}")
        else:
            # Fallback: wallet-level from exchange (filter dust)
            positions_data = await client.get_positions()
            all_positions = positions_data.get("market_positions", [])
            meaningful = [p for p in all_positions if float(p.get("market_exposure_dollars", 0)) >= 0.01]
            open_positions = len(meaningful)
            logger.info(f"Open positions (wallet-level fallback): {open_positions}/{config.max_positions}")

        if open_positions >= config.max_positions:
            logger.warning(f"At max positions ({open_positions}/{config.max_positions}), skipping cycle")
            return stats

        # ── 4. Buy cheap side of each qualifying market ──
        remaining_cash = cash

        for market in markets[:config.max_markets_per_cycle]:
            if remaining_cash < config.min_position_size:
                logger.info(f"Remaining cash ${remaining_cash:.2f} below min position size, stopping")
                break
            if open_positions >= config.max_positions:
                logger.info(f"At max positions ({open_positions}/{config.max_positions}), stopping")
                break

            # Calculate contract count based on trade_size
            count = int(config.trade_size / market.cheap_price) if market.cheap_price > 0 else 0
            if count < 1:
                logger.info(f"SKIP {market.title[:40]}: count=0 (price={market.cheap_price}, trade_size={config.trade_size})")
                stats["trades_skipped"] += 1
                continue

            total_cost = count * market.cheap_price
            if total_cost < config.min_position_size:
                logger.info(f"SKIP {market.title[:40]}: cost ${total_cost:.4f} < min ${config.min_position_size}")
                stats["trades_skipped"] += 1
                continue

            # Trim to remaining cash if needed
            if total_cost > remaining_cash:
                count = int(remaining_cash / market.cheap_price)
                if count < 1:
                    logger.info(f"SKIP {market.title[:40]}: insufficient cash ${remaining_cash:.2f}")
                    stats["trades_skipped"] += 1
                    continue
                total_cost = count * market.cheap_price

            # Respect exchange min order size
            if count < market.order_min_size:
                if market.order_min_size * market.cheap_price <= config.trade_size:
                    count = market.order_min_size
                    total_cost = count * market.cheap_price
                else:
                    logger.info(f"SKIP {market.title[:40]}: count {count} < min_order_size {market.order_min_size}")
                    stats["trades_skipped"] += 1
                    continue

            rationale = (
                f"[tail-buyer] {market.cheap_side.upper()} @ {market.cheap_price*100:.1f}c, "
                f"{count} contracts, ${total_cost:.2f}"
            )

            logger.info(
                f"Buying {market.cheap_side.upper()} x{count} @ {market.cheap_price*100:.1f}c "
                f"(${total_cost:.2f}) — {market.title[:60]}"
            )

            try:
                result = await client.place_order(
                    ticker=market.ticker,
                    side=market.cheap_side,
                    action="buy",
                    count=count,
                    type_="market",
                    confidence=1.0,
                    rationale=rationale,
                    category=market.category,
                    market_title=market.title,
                    price_dollars=market.cheap_price,  # float dollars, no rounding
                )

                status = result.get("status", "unknown")
                if status in ("executed", "matched", "filled", "pending", "queued", "live", "paper"):
                    stats["trades_placed"] += 1
                    remaining_cash -= total_cost
                    open_positions += 1
                    logger.info(f"Trade placed ({status}): remaining cash=${remaining_cash:.2f}")
                else:
                    stats["trades_skipped"] += 1
                    logger.info(f"Trade not placed (status={status})")

            except Exception as e:
                logger.error(f"Order failed for {market.ticker[:16]}: {e}")
                stats["trades_skipped"] += 1

    finally:
        await client.close()

    logger.info(
        f"Cycle complete: {stats['markets_fetched']} fetched, "
        f"{stats['markets_filtered']} after decided filter, "
        f"{stats['trades_placed']} traded, {stats['trades_skipped']} skipped"
    )
    sys.stdout.flush()
    return stats


async def main():
    """Entry point — run a single cycle."""
    config = load_config()

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )

    mode = config.mode
    logger.info("Tail Buyer Polymarket Bot Starting")
    logger.info(f"Mode: {mode.upper()}")
    logger.info(
        f"Price range: {config.min_contract_price*100:.1f}c - {config.max_contract_price*100:.1f}c"
    )
    logger.info(f"Expiry range: {config.min_expiry_days} - {config.max_expiry_days} days")
    logger.info(f"Trade size: ${config.trade_size:.2f}, Max positions: {config.max_positions}")
    logger.info(f"Max {config.max_markets_per_cycle} markets per cycle")

    if mode == "live":
        logger.warning("LIVE TRADING MODE — real money will be used!")

    stats = await run_cycle(config)
    logger.info(f"Cycle finished: {stats}")
