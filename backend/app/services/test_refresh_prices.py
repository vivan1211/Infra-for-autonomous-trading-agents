"""Self-contained tests for refresh_open_position_prices (no pytest needed).

Mirrors the stub-and-run pattern of backend/polymarket/test_client_retry.py.
Run: python backend/app/services/test_refresh_prices.py
Exit 0 = all pass, 1 = failure.
"""
import asyncio
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../backend
sys.path.insert(0, str(_BACKEND_DIR))


class FakeDB:
    """Captures fetch() rows and records execute() UPDATE calls."""
    def __init__(self, distinct_rows):
        self._distinct_rows = distinct_rows
        self.updates = []  # list of (sql, args)

    async def fetch(self, sql, *args):
        return self._distinct_rows

    async def execute(self, sql, *args):
        self.updates.append((sql, args))
        return "UPDATE 1"


def test_updates_yes_and_no_prices():
    """Polymarket market -> YES rows get yes_price, NO rows get no_price."""
    async def body():
        from app.services import portfolio_tracker as pt

        class FakePoly:
            def __init__(self, *a, **k): pass
            async def get_market(self, cid):
                return {"yes_price": 0.55, "no_price": 0.45, "close_time": "2026-05-31T00:00:00Z"}
            async def close(self): pass

        pt.PolymarketClient = FakePoly
        db = FakeDB([{"exchange": "polymarket", "market_ticker": "0xcond"}])
        await pt.refresh_open_position_prices(db)

        price_updates = [a for sql, a in db.updates if "current_price" in sql]
        close_updates = [a for sql, a in db.updates if "market_close_time" in sql]
        prices = sorted(a[0] for a in price_updates)
        assert prices == [0.45, 0.55], f"expected [0.45,0.55], got {prices}"
        assert len(price_updates) == 2, f"expected 2 price updates, got {len(price_updates)}"
        assert len(close_updates) == 1, f"expected 1 close backfill, got {len(close_updates)}"
        assert close_updates[0][0] == "2026-05-31T00:00:00Z", f"unexpected close arg {close_updates[0]}"
    asyncio.run(body())


def test_failed_fetch_skips_market_no_crash():
    """If get_market raises, that market is skipped (logged), no UPDATE, no exception."""
    async def body():
        from app.services import portfolio_tracker as pt

        class BoomPoly:
            def __init__(self, *a, **k): pass
            async def get_market(self, cid):
                raise RuntimeError("network down")
            async def close(self): pass

        pt.PolymarketClient = BoomPoly
        db = FakeDB([{"exchange": "polymarket", "market_ticker": "0xcond"}])
        await pt.refresh_open_position_prices(db)  # must not raise
        assert len(db.updates) == 0, f"expected 0 updates on failure, got {len(db.updates)}"
    asyncio.run(body())


def test_kalshi_midpoint_pricing():
    """Kalshi market -> yes_price = midpoint(yes_bid, yes_ask)."""
    async def body():
        from app.services import portfolio_tracker as pt

        class FakeKalshi:
            def __init__(self, *a, **k): pass
            async def get_market(self, ticker):
                return {"yes_bid_dollars": 0.60, "yes_ask_dollars": 0.64,
                        "no_bid_dollars": 0.36, "no_ask_dollars": 0.40,
                        "last_price_dollars": 0.61, "close_time": "2026-05-31T18:10:00Z"}

        pt.KalshiClient = FakeKalshi
        db = FakeDB([{"exchange": "kalshi", "market_ticker": "KXSOMETHING"}])
        await pt.refresh_open_position_prices(db)
        prices = sorted(round(a[0], 4) for sql, a in db.updates if "current_price" in sql)
        # yes_price = (0.60+0.64)/2 = 0.62 ; no_price = 1 - 0.62 = 0.38
        assert prices == [0.38, 0.62], f"expected [0.38,0.62], got {prices}"
    asyncio.run(body())


def test_no_close_time_no_backfill():
    """A market that returns no close date produces no market_close_time UPDATE."""
    async def body():
        from app.services import portfolio_tracker as pt

        class FakePoly:
            def __init__(self, *a, **k): pass
            async def get_market(self, cid):
                return {"yes_price": 0.55, "no_price": 0.45}  # no close_time
            async def close(self): pass

        pt.PolymarketClient = FakePoly
        db = FakeDB([{"exchange": "polymarket", "market_ticker": "0xcond"}])
        await pt.refresh_open_position_prices(db)
        close_updates = [a for sql, a in db.updates if "market_close_time" in sql]
        assert len(close_updates) == 0, f"expected no close backfill, got {len(close_updates)}"
    asyncio.run(body())


def _main():
    tests = [
        ("updates_yes_and_no_prices", test_updates_yes_and_no_prices),
        ("failed_fetch_skips_market_no_crash", test_failed_fetch_skips_market_no_crash),
        ("kalshi_midpoint_pricing", test_kalshi_midpoint_pricing),
        ("no_close_time_no_backfill", test_no_close_time_no_backfill),
    ]
    failed = []
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as e:
            print(f"  FAIL  {name}: {e}")
            failed.append(name)
        except Exception as e:
            print(f"  ERROR {name}: {type(e).__name__}: {e}")
            failed.append(name)
    print(f"\nTotal {len(tests)}, Passed {len(tests) - len(failed)}, Failed {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_main())
