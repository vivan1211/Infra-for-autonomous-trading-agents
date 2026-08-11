"""Self-contained tests for PolymarketClient.place_order retry behavior.

Runs without pytest or the real py-clob-client-v2 SDK by stubbing the SDK
modules in sys.modules before importing the client. Mirrors the diagnostic-
script convention used by ../test_poly_order.py at the repo root.

Usage:
    python backend/polymarket/test_client_retry.py

Exit code: 0 on all-pass, 1 on any failure.
"""

import asyncio
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock


# ── Stub py_clob_client_v2 in sys.modules BEFORE importing client.py ──
# place_order imports OrderArgs/OrderType/PartialCreateOrderOptions/BUY/SELL
# from py_clob_client_v2 inside the function body, so we have to provide
# importable module objects for those paths.

class _StubPolyApiException(Exception):
    def __init__(self, status_code=None, error_msg="Request exception!"):
        self.status_code = status_code
        self.error_msg = error_msg
        super().__init__(
            f"PolyApiException[status_code={status_code}, error_message={error_msg}]"
        )


def _install_stubs():
    pkg = types.ModuleType("py_clob_client_v2")
    pkg.__path__ = []  # mark as a package so submodule imports resolve
    sys.modules["py_clob_client_v2"] = pkg

    clob_types = types.ModuleType("py_clob_client_v2.clob_types")
    clob_types.OrderArgs = MagicMock(name="OrderArgs")
    clob_types.PartialCreateOrderOptions = MagicMock(name="PartialCreateOrderOptions")
    clob_types.ApiCreds = MagicMock(name="ApiCreds")
    clob_types.OrderPayload = MagicMock(name="OrderPayload")

    class _OrderType:
        FOK = "FOK"
        GTC = "GTC"
    clob_types.OrderType = _OrderType
    sys.modules["py_clob_client_v2.clob_types"] = clob_types

    client_mod = types.ModuleType("py_clob_client_v2.client")
    client_mod.ClobClient = MagicMock(name="ClobClient")
    sys.modules["py_clob_client_v2.client"] = client_mod

    exceptions_mod = types.ModuleType("py_clob_client_v2.exceptions")
    exceptions_mod.PolyApiException = _StubPolyApiException
    sys.modules["py_clob_client_v2.exceptions"] = exceptions_mod

    order_builder_pkg = types.ModuleType("py_clob_client_v2.order_builder")
    order_builder_pkg.__path__ = []
    sys.modules["py_clob_client_v2.order_builder"] = order_builder_pkg

    constants_mod = types.ModuleType("py_clob_client_v2.order_builder.constants")
    constants_mod.BUY = "BUY"
    constants_mod.SELL = "SELL"
    sys.modules["py_clob_client_v2.order_builder.constants"] = constants_mod


_install_stubs()

# Make the `polymarket` package importable: client.py lives at
# backend/polymarket/client.py and uses no `backend.` prefix in its own
# imports, so we add backend/ to sys.path.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from polymarket import client as client_mod  # noqa: E402


# ── Test helpers ──

def _make_client_with_fake_clob(fake_post_order_side_effect):
    """Build a PolymarketClient with __init__ bypassed and a mocked CLOB."""
    fake_clob = MagicMock()
    fake_clob.create_order.return_value = MagicMock(name="signed_order")
    fake_clob.post_order.side_effect = fake_post_order_side_effect

    pc = client_mod.PolymarketClient.__new__(client_mod.PolymarketClient)
    pc._clob_client = fake_clob
    pc._funder_address = "0xfunder"

    async def fake_get_market(_):
        return {
            "_yes_token_id": "tok_yes",
            "_no_token_id": "tok_no",
            "_tick_size": "0.01",
            "_neg_risk": False,
            "yes_price": 0.5,
            "no_price": 0.5,
        }
    pc.get_market = fake_get_market

    return pc, fake_clob


async def _no_sleep(_seconds):
    """Replacement for asyncio.sleep to speed up tests."""
    return None


async def _retry_status_then_succeeds(status_code, error_msg):
    """Fail post_order with (status_code, error_msg) twice, then succeed. Returns
    (attempt_count, result). Used to assert a status is treated as retryable."""
    client_mod._PolyApiException = _StubPolyApiException
    call_count = {"n": 0}

    def fake_post(signed, otype):
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise _StubPolyApiException(status_code=status_code, error_msg=error_msg)
        return {"orderID": "0xok", "status": "matched"}

    pc, _ = _make_client_with_fake_clob(fake_post)
    orig_sleep = client_mod.asyncio.sleep
    client_mod.asyncio.sleep = _no_sleep
    try:
        result = await pc.place_order(ticker="cond", side="yes", action="buy", count=10, yes_price=50)
    finally:
        client_mod.asyncio.sleep = orig_sleep
    return call_count["n"], result


