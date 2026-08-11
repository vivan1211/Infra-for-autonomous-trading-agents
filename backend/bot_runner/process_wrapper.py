"""Read JSON decision lines from bot stdout."""

import json
import asyncio
import logging
from typing import AsyncIterator, Optional

from app.schemas.decision import BotDecision

logger = logging.getLogger(__name__)


async def read_decisions(
    process: asyncio.subprocess.Process,
    agent_id: str,
) -> AsyncIterator[BotDecision]:
    """
    Read JSON decision lines from a bot subprocess stdout.

    Each bot emits one JSON line per trade decision:
    {"market_ticker": "...", "side": "yes", "price": 0.65, ...}

    Non-JSON lines are logged as bot output.
    """
    if not process.stdout:
        return

    while True:
        line = await process.stdout.readline()
        if not line:
            break  # Process ended

        text = line.decode("utf-8").strip()
        if not text:
            continue

        # Try to parse as JSON decision
        try:
            data = json.loads(text)
            decision = BotDecision(**data)
            logger.info(f"[{agent_id}] Decision: {decision.side} {decision.market_ticker} @ {decision.price}")
            yield decision
        except (json.JSONDecodeError, Exception):
            # Not a JSON line — just bot log output
            logger.debug(f"[{agent_id}] stdout: {text[:200]}")


async def read_stderr(
    process: asyncio.subprocess.Process,
    agent_id: str,
    on_line: Optional[callable] = None,
):
    """Read and log stderr from a bot subprocess."""
    if not process.stderr:
        return

    while True:
        line = await process.stderr.readline()
        if not line:
            break

        text = line.decode("utf-8").strip()
        if text:
            logger.warning(f"[{agent_id}] stderr: {text[:500]}")
            if on_line:
                await on_line(agent_id, "warn", text[:500])
