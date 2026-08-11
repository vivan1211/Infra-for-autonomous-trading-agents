"""Kalshi V2 Trading Bot — Clean Pipeline.

Single-cycle mode: ingest → select → research → debate → edge → size → execute → exit.
Mirror of polymarket-v2 with Kalshi-specific client and ingestion.
"""

import asyncio
import logging
import os
import sys

import httpx

from src.config import Config
from src.clients.kalshi_client import KalshiClient
from src.pipeline import ingest, analyze, decide, execute, research, preflight

logger = logging.getLogger("bot")


async def fetch_decided_markets(config: Config) -> set:
    """Fetch already-decided market tickers from backend (avoids re-analyzing)."""
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
        logger.debug(f"Could not fetch decided markets: {e}")
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


# Module-level debate buffer for intercept payloads
_debate_results_by_ticker: dict = {}


def store_debate_results(step_results: dict, ticker: str):
    """Store debate results for later retrieval during place_order."""
    _debate_results_by_ticker[ticker] = step_results


async def _report_skip(client, market, result, reason: str = "ensemble_skip"):
    """Report a SKIP decision to the backend so it appears in signals/trades."""
    try:
        import json
        debate_json = None
        if result.step_results:
            try:
                debate_json = json.dumps(result.step_results, default=str)
            except Exception:
                pass

        store_debate_results(result.step_results, ticker=market.ticker)

        await client.place_order(
            ticker=market.ticker,
            action="skip",
            side=result.side.lower(),
            count=0,
            type_="market",
            confidence=result.confidence,
            rationale=f"[{reason}] {result.reasoning[:1500]}" if result.reasoning else reason,
            category=market.category,
            market_title=market.title,
            debate_results_json=debate_json,
        )
    except Exception as e:
        logger.debug(f"Failed to report SKIP for {market.ticker[:16]}: {e}")


async def _report_rejected(client, market, result, reason: str = "rejected"):
    """Report a REJECTED decision — AI wanted to trade but filters/sizing blocked it."""
    try:
        import json
        debate_json = None
        if result.step_results:
            try:
                debate_json = json.dumps(result.step_results, default=str)
            except Exception:
                pass

        store_debate_results(result.step_results, ticker=market.ticker)

        await client.place_order(
            ticker=market.ticker,
            action="rejected",
            side=result.side.lower(),
            count=0,
            type_="market",
            confidence=result.confidence,
            rationale=f"[{reason}] {result.reasoning[:1500]}" if result.reasoning else reason,
            category=market.category,
            market_title=market.title,
            debate_results_json=debate_json,
        )
    except Exception as e:
        logger.debug(f"Failed to report REJECTED for {market.ticker[:16]}: {e}")


