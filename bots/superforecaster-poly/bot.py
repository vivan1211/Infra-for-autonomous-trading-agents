"""Superforecaster Polymarket Bot — Clean Pipeline.

Single-cycle mode: ingest → research → analyze → edge → size → execute → exit.
Two-step LLM: Perplexity researches each market, then user-selected model
does Superforecaster reasoning with that research as context.
"""

import asyncio
import logging
import os
import sys

import httpx

from src.config import Config, load_config
from src.clients.polymarket_client import PolymarketClient
from src.pipeline import ingest, research, analyze, decide, execute, preflight

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
    """Fetch this agent's open position count from backend (bot-level, not wallet-level)."""
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


async def _report_skip(client, market, result, reason: str = "superforecaster_skip"):
    """Report a SKIP decision to the backend so it appears in signals/trades."""
    try:
        import json
        step_results_json = None
        if result.step_results:
            try:
                step_results_json = json.dumps(result.step_results, default=str)
            except Exception:
                pass

        from src.clients.polymarket_client import store_debate_results
        store_debate_results(result.step_results, ticker=market.ticker)

        from src.config import load_config
        config = load_config()

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
            debate_results_json=step_results_json,
            model=config.model,
        )
    except Exception as e:
        logger.debug(f"Failed to report SKIP for {market.ticker[:16]}: {e}")


async def _report_rejected(client, market, result, reason: str = "rejected"):
    """Report a REJECTED decision — AI wanted to trade but filters/sizing blocked it."""
    try:
        import json
        step_results_json = None
        if result.step_results:
            try:
                step_results_json = json.dumps(result.step_results, default=str)
            except Exception:
                pass

        from src.clients.polymarket_client import store_debate_results
        store_debate_results(result.step_results, ticker=market.ticker)

        from src.config import load_config
        config = load_config()

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
            debate_results_json=step_results_json,
            model=config.model,
        )
    except Exception as e:
        logger.debug(f"Failed to report REJECTED for {market.ticker[:16]}: {e}")


async def run_cycle(config: Config) -> dict:
    """Run a single trading cycle.

    Pipeline: ingest → research → analyze → decide → execute
    """
    stats = {"markets_fetched": 0, "markets_researched": 0, "markets_analyzed": 0, "trades_placed": 0, "skipped": 0}

    # ── 0. Preflight: validate every external dependency before doing expensive work ──
    # Catches model retirements, expired keys, exchange outages. ~$0.0001/cycle.
    if not await preflight.run_preflight(config):
        return stats

    # ── 1. Ingest markets (retry once if empty — transient API issues) ──
    markets = []
    for attempt in range(2):
        logger.info(f"🔄 Fetching markets from Polymarket...{' (retry)' if attempt > 0 else ''}")
        try:
            markets = await ingest.fetch_markets(config)
        except Exception as e:
            logger.error(f"❌ Ingestion failed: {e}", exc_info=True)
            if attempt == 0:
                await asyncio.sleep(5)
                continue
            return stats
        if markets:
            break
        if attempt == 0:
            logger.warning("⚠️ No markets found, retrying in 5s...")
            await asyncio.sleep(5)
    stats["markets_fetched"] = len(markets)

    if not markets:
        logger.info("No eligible markets found after retry")
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
    client = PolymarketClient()
    try:
        balance_data = await client.get_balance()
        cash_cents = balance_data.get("balance", 0)
        portfolio_cents = balance_data.get("portfolio_value", 0)
        cash = cash_cents / 100
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
            meaningful = [p for p in all_positions if float(p.get("market_exposure_dollars", 0)) >= 0.01]
            open_positions = len(meaningful)
            logger.info(f"📊 Open positions (wallet-level fallback): {open_positions}/{config.max_positions}")

        portfolio_context = (
            f"Portfolio: ${cash:.2f} available cash, ${portfolio:.2f} total value, "
            f"{open_positions}/{config.max_positions} positions open, "
            f"max {config.max_position_pct}% per position"
        )

        # ── 4. Research top N markets via Perplexity ──
        top_markets = markets[:config.max_markets_per_cycle]
        logger.info(f"🔬 Researching top {len(top_markets)} markets via Perplexity...")
        research_results = await research.research_markets(top_markets, config)
        stats["markets_researched"] = sum(1 for v in research_results.values() if v)

        # ── 5. Analyze each market with Superforecaster ──
        logger.info(f"🎯 Analyzing {len(top_markets)} markets with {config.model}...")

        for market in top_markets:
            try:
                research_context = research_results.get(market.ticker, "")

                # Skip markets where research failed — analyzing without context is unreliable
                if not research_context:
                    logger.warning(f"⚠️ SKIP: No research context for {market.title[:50]} — skipping analysis")
                    stats["skipped"] += 1
                    continue

                # 5a. Superforecaster analysis
                logger.info(f"🧠 Analyzing: {market.ticker} {market.title[:60]}...")
                result = await analyze.run_analysis(market, config, research_context, portfolio_context)
                stats["markets_analyzed"] += 1

                if result.action == "SKIP":
                    logger.info(f"⏭️ SKIP: {market.ticker} {market.title[:50]}")
                    stats["skipped"] += 1
                    await _report_skip(client, market, result)
                    continue

                # 5b. Edge check (same thresholds as Council V2)
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

    finally:
        await client.close()

    logger.info(
        f"📊 Cycle complete: {stats['markets_fetched']} fetched, "
        f"{stats['markets_researched']} researched, "
        f"{stats['markets_analyzed']} analyzed, {stats['trades_placed']} traded, "
        f"{stats['skipped']} skipped"
    )
    sys.stdout.flush()
    return stats


async def main():
    """Entry point — run a single cycle."""
    config = load_config()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )

    logger.info("🚀 Superforecaster Polymarket Bot Starting")
    logger.info(f"📊 Mode: {config.mode.upper()}")
    logger.info(f"🧠 Reasoning model: {config.model}")
    logger.info(f"🔬 Research model: {config.research_model}")
    logger.info(f"💰 Daily AI Budget: ${config.daily_ai_budget}")
    logger.info(f"🎯 Max {config.max_markets_per_cycle} markets per cycle")

    if config.mode == "live":
        logger.warning("⚠️ LIVE TRADING MODE — real money will be used!")

    stats = await run_cycle(config)
    logger.info(f"✅ Cycle finished: {stats}")