# ── Tests ──

async def test_retries_on_transport_error_then_succeeds():
    """Transport error (status_code=None) twice, then success on third attempt."""
    # Ensure the module-level exception ref points at our stub
    client_mod._PolyApiException = _StubPolyApiException

    call_count = {"n": 0}

    def fake_post(signed, otype):
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise _StubPolyApiException(status_code=None, error_msg="Request exception!")
        return {"orderID": "0xabc", "status": "live"}

    pc, fake_clob = _make_client_with_fake_clob(fake_post)

    original_sleep = client_mod.asyncio.sleep
    client_mod.asyncio.sleep = _no_sleep
    try:
        result = await pc.place_order(
            ticker="cond", side="yes", action="buy", count=10, yes_price=50,
        )
    finally:
        client_mod.asyncio.sleep = original_sleep

    assert call_count["n"] == 3, f"expected 3 attempts, got {call_count['n']}"
    assert result["order_id"] == "0xabc", f"expected order_id=0xabc, got {result.get('order_id')}"
    assert result["status"] == "live", f"expected status=live (un-normalized), got {result.get('status')}"


async def test_does_not_retry_on_server_error():
    """status_code != None means server responded — should NOT retry."""
    client_mod._PolyApiException = _StubPolyApiException

    call_count = {"n": 0}

    def fake_post(signed, otype):
        call_count["n"] += 1
        raise _StubPolyApiException(status_code=400, error_msg="bad request")

    pc, fake_clob = _make_client_with_fake_clob(fake_post)

    original_sleep = client_mod.asyncio.sleep
    client_mod.asyncio.sleep = _no_sleep
    raised = False
    try:
        await pc.place_order(
            ticker="cond", side="yes", action="buy", count=10, yes_price=50,
        )
    except _StubPolyApiException:
        raised = True
    finally:
        client_mod.asyncio.sleep = original_sleep

    assert raised, "expected PolyApiException to propagate"
    assert call_count["n"] == 1, f"expected 1 attempt (no retries), got {call_count['n']}"


async def test_retries_on_425_then_succeeds():
    """425 'order manager not ready' (matching-engine restart) is retryable."""
    n, result = await _retry_status_then_succeeds(425, "order manager not ready, please retry")
    assert n == 3, f"expected 3 attempts, got {n}"
    assert result["order_id"] == "0xok", f"got {result.get('order_id')}"
    assert result["status"] == "executed", f"'matched' should normalize to 'executed', got {result.get('status')}"


async def test_retries_on_429_then_succeeds():
    """429 rate-limit is retryable."""
    n, result = await _retry_status_then_succeeds(429, "Too Many Requests")
    assert n == 3, f"expected 3 attempts, got {n}"
    assert result["order_id"] == "0xok", f"got {result.get('order_id')}"


async def test_retries_on_503_postonly_then_succeeds():
    """503 with a post-only marker (the ~2-min window after a restart) is retryable."""
    n, result = await _retry_status_then_succeeds(
        503, "post-only mode: only post-only orders and cancels are allowed"
    )
    assert n == 3, f"expected 3 attempts, got {n}"
    assert result["order_id"] == "0xok", f"got {result.get('order_id')}"


async def test_terminal_503_non_postonly_not_retried():
    """A 503 WITHOUT the post-only marker is terminal — must NOT retry."""
    client_mod._PolyApiException = _StubPolyApiException
    call_count = {"n": 0}

    def fake_post(signed, otype):
        call_count["n"] += 1
        raise _StubPolyApiException(status_code=503, error_msg="service unavailable")

    pc, _ = _make_client_with_fake_clob(fake_post)
    orig_sleep = client_mod.asyncio.sleep
    client_mod.asyncio.sleep = _no_sleep
    raised = False
    try:
        await pc.place_order(ticker="cond", side="yes", action="buy", count=10, yes_price=50)
    except _StubPolyApiException:
        raised = True
    finally:
        client_mod.asyncio.sleep = orig_sleep
    assert raised, "expected terminal 503 to propagate"
    assert call_count["n"] == 1, f"expected 1 attempt (no retry), got {call_count['n']}"


