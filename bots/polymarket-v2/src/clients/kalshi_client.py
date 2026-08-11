"""Compatibility shim — re-exports PolymarketClient as KalshiClient.

All copied ensemble code does `from src.clients.kalshi_client import KalshiClient`.
This shim ensures that import resolves to PolymarketClient without any
sys.path or sys.modules hacking.
"""

from src.clients.polymarket_client import PolymarketClient as KalshiClient
from src.clients.polymarket_client import PolymarketAPIError as KalshiAPIError

__all__ = ["KalshiClient", "KalshiAPIError"]
