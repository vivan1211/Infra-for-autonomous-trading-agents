"""Proxy Kalshi client — drop-in replacement that intercepts order calls.

Instead of sending orders directly to Kalshi, this client POSTs the order
payload to our FastAPI /api/intercept endpoint. The orchestrator then
validates (rules engine + LLM validator) and executes via the real
Kalshi client if approved.

All other methods (get_markets, get_balance, etc.) pass through to the
real Kalshi API so the bot can fetch data normally.
"""

from __future__ import annotations

import httpx
import json
import logging
import os
from typing import Optional

from .client import KalshiClient

logger = logging.getLogger(__name__)


class ProxyKalshiClient(KalshiClient):
    """
    Kalshi client that intercepts place_order() and cancel_order().

    All read operations (markets, balance, positions) go directly to Kalshi.
    All write operations (place_order, cancel_order) are redirected to
    our /api/intercept endpoint for validation before execution.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        private_key_pem: str,
        intercept_url: str,
        agent_id: str,
        bot_auth_token: str | None = None,
    ):
        super().__init__(base_url, api_key, private_key_pem)
        self.intercept_url = intercept_url.rstrip("/")
        self.agent_id = agent_id
        self.bot_auth_token = bot_auth_token
        self._reasoning_buffer: list[str] = []

    def buffer_reasoning(self, line: str):
        """Buffer a line of stdout reasoning for the current decision cycle."""
        self._reasoning_buffer.append(line)

    def flush_reasoning(self) -> str:
        """Flush and return the buffered reasoning, then reset."""
        reasoning = "\n".join(self._reasoning_buffer)
        self._reasoning_buffer = []
        return reasoning

    async def place_order(
        self,
        ticker: str,
        side: str,
        action: str = "buy",
        count: int = 1,
        type: str = "market",
        yes_price: float | None = None,
        no_price: float | None = None,
        buy_max_cost: float | None = None,
        client_order_id: str | None = None,
    ) -> dict:
        """
        Intercept place_order — POST to /api/intercept instead of Kalshi.

        Handles all order types: BUY, SELL, YES, NO.
        The orchestrator decides whether to execute, paper-trade, or reject.
        """
        raw_reasoning = self.flush_reasoning()

        payload = {
            "agent_id": self.agent_id,
            "market_ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
            "order_type": type,
            "yes_price": yes_price,
            "no_price": no_price,
            "buy_max_cost": buy_max_cost,
            "client_order_id": client_order_id,
            "raw_reasoning": raw_reasoning,
        }

        headers = {"Content-Type": "application/json"}
        if self.bot_auth_token:
            headers["X-Bot-Token"] = self.bot_auth_token

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.intercept_url}/api/intercept",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                result = response.json()

                logger.info(
                    f"Order intercepted: {action} {side} {ticker} -> {result.get('status', 'unknown')}"
                )
                return result

        except httpx.HTTPStatusError as e:
            logger.error(f"Intercept endpoint error: {e.response.status_code} {e.response.text}")
            raise Exception(f"Order intercept failed: {e.response.status_code}")
        except Exception as e:
            logger.error(f"Failed to reach intercept endpoint: {e}")
            raise

    async def cancel_order(self, order_id: str) -> dict:
        """Intercept cancel_order — POST cancellation to /api/intercept."""
        payload = {
            "agent_id": self.agent_id,
            "action": "cancel",
            "kalshi_order_id": order_id,
        }

        headers = {"Content-Type": "application/json"}
        if self.bot_auth_token:
            headers["X-Bot-Token"] = self.bot_auth_token

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.intercept_url}/api/intercept/cancel",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Cancel intercept failed: {e}")
            raise


def create_proxy_client_for_bot(agent_id: str) -> ProxyKalshiClient | None:
    """
    Create a ProxyKalshiClient from environment variables.

    Called inside the bot subprocess. Reads:
      - KALSHI_API_KEY, KALSHI_PRIVATE_KEY (for market/balance reads)
      - AGENT_FUND_INTERCEPT_URL (our backend URL)
      - AGENT_FUND_AGENT_ID
      - AGENT_FUND_BOT_TOKEN (optional auth)
    """
    api_key = os.environ.get("KALSHI_API_KEY", "")
    private_key = os.environ.get("KALSHI_PRIVATE_KEY", "")
    intercept_url = os.environ.get("AGENT_FUND_INTERCEPT_URL", "http://localhost:8000")
    bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN")
    kalshi_base = os.environ.get("KALSHI_BASE_URL", "https://demo-api.kalshi.co/trade-api/v2")

    if not api_key or not private_key:
        logger.error("Missing KALSHI_API_KEY or KALSHI_PRIVATE_KEY")
        return None

    return ProxyKalshiClient(
        base_url=kalshi_base,
        api_key=api_key,
        private_key_pem=private_key,
        intercept_url=intercept_url,
        agent_id=agent_id,
        bot_auth_token=bot_token,
    )