async def test_budget_exhausted_raises_order_manager_unavailable():
    """A persistent 425 that outlasts the retry budget must raise
    PolymarketOrderManagerUnavailable (→ worker marks error → manual button),
    NOT loop forever and NOT re-raise the raw SDK error.

    We set the budget to 0 so the deadline is reached on the first failure — this
    is deterministic and avoids fighting asyncio's own use of time.monotonic. The
    retry-before-giving-up behavior is covered by the 425/429/503 success tests."""
    client_mod._PolyApiException = _StubPolyApiException
    call_count = {"n": 0}

    def fake_post(signed, otype):
        call_count["n"] += 1
        raise _StubPolyApiException(status_code=425, error_msg="order manager not ready, please retry")

    pc, _ = _make_client_with_fake_clob(fake_post)

    orig_sleep = client_mod.asyncio.sleep
    orig_budget = client_mod._ORDER_RETRY_BUDGET_S
    client_mod.asyncio.sleep = _no_sleep
    client_mod._ORDER_RETRY_BUDGET_S = 0.0  # deadline = now → exhaust immediately
    raised = None
    try:
        await pc.place_order(ticker="cond", side="yes", action="buy", count=10, yes_price=50)
    except client_mod.PolymarketOrderManagerUnavailable as e:
        raised = e
    except Exception as e:  # capture wrong type for a clear failure message
        raised = e
    finally:
        client_mod.asyncio.sleep = orig_sleep
        client_mod._ORDER_RETRY_BUDGET_S = orig_budget

    assert isinstance(raised, client_mod.PolymarketOrderManagerUnavailable), \
        f"expected PolymarketOrderManagerUnavailable, got {type(raised).__name__}: {raised}"
    assert call_count["n"] >= 1, f"expected at least one attempt, got {call_count['n']}"


async def test_does_not_retry_when_sdk_exception_unavailable():
    """If _PolyApiException is None (SDK import failed), no exception can match
    the transport-error guard. Any error must propagate immediately, not retry.
    Locks in the defensive guard at client.py line 209.
    """
    saved = client_mod._PolyApiException
    client_mod._PolyApiException = None

    call_count = {"n": 0}

    # Use a real PolyApiException-shaped instance, but the loop should NOT
    # treat it as transport because _PolyApiException is None.
    def fake_post(signed, otype):
        call_count["n"] += 1
        raise _StubPolyApiException(status_code=None, error_msg="Request exception!")

    pc, fake_clob = _make_client_with_fake_clob(fake_post)

    original_sleep = client_mod.asyncio.sleep
    client_mod.asyncio.sleep = _no_sleep
    raised = False
    try:
        await pc.place_order(
            ticker="cond", side="yes", action="buy", count=10, yes_price=50,
        )
    except _StubPolyApiException:
        raised = True
    finally:
        client_mod.asyncio.sleep = original_sleep
        client_mod._PolyApiException = saved

    assert raised, "expected the exception to propagate when SDK class is unknown"
    assert call_count["n"] == 1, f"expected no retries when guard is None, got {call_count['n']}"


async def test_unrelated_exception_is_not_retried():
    """Non-PolyApiException errors must propagate immediately, no retry."""
    client_mod._PolyApiException = _StubPolyApiException

    call_count = {"n": 0}

    def fake_post(signed, otype):
        call_count["n"] += 1
        raise ValueError("totally different bug")

    pc, fake_clob = _make_client_with_fake_clob(fake_post)

    original_sleep = client_mod.asyncio.sleep
    client_mod.asyncio.sleep = _no_sleep
    raised = False
    try:
        await pc.place_order(
            ticker="cond", side="yes", action="buy", count=10, yes_price=50,
        )
    except ValueError:
        raised = True
    finally:
        client_mod.asyncio.sleep = original_sleep

    assert raised, "expected ValueError to propagate"
    assert call_count["n"] == 1, f"expected 1 attempt (no retries for unrelated exc), got {call_count['n']}"


# ── Runner ──

async def _run():
    tests = [
        ("retries_on_transport_error_then_succeeds", test_retries_on_transport_error_then_succeeds),
        ("retries_on_425_then_succeeds", test_retries_on_425_then_succeeds),
        ("retries_on_429_then_succeeds", test_retries_on_429_then_succeeds),
        ("retries_on_503_postonly_then_succeeds", test_retries_on_503_postonly_then_succeeds),
        ("does_not_retry_on_server_error", test_does_not_retry_on_server_error),
        ("terminal_503_non_postonly_not_retried", test_terminal_503_non_postonly_not_retried),
        ("budget_exhausted_raises_order_manager_unavailable", test_budget_exhausted_raises_order_manager_unavailable),
        ("does_not_retry_when_sdk_exception_unavailable", test_does_not_retry_when_sdk_exception_unavailable),
        ("unrelated_exception_is_not_retried", test_unrelated_exception_is_not_retried),
    ]
    passed = 0
    failed = []
    for name, fn in tests:
        try:
            await fn()
            print(f"  PASS  {name}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {name}: {e}")
            failed.append(name)
        except Exception as e:
            print(f"  ERROR {name}: {type(e).__name__}: {e}")
            failed.append(name)

    print()
    print(f"Total: {len(tests)}, Passed: {passed}, Failed: {len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