async def run_cycle(config: Config) -> dict:
    """Run a single trading cycle."""
    stats = {"markets_fetched": 0, "markets_researched": 0, "markets_analyzed": 0, "trades_placed": 0, "skipped": 0}

    # ── 0. Preflight: validate every external dependency before doing expensive work ──
    # Catches model retirements, expired keys, exchange outages. ~$0.0001/cycle, prevents
    # the $3 + 90-min waste pattern we hit when x-ai/grok-4.1-fast was silently retired.
    if not await preflight.run_preflight(config):
        return stats

    # ── 1. Ingest markets ──
    logger.info("🔄 Fetching markets from Kalshi...")
    client = KalshiClient(config)
    try:
        markets = await ingest.fetch_markets(config, client)
        stats["markets_fetched"] = len(markets)

        if not markets:
            logger.info("No eligible markets found")
            return stats

        # ── 2. Skip already-decided ──
        decided = await fetch_decided_markets(config)
        logger.info(f"📋 Decided-markets cache: {len(decided)} tickers already processed")
        if decided:
            before = len(markets)
            markets = [m for m in markets if m.ticker not in decided]
            skipped = before - len(markets)
            logger.info(f"Filtered {skipped} already-decided markets ({len(markets)} remaining)")
            if not markets:
                logger.warning(f"⚠️ ALL {before} markets were already decided — decided cache may be too aggressive")

        # ── 3. Get balance ──
        balance_data = await client.get_balance()
        cash_cents = balance_data.get("balance", 0)
        portfolio_cents = balance_data.get("portfolio_value", 0)
        cash = cash_cents / 100  # Kalshi returns cents
        portfolio = portfolio_cents / 100
        logger.info(f"💰 Balance: cash=${cash:.2f}, portfolio=${portfolio:.2f}")

        if cash < config.min_position_size:
            logger.warning(f"⚠️ Cash ${cash:.2f} below minimum position size ${config.min_position_size}")
            return stats

        # Count open positions — use bot-level count from backend (not wallet-level)
        agent_positions = await fetch_agent_open_positions(config)
        if agent_positions is not None:
            open_positions = agent_positions
            logger.info(f"📊 Open positions (bot-level): {open_positions}/{config.max_positions}")
        else:
            # Fallback: wallet-level from exchange (filter dust)
            positions_data = await client.get_positions()
            all_positions = positions_data.get("market_positions", [])
            meaningful = [p for p in all_positions if abs(float(p.get("position", p.get("count", 0)))) >= 1]
            open_positions = len(meaningful)
            logger.info(f"📊 Open positions (wallet-level fallback): {open_positions}/{config.max_positions}")

        portfolio_context = (
            f"Portfolio: ${cash:.2f} available cash, ${portfolio:.2f} total value, "
            f"{open_positions}/{config.max_positions} positions open, "
            f"max {config.max_position_pct}% per position"
        )

        # ── Early exit: skip debates if at max positions ──
        if open_positions >= config.max_positions:
            logger.warning(f"⚠️ At max positions ({open_positions}/{config.max_positions}), skipping debates to save AI budget")
            return stats

        # ── 4. Research top N markets via Perplexity ──
        top_markets = markets[:config.max_markets_per_cycle]
        logger.info(f"🔬 Researching top {len(top_markets)} markets via Perplexity...")
        # Research-phase watchdog: cap total wall-clock at 15 min to leave 30 min
        # for debate/decide/execute inside the 45-min subprocess cap (worker.py:318).
        # Rationale: empirical debate is ~77s/market × 10 markets = ~770s (~13 min);
        # with full research context (no longer [:3000]) debate is ~110-150s/market (~18-25 min).
        # 15 min research budget is 3× the ~5 min typical observed in real cycles and
        # still defends against the 2400s worst case (4 batches × 600s research_timeout).
        try:
            research_results = await asyncio.wait_for(
                research.research_markets(top_markets, config),
                timeout=900,
            )
        except asyncio.TimeoutError:
            logger.error(
                f"⚠️ Research phase exceeded 15-min watchdog — aborting cycle. "
                f"{len(top_markets)} markets abandoned to preserve subprocess budget."
            )
            return stats
        stats["markets_researched"] = sum(1 for v in research_results.values() if v)

        # ── 5. Debate each market ──
        logger.info(f"🎯 Debating {len(top_markets)} markets")

        for market in top_markets:
            try:
                research_context = research_results.get(market.ticker, "")

                # Skip markets where research failed — debating without context is unreliable
                if not research_context:
                    logger.warning(f"⚠️ SKIP: No research context for {market.title[:50]} — skipping debate")
                    stats["skipped"] += 1
                    continue

                # 5a. AI debate
                logger.info(f"🧠 Debating: {market.ticker} {market.title[:60]}...")
                result = await analyze.run_debate(market, config, portfolio_context, research_context)
                stats["markets_analyzed"] += 1

                if result.action == "SKIP":
                    logger.info(f"⏭️ SKIP: {market.ticker} {market.title[:50]}")
                    stats["skipped"] += 1
                    await _report_skip(client, market, result)
                    continue

                # 5b. Edge check
                edge_pass, edge_reason = decide.has_edge(result, market, config)
                if not edge_pass:
                    stats["skipped"] += 1
                    await _report_rejected(client, market, result, reason=edge_reason)
                    continue

                # 5c. Position sizing
                quantity = decide.calculate_size(result, cash, open_positions, config, market=market)
                if quantity <= 0:
                    stats["skipped"] += 1
                    await _report_rejected(client, market, result, reason="position_size_zero")
                    continue

                # 5d. Execute
                success = await execute.place_order(client, market, result, quantity, config)
                if success:
                    stats["trades_placed"] += 1
                    open_positions += 1
                    # Use market price (same as sizing) for consistent cash tracking
                    price = market.yes_price if result.side == "YES" else market.no_price
                    cash -= quantity * price
                    logger.info(f"✅ Trade placed! Remaining cash: ${cash:.2f}")

            except Exception as e:
                logger.error(f"Error analyzing {market.title[:50]}: {e}", exc_info=True)
                print(f"Error analyzing market: {e}", file=sys.stderr, flush=True)

    finally:
        await client.close()

    logger.info(
        f"📊 Cycle complete: {stats['markets_fetched']} fetched, "
        f"{stats['markets_researched']} researched, "
        f"{stats['markets_analyzed']} analyzed, {stats['trades_placed']} traded, "
        f"{stats['skipped']} skipped"
    )
    return stats


async def main():
    """Entry point — run a single cycle."""
    config = Config()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )

    mode = config.mode
    logger.info("🚀 Kalshi V2 Bot Starting")
    logger.info(f"📊 Mode: {mode.upper()}")
    logger.info(f"🔬 Research model: {config.research_model}")
    logger.info(f"💰 Daily AI Budget: ${config.daily_ai_budget}")
    logger.info(f"🎯 Max {config.max_markets_per_cycle} markets per cycle")
    logger.info(f"📈 Max {config.max_positions} positions, {config.max_position_pct}% max per position")

    if mode == "live":
        logger.warning("⚠️ LIVE TRADING MODE — real money will be used!")

    stats = await run_cycle(config)
    logger.info(f"✅ Cycle finished: {stats}")
