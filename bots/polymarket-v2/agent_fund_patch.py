"""Entry point for Polymarket V2 bot.

Launched by arq worker as a subprocess. Env vars (AGENT_FUND_AGENT_ID,
AGENT_FUND_BOT_TOKEN) must be set. Runs a single trading cycle and exits.
"""

import sys
import os
import asyncio
import logging

# Ensure this directory is on sys.path
BOT_DIR = os.path.dirname(os.path.abspath(__file__))
if BOT_DIR not in sys.path:
    sys.path.insert(0, BOT_DIR)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("agent_fund_patch")

# Security fix 3C: load credentials from temp file instead of env vars
_creds_file = os.environ.get("AGENT_FUND_CREDS_FILE")
if _creds_file and os.path.exists(_creds_file):
    import json as _json
    with open(_creds_file) as _f:
        for _k, _v in _json.load(_f).items():
            os.environ[_k] = _v
    logger.info("Loaded credentials from secure file")

INTERCEPT_URL = os.environ.get("AGENT_FUND_INTERCEPT_URL", "http://localhost:8000").rstrip("/")


def store_debate_results(step_results: dict, ticker: str = ""):
    """Delegate to polymarket_client's debate buffer."""
    from src.clients.polymarket_client import store_debate_results as _store
    _store(step_results, ticker)


def fetch_credentials(agent_id: str, bot_token: str):
    """Fetch exchange credentials from the backend API."""
    import httpx
    try:
        resp = httpx.get(
            f"{INTERCEPT_URL}/api/bot/credentials",
            params={"agent_id": agent_id},
            headers={"X-Bot-Token": bot_token},
            timeout=15.0,
        )
        resp.raise_for_status()
        creds = resp.json()

        for key in ("POLYMARKET_PRIVATE_KEY", "POLYMARKET_FUNDER_ADDRESS", "OPENROUTER_API_KEY"):
            if key in creds and creds[key]:
                os.environ[key] = creds[key]
                logger.info(f"Fetched {key} from backend ({len(creds[key])} chars)")

        if "mode" in creds:
            os.environ["AGENT_FUND_MODE"] = creds["mode"]

    except Exception as e:
        logger.error(f"Failed to fetch credentials: {e}")


def run_trading_cycle(agent_id: str, bot_token: str):
    """Run a single trading cycle."""
    os.environ["EXCHANGE"] = "polymarket"
    os.environ["AGENT_FUND_AGENT_ID"] = agent_id
    os.environ["AGENT_FUND_BOT_TOKEN"] = bot_token

    logger.info("Starting Polymarket V2 trading cycle")

    from bot import main as bot_main

    try:
        asyncio.run(bot_main())
        logger.info("Trading cycle completed cleanly")
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot stopped by signal")
    except Exception as e:
        print(f"BOT CRASHED: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        logger.error(f"Bot crashed: {e}")
        traceback.print_exc()


def main():
    """Main entry point."""
    # Subprocess mode: worker provides identity via env vars
    subprocess_agent_id = os.environ.get("AGENT_FUND_AGENT_ID")
    subprocess_bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN")
    if not subprocess_agent_id or not subprocess_bot_token:
        logger.error("Missing AGENT_FUND_AGENT_ID or AGENT_FUND_BOT_TOKEN — must be launched by worker")
        sys.exit(1)

    logger.info(f"Subprocess mode (agent={subprocess_agent_id}) — single cycle")
    fetch_credentials(subprocess_agent_id, subprocess_bot_token)
    run_trading_cycle(subprocess_agent_id, subprocess_bot_token)


if __name__ == "__main__":
    main()
