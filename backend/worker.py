"""Queue-based bot worker — picks up jobs from Redis (via arq) and runs bot cycles.

Each job spawns an isolated subprocess per cycle:
- No os.environ mutation (explicit env dict per subprocess)
- Captures stdout/stderr line-by-line
- Forwards logs to backend via POST /api/bot/log
- Sends periodic heartbeats via POST /api/bot/heartbeat
- Marks cycle completed on exit

Run with: arq backend.worker.WorkerSettings
"""

import os
import re
import sys
import json
import asyncio
import logging
import signal
from pathlib import Path

import httpx
from arq.connections import RedisSettings

# Add backend package to path so we can import the credentials helper
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.services.encryption import write_credentials_file, cleanup_credentials_file

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")

# ── Paths ──
# When running in Docker, bots/ is at /app/bots/
# When running locally, bots/ is relative to the repo root
WORKER_DIR = Path(__file__).resolve().parent
BOTS_DIR = WORKER_DIR.parent / "bots"
if not BOTS_DIR.exists():
    # Docker layout: /app/bots/
    BOTS_DIR = Path("/app/bots")

# ── Bot configs (same as bot_runner/manager.py) ──
BOT_CONFIGS = {
    "polymarket-v2": {
        "dir": "polymarket-v2",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
    "kalshi-v2": {
        "dir": "kalshi-v2",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
    "polymarket-superforecaster": {
        "dir": "superforecaster-poly",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
    "kalshi-superforecaster": {
        "dir": "superforecaster-kalshi",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
    "polymarket-tail-buyer": {
        "dir": "tail-buyer-poly",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
    "kalshi-tail-buyer": {
        "dir": "tail-buyer-kalshi",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
}

# System env vars to forward to subprocess (safe, no secrets)
_SYSTEM_ENV_KEYS = (
    "PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "SHELL", "TMPDIR",
    "PYTHONPATH", "VIRTUAL_ENV", "CONDA_PREFIX", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH",
)

# Backend URL for log forwarding + job config (REQUIRED — must point to commandOS, not self)
BACKEND_URL = os.environ.get("AGENT_FUND_BACKEND_URL", "")
if not BACKEND_URL:
    logger.error("AGENT_FUND_BACKEND_URL not set — worker cannot forward logs or fetch config. Set this to the commandOS URL.")
if BACKEND_URL and not BACKEND_URL.startswith("http"):
    BACKEND_URL = f"https://{BACKEND_URL}"

WORKER_SECRET = os.environ.get("WORKER_SHARED_SECRET", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


def _redact_sensitive(text: str) -> str:
    """Redact credentials, keys, tokens, and addresses from log text."""
    text = re.sub(r'(sk-[a-zA-Z0-9]{20,})', '[REDACTED_KEY]', text)
    text = re.sub(r'(KXUSER-[a-zA-Z0-9-]+)', '[REDACTED_KALSHI_KEY]', text)
    text = re.sub(r'(0x[a-fA-F0-9]{40,})', '[REDACTED_ADDRESS]', text)
    text = re.sub(r'-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----', '[REDACTED_PEM]', text)
    text = re.sub(r'(eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+)', '[REDACTED_JWT]', text)
    text = re.sub(r'(key[_=:\s]+["\']?[a-zA-Z0-9_-]{32,})', '[REDACTED]', text, flags=re.IGNORECASE)
    return text


def _extract_log_level(line: str) -> str:
    """Detect log level from line content (mirrors bot_runner logic)."""
    lower = line.lower()
    if "[error]" in lower:
        return "error"
    if "[warning]" in lower or "warn" in lower[:30]:
        return "warn"
    if any(kw in line for kw in ['TRADE', 'Executed position', 'PAPER TRADE', 'order', 'position', 'PnL']):
        return "trade"
    return "info"


def _clean_log_message(msg: str) -> str:
    """Clean structured log formatting (mirrors bot_runner logic)."""
    # Strip ANSI escape codes
    msg = re.sub(r'\x1b\[[0-9;]*m', '', msg)
    msg = re.sub(r'\[\d+m', '', msg)
    # Extract human-readable message from nested log format
    inner_match = re.search(r'\[\w+\s*\]\s+(.+)', msg)
    if inner_match:
        candidate = inner_match.group(1)
        deeper = re.search(r'\[\w+\s*\]\s+(.+)', candidate)
        msg = deeper.group(1) if deeper else candidate
    # Remove trailing module tags
    msg = re.sub(r'\s*\[[\w.]+\]\s*$', '', msg)
    msg = re.sub(r'^[\w.]+:\s*', '', msg)
    msg = re.sub(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]?\d*\s*', '', msg)
    return msg.strip()[:300]


async def fetch_job_config(cycle_id: str, cycle_token: str | None = None) -> dict | None:
    """Fetch env vars for a cycle from the backend API.

    Security fix 3D: config and credentials are fetched from separate endpoints
    and merged here. This ensures credentials are never returned alongside
    configuration data (reducing exposure if config responses are logged/intercepted).

    cycle_token: per-cycle bearer token (primary auth). Falls back to
    WORKER_SHARED_SECRET for backward compatibility during rolling deploys.
    """
    try:
        # Build auth headers: prefer per-cycle token, keep shared secret as fallback
        headers: dict[str, str] = {"X-Worker-Token": WORKER_SECRET}
        if cycle_token:
            headers["X-Cycle-Token"] = cycle_token

        async with httpx.AsyncClient(timeout=30) as client:
            # 1. Fetch non-credential config
            resp = await client.get(
                f"{BACKEND_URL}/api/bot/job-config/{cycle_id}",
                headers=headers,
            )
            if resp.status_code == 404:
                logger.warning(f"Cycle {cycle_id[:8]} no longer active (404)")
                return None
            resp.raise_for_status()
            config_data = resp.json()

            # 2. Fetch credentials separately
            cred_resp = await client.get(
                f"{BACKEND_URL}/api/bot/job-credentials/{cycle_id}",
                headers=headers,
            )
            if cred_resp.status_code == 404:
                logger.warning(f"Cycle {cycle_id[:8]} credentials not found (404)")
                return None
            cred_resp.raise_for_status()
            cred_data = cred_resp.json()

            # 3. Merge credentials into env_vars
            env_vars = config_data.get("env_vars", {})
            env_vars.update(cred_data.get("credentials", {}))
            config_data["env_vars"] = env_vars

            return config_data
    except Exception as e:
        logger.error(f"Failed to fetch job config for cycle {cycle_id[:8]}: {e}")
        return None


async def forward_log(
    client: httpx.AsyncClient,
    agent_id: str,
    bot_token: str,
    level: str,
    message: str,
    environment: str = "training",
    market_title: str | None = None,
):
    """Forward a log line to the backend via POST /api/bot/log."""
    try:
        await client.post(
            f"{BACKEND_URL}/api/bot/log",
            json={
                "agent_id": agent_id,
                "level": level,
                "message": message,
                "environment": environment,
                "market_title": market_title,
            },
            headers={"X-Bot-Token": bot_token},
        )
    except Exception:
        pass  # Non-critical — log forwarding failures shouldn't crash the worker


async def send_heartbeat(client: httpx.AsyncClient, agent_id: str, cycle_id: str, cycle_token: str | None = None):
    """Send a heartbeat to the backend to extend the cycle lease."""
    try:
        await client.post(
            f"{BACKEND_URL}/api/bot/heartbeat",
            json={"agent_id": agent_id, "cycle_id": cycle_id},
            headers={"X-Cycle-Token": cycle_token or ""},
        )
    except Exception as e:
        logger.warning(f"Heartbeat failed for agent {agent_id[:8]}: {e}")


async def complete_cycle(agent_id: str, cycle_id: str, cycle_token: str | None = None):
    """Mark cycle as completed in the backend DB."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{BACKEND_URL}/api/bot/cycle-complete",
                json={"agent_id": agent_id, "cycle_id": cycle_id},
                headers={"X-Cycle-Token": cycle_token or ""},
            )
    except Exception as e:
        logger.error(f"Failed to mark cycle {cycle_id[:8]} complete: {e}")


async def capture_and_forward(
    process: asyncio.subprocess.Process,
    agent_id: str,
    bot_token: str,
    cycle_id: str,
    cycle_token: str | None = None,
    environment: str = "training",
):
    """Capture subprocess stdout/stderr and forward to backend."""
    async with httpx.AsyncClient(timeout=15) as client:
        heartbeat_interval = 60  # seconds
        last_heartbeat = asyncio.get_event_loop().time()
        _stop_requested = False

        async def check_agent_status():
            """Poll agent status every 10s — kill subprocess if agent was stopped."""
            nonlocal _stop_requested
            while process.returncode is None:
                await asyncio.sleep(10)
                try:
                    status_headers: dict[str, str] = {"X-Worker-Token": WORKER_SECRET}
                    if cycle_token:
                        status_headers["X-Cycle-Token"] = cycle_token
                    resp = await client.get(
                        f"{BACKEND_URL}/api/bot/job-config/{cycle_id}",
                        headers=status_headers,
                    )
                    if resp.status_code == 404:
                        # Agent no longer active for this cycle — user clicked Stop
                        logger.info(f"Agent {agent_id[:8]} stopped by user — killing subprocess")
                        _stop_requested = True
                        try:
                            process.terminate()
                            await asyncio.wait_for(process.wait(), timeout=5)
                        except Exception:
                            process.kill()
                        return
                except Exception:
                    pass  # Network blip — don't kill on transient errors

        async def stream_pipe(pipe, default_level: str):
            nonlocal last_heartbeat
            while True:
                try:
                    line = await asyncio.wait_for(pipe.readline(), timeout=1.0)
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if not decoded:
                        continue

                    # Redact sensitive data
                    safe = _redact_sensitive(decoded)
                    logger.info(f"[{agent_id[:8]}] {safe[:200]}")

                    # Clean and forward
                    level = _extract_log_level(decoded) if default_level == "info" else default_level
                    msg = _clean_log_message(safe)
                    if msg:
                        await forward_log(client, agent_id, bot_token, level, msg, environment)

                    # Periodic heartbeat
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat > heartbeat_interval:
                        await send_heartbeat(client, agent_id, cycle_id, cycle_token)
                        last_heartbeat = now

                except asyncio.TimeoutError:
                    # Check heartbeat on timeout too
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat > heartbeat_interval:
                        await send_heartbeat(client, agent_id, cycle_id, cycle_token)
                        last_heartbeat = now
                    continue
                except asyncio.CancelledError:
                    break

        tasks = []
        if process.stdout:
            tasks.append(asyncio.create_task(stream_pipe(process.stdout, "info")))
        if process.stderr:
            tasks.append(asyncio.create_task(stream_pipe(process.stderr, "error")))
        # Background status checker — kills subprocess if user clicks Stop
        status_task = asyncio.create_task(check_agent_status())

        # Wait for process to finish with timeout (prevents indefinite hang)
        try:
            await asyncio.wait_for(process.wait(), timeout=2700)  # 45 min (under arq's 46 min job_timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Process for {agent_id[:8]} timed out — killing")
            try:
                process.kill()
                await asyncio.wait_for(process.wait(), timeout=5)
            except Exception:
                pass

        # Cancel status checker
        status_task.cancel()
        try:
            await status_task
        except (asyncio.CancelledError, Exception):
            pass

        # Wait for stream tasks to drain remaining pipe data (they exit on EOF)
        # Use generous timeout — each log line forwarded via HTTP takes ~400ms
        if tasks:
            try:
                await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=30.0)
            except asyncio.TimeoutError:
                logger.warning(f"Stream drain timed out for {agent_id[:8]} — cancelling")
                for t in tasks:
                    t.cancel()
                    try:
                        await t
                    except (asyncio.CancelledError, Exception):
                        pass


# ── arq job handler ──

async def run_bot_cycle(ctx, agent_id: str, bot_type: str, cycle_id: str, config_snapshot_id: str, cycle_token: str | None = None):
    """arq job: spawn a bot subprocess, capture output, forward logs.

    cycle_token: per-cycle bearer token for authenticating to credential
    endpoints. None for jobs enqueued before the per-cycle token rollout
    (backward compat — falls back to WORKER_SHARED_SECRET).
    """
    logger.info(f"Starting cycle {cycle_id[:8]} for agent {agent_id[:8]} ({bot_type})")

    # 1. Fetch runtime config + decrypted creds from backend API
    config_data = await fetch_job_config(cycle_id, cycle_token=cycle_token)
    if not config_data:
        logger.warning(f"Cycle {cycle_id[:8]} — no config returned, aborting")
        await complete_cycle(agent_id, cycle_id, cycle_token)
        return

    env_vars = config_data.get("env_vars", {})
    bot_token = env_vars.get("AGENT_FUND_BOT_TOKEN", "")
    mode = env_vars.get("AGENT_FUND_MODE", "training")
    environment = "actual" if mode == "live" else "training"

    # 2. Build subprocess environment (isolated, no os.environ mutation)
    bot_config = BOT_CONFIGS.get(bot_type)
    if not bot_config:
        logger.error(f"Unknown bot type: {bot_type}")
        await complete_cycle(agent_id, cycle_id, cycle_token)
        return

    bot_dir = BOTS_DIR / bot_config["dir"]
    if not bot_dir.exists():
        logger.error(f"Bot directory not found: {bot_dir}")
        await complete_cycle(agent_id, cycle_id, cycle_token)
        return

    # Start with system vars from THIS process (safe, no secrets)
    subprocess_env = {k: v for k, v in os.environ.items() if k in _SYSTEM_ENV_KEYS}
    # Merge in job-specific vars (credentials, config, etc.)
    subprocess_env.update(env_vars)
    # Queue workers always run single-cycle mode
    subprocess_env["AGENT_FUND_SINGLE_CYCLE"] = "true"
    subprocess_env["AGENT_FUND_CYCLE_ID"] = cycle_id

    # Security fix 3C: write credentials to temp file instead of env vars
    # so they're not visible via /proc/pid/environ
    subprocess_env, creds_file = write_credentials_file(subprocess_env)

    # 3. Spawn subprocess
    try:
        process = await asyncio.create_subprocess_exec(
            *bot_config["cmd"],
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(bot_dir),
            env=subprocess_env,  # Explicit env dict — no pollution of worker process
        )
        logger.info(f"Bot subprocess started (pid={process.pid}) for cycle {cycle_id[:8]}")

        # Forward startup log
        async with httpx.AsyncClient(timeout=10) as client:
            await forward_log(
                client, agent_id, bot_token, "info",
                f"Bot cycle started ({bot_type})", environment,
            )

    except Exception as e:
        logger.error(f"Failed to spawn subprocess for cycle {cycle_id[:8]}: {e}")
        cleanup_credentials_file(creds_file)
        return

    # 4. Capture stdout/stderr and forward to backend
    try:
        await capture_and_forward(process, agent_id, bot_token, cycle_id, cycle_token, environment)
    except Exception as e:
        logger.error(f"Error during cycle {cycle_id[:8]} capture: {e}")
        # Try to kill the subprocess if it's still running
        if process.returncode is None:
            try:
                process.kill()
                await process.wait()
            except Exception:
                pass
    finally:
        # Always clean up the credentials temp file
        cleanup_credentials_file(creds_file)

    # 5. Mark cycle completed
    exit_code = process.returncode
    logger.info(f"Cycle {cycle_id[:8]} finished (exit_code={exit_code})")
    await complete_cycle(agent_id, cycle_id, cycle_token)

    # Forward completion log
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            status = "completed" if exit_code == 0 else f"exited with code {exit_code}"
            await forward_log(client, agent_id, bot_token, "info", f"Bot cycle {status}", environment)
    except Exception:
        pass


# ── Polymarket order execution (runs in worker where py-clob-client is installed) ──

async def execute_polymarket_order(
    ctx,
    queue_id: str,
    cycle_id: str,
    ticker: str,
    side: str,
    action: str,
    count: int,
    yes_price: int | None,
    no_price: int | None,
    order_type: str = "limit",
    cycle_token: str | None = None,
    trade_id: str | None = None,
):
    """Execute a Polymarket CLOB order. Called by orchestrator when py-clob-client isn't available on backend.

    Credential scoping: normal cycle-driven orders pass `cycle_id` and fetch creds
    scoped to the active running cycle. A MANUAL retry (from the Retry button) has no
    active cycle, so it passes `trade_id` instead and fetches creds scoped to that
    trade. Exactly one of cycle_id / trade_id must be present.
    """
    logger.info(f"Executing Polymarket order: {action} {side} {ticker} x{count} (queue={queue_id[:8]})")

    result = {"status": "error", "order_id": None, "error": None}

    if not cycle_id and not trade_id:
        result["error"] = "No cycle_id or trade_id provided — cannot fetch credentials"
        logger.error(f"Polymarket order {queue_id[:8]} missing cycle_id/trade_id")
    else:
        try:
            # Fetch credentials: cycle-scoped (normal) or trade-scoped (manual retry).
            async with httpx.AsyncClient(timeout=15) as http:
                cred_headers: dict[str, str] = {"X-Worker-Token": WORKER_SECRET}
                if cycle_id:
                    if cycle_token:
                        cred_headers["X-Cycle-Token"] = cycle_token
                    cred_resp = await http.get(
                        f"{BACKEND_URL}/api/internal/polymarket-credentials",
                        params={"cycle_id": cycle_id},
                        headers=cred_headers,
                    )
                else:
                    # Manual retry: no active cycle — fetch creds scoped to the trade.
                    cred_resp = await http.get(
                        f"{BACKEND_URL}/api/internal/polymarket-credentials-for-trade",
                        params={"trade_id": trade_id},
                        headers=cred_headers,
                    )
                cred_resp.raise_for_status()
                creds = cred_resp.json()

            private_key = creds["private_key"]
            funder_address = creds.get("funder_address", "")

            # Use the backend's Polymarket client (copied into worker container)
            # This calls CLOB directly — no intercept routing
            from polymarket.client import PolymarketClient

            client = PolymarketClient(private_key=private_key, funder_address=funder_address)
            order = await client.place_order(
                ticker=ticker,
                side=side,
                action=action,
                count=count,
                yes_price=yes_price,
                no_price=no_price,
                type_=order_type,
            )
            await client.close()

            order_id = order.get("order_id", "")
            order_status = order.get("status", "").lower()

            if order_status in ("matched", "executed"):
                result = {"status": "executed", "order_id": order_id, "error": None}
            elif order_status in ("live",):
                # Resting on the book as a GTC limit order — not yet filled
                result = {"status": "pending_fill", "order_id": order_id, "error": None}
            else:
                # FOK cancelled, dead, or unknown status — treat as error
                result = {"status": "error", "order_id": order_id, "error": f"CLOB returned status: {order_status}"}

            logger.info(f"Polymarket order result: order_id={order_id} status={order_status}")

        except ImportError as e:
            # This shouldn't happen in the worker container, but just in case
            result["error"] = f"Import error: {e}"
            logger.error(f"Polymarket SDK not available in worker: {e}")
        except Exception as e:
            result["error"] = str(e)[:300]
            logger.error(f"Polymarket order failed: {e}")

    # Report result back to backend
    try:
        result_headers: dict[str, str] = {"X-Worker-Token": WORKER_SECRET}
        if cycle_token:
            result_headers["X-Cycle-Token"] = cycle_token
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{BACKEND_URL}/api/bot/execution-result",
                json={
                    "queue_id": queue_id,
                    "cycle_id": cycle_id,
                    "status": result["status"],
                    "order_id": result["order_id"],
                    "error": result["error"],
                },
                headers=result_headers,
            )
    except Exception as e:
        logger.error(f"Failed to report execution result: {e}")

    return result


# ── arq WorkerSettings ──

class WorkerSettings:
    """arq worker configuration."""
    functions = [run_bot_cycle, execute_polymarket_order]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    max_jobs = 3              # concurrent bot cycles per worker replica
    job_timeout = 2760        # 46 min max per cycle — must stay ~60s above worker.py:318 subprocess cap to leave cleanup margin
    health_check_interval = 30
    keep_result = 300         # keep result for 5 min (for debugging)
    retry_jobs = False        # don't auto-retry — scheduler will requeue via lease expiry
