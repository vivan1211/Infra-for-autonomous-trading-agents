"""Bot process manager — start, stop, monitor bot subprocesses.

In the proxy-intercept architecture, bots run independently with their own
Kalshi clients. We capture their stdout for reasoning/logging and their
place_order() calls are intercepted via ProxyKalshiClient -> /api/intercept.

Multi-user: processes are keyed by user_agent_id (UUID) so multiple users
can run the same bot type simultaneously.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import os
from typing import Optional
from pathlib import Path
from datetime import datetime

from app.services.encryption import write_credentials_file, cleanup_credentials_file

logger = logging.getLogger(__name__)

# Active bot processes: user_agent_id -> BotProcess
_processes: dict[str, "BotProcess"] = {}

# Reasoning buffers: user_agent_id -> list of stdout lines for current cycle
_reasoning_buffers: dict[str, list[str]] = {}

# Base path where forked bots live
# In Docker: /app/bots/ (copied by Dockerfile). Locally: ../../bots/ relative to this file.
_local_bots = Path(__file__).parent.parent.parent / "bots"
_docker_bots = Path(__file__).parent.parent / "bots"
BOTS_DIR = _docker_bots if _docker_bots.exists() else _local_bots


class BotProcess:
    """Wrapper around a bot subprocess with stdout streaming."""

    def __init__(self, agent_id: str, process: asyncio.subprocess.Process, mode: str = "training", user_id: str | None = None, creds_file: str | None = None):
        self.agent_id = agent_id  # user_agent_id (UUID string)
        self.process = process
        self.pid = process.pid
        self.mode = mode  # Track agent mode for correct environment in broadcasts
        self.user_id = user_id  # For WS broadcast routing
        self.creds_file = creds_file  # Temp file path for credentials (cleaned up on stop)
        self.started_at = datetime.utcnow()
        self._stdout_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self.crash_count = 0
        self.last_crash: Optional[datetime] = None

    @property
    def is_running(self) -> bool:
        return self.process.returncode is None

    @property
    def uptime_seconds(self) -> float:
        return (datetime.utcnow() - self.started_at).total_seconds()

    def start_stdout_capture(self):
        """Start async tasks to stream stdout and stderr."""
        if self.process.stdout:
            self._stdout_task = asyncio.create_task(self._stream_stdout())
        if self.process.stderr:
            self._stderr_task = asyncio.create_task(self._stream_stderr())

    @staticmethod
    def _redact_sensitive(text: str) -> str:
        """Redact credentials, keys, tokens, and addresses from log text."""
        import re
        text = re.sub(r'(sk-[a-zA-Z0-9]{20,})', '[REDACTED_KEY]', text)
        text = re.sub(r'(KXUSER-[a-zA-Z0-9-]+)', '[REDACTED_KALSHI_KEY]', text)
        text = re.sub(r'(0x[a-fA-F0-9]{40,})', '[REDACTED_ADDRESS]', text)
        text = re.sub(r'-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----', '[REDACTED_PEM]', text)
        text = re.sub(r'(eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+)', '[REDACTED_JWT]', text)
        text = re.sub(r'(key[_=:\s]+["\']?[a-zA-Z0-9_-]{32,})', '[REDACTED]', text, flags=re.IGNORECASE)
        return text

    async def _stream_stdout(self):
        """Stream stdout line by line, buffering for reasoning capture."""
        try:
            from app.routers.ws import broadcast_log
            logger.info(f"[{self.agent_id}] broadcast_log imported successfully - WS broadcast enabled")
        except ImportError as e:
            broadcast_log = None
            logger.warning(f"[{self.agent_id}] broadcast_log import FAILED: {e} - WS broadcast DISABLED")

        try:
            while self.is_running and self.process.stdout:
                try:
                    line = await asyncio.wait_for(
                        self.process.stdout.readline(), timeout=1.0
                    )
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if decoded:
                        # Buffer for reasoning capture
                        buffer_reasoning(self.agent_id, decoded)
                        # Redact BEFORE logging to prevent credential leaks in server logs
                        safe_decoded = self._redact_sensitive(decoded)
                        logger.info(f"[{self.agent_id}] {safe_decoded[:500]}")
                        # Broadcast to WebSocket for live terminal
                        if broadcast_log and self.user_id:
                            # Extract log level from structured log lines
                            level = "info"
                            lower = decoded.lower()
                            if "[error]" in lower:
                                level = "error"
                            elif "[warning]" in lower or "warn" in lower[:30]:
                                level = "warn"

                            import re
                            msg = decoded

                            # 1. Strip ANSI escape codes (colors, bold, etc.)
                            msg = re.sub(r'\x1b\[[0-9;]*m', '', msg)
                            # Also strip escaped versions that may come through
                            msg = re.sub(r'\[\d+m', '', msg)

                            # 2. Extract the human-readable message from nested log format
                            inner_match = re.search(r'\[\w+\s*\]\s+(.+)', msg)
                            if inner_match:
                                candidate = inner_match.group(1)
                                deeper = re.search(r'\[\w+\s*\]\s+(.+)', candidate)
                                if deeper:
                                    msg = deeper.group(1)
                                else:
                                    msg = candidate

                            # 3. Remove trailing module tags like " [trading_system.unified_trading_system]"
                            msg = re.sub(r'\s*\[[\w.]+\]\s*$', '', msg)
                            msg = re.sub(r'^[\w.]+:\s*', '', msg)
                            msg = re.sub(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]?\d*\s*', '', msg)

                            # 4. Detect trade-related messages for "trade" level
                            if any(kw in msg for kw in ['TRADE', 'Executed position', 'PAPER TRADE', 'order', 'position', 'PnL']):
                                level = "trade"
                            elif any(kw in msg for kw in ['EDGE APPROVED', 'EDGE REJECTED', 'opportunities']):
                                level = "info"

                            # 5. Sanitize sensitive data before broadcasting
                            msg = self._redact_sensitive(msg)

                            msg = msg.strip()[:300]
                            env = "actual" if self.mode == "live" else "training"
                            try:
                                await broadcast_log(self.user_id, self.agent_id, level, msg, environment=env)
                            except Exception as e:
                                logger.error(f"[{self.agent_id}] broadcast_log FAILED: {e}")
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Stdout stream error for {self.agent_id}: {e}")

    async def _stream_stderr(self):
        """Stream stderr for error logging."""
        try:
            from app.routers.ws import broadcast_log
        except ImportError:
            broadcast_log = None

        try:
            while self.is_running and self.process.stderr:
                try:
                    line = await asyncio.wait_for(
                        self.process.stderr.readline(), timeout=1.0
                    )
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if decoded:
                        safe_decoded = self._redact_sensitive(decoded)
                        logger.warning(f"[{self.agent_id}:stderr] {safe_decoded[:500]}")
                        # Broadcast stderr to live terminal as errors (redacted)
                        if broadcast_log and self.user_id:
                            env = "actual" if self.mode == "live" else "training"
                            try:
                                await broadcast_log(self.user_id, self.agent_id, "error", safe_decoded[:300], environment=env)
                            except Exception:
                                pass
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Stderr stream error for {self.agent_id}: {e}")

    async def stop(self, timeout: float = 5.0):
        """Gracefully stop the bot process."""
        if not self.is_running:
            return

        # Cancel stream tasks
        if self._stdout_task:
            self._stdout_task.cancel()
        if self._stderr_task:
            self._stderr_task.cancel()

        try:
            self.process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(self.process.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning(f"Bot {self.agent_id} didn't stop after {timeout}s SIGTERM, sending SIGKILL")
                self.process.kill()
                try:
                    await asyncio.wait_for(self.process.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    logger.error(f"Bot {self.agent_id} didn't die after SIGKILL — orphan process pid={self.pid}")
        except ProcessLookupError:
            pass  # Already dead

        cleanup_credentials_file(self.creds_file)
        logger.info(f"Bot {self.agent_id} stopped (pid={self.pid})")

    async def kill(self):
        """Force kill the bot process."""
        if self._stdout_task:
            self._stdout_task.cancel()
        if self._stderr_task:
            self._stderr_task.cancel()

        if self.is_running:
            self.process.kill()
            await self.process.wait()
        cleanup_credentials_file(self.creds_file)
        logger.warning(f"Bot {self.agent_id} killed (pid={self.pid})")


# Bot adapter configs: how to launch each bot (keyed by bot_type_id)
BOT_CONFIGS = {
    # All active bots are now managed via worker.py BOT_CONFIGS (arq queue mode).
    # This dict is kept for backward compatibility with the manager module interface.
    "polymarket-tail-buyer": {
        "dir": "tail-buyer-poly",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
    "kalshi-tail-buyer": {
        "dir": "tail-buyer-kalshi",
        "cmd": ["python", "-u", "agent_fund_patch.py"],
    },
}


# ── Reasoning buffer management ──

def buffer_reasoning(agent_id: str, line: str):
    """Add a line to the agent's reasoning buffer."""
    if agent_id not in _reasoning_buffers:
        _reasoning_buffers[agent_id] = []
    _reasoning_buffers[agent_id].append(line)
    # Cap buffer at 500 lines to prevent memory issues
    if len(_reasoning_buffers[agent_id]) > 500:
        _reasoning_buffers[agent_id] = _reasoning_buffers[agent_id][-500:]


def flush_reasoning(agent_id: str) -> str:
    """Flush and return the reasoning buffer for an agent."""
    lines = _reasoning_buffers.pop(agent_id, [])
    return "\n".join(lines)


def get_reasoning_buffer(agent_id: str) -> str:
    """Get current reasoning buffer without flushing."""
    return "\n".join(_reasoning_buffers.get(agent_id, []))


# ── Bot lifecycle ──

async def start_bot(
    bot_type_id: str,
    mode: str,
    env_vars: dict[str, str] | None = None,
    user_agent_id: str | None = None,
    user_id: str | None = None,
) -> Optional[BotProcess]:
    """
    Start a bot subprocess.

    Args:
        bot_type_id: The bot type (e.g. 'ensemble-5') for BOT_CONFIGS lookup.
        mode: 'paper' or 'live'.
        env_vars: Environment variables to inject (credentials, etc).
        user_agent_id: The user_agents.id UUID string (process key for multi-user).
        user_id: The user's UUID string (for WS broadcast routing).
    """
    # Process key: use user_agent_id if provided, fall back to bot_type_id
    process_key = user_agent_id or bot_type_id

    if process_key in _processes and _processes[process_key].is_running:
        logger.warning(f"Bot {process_key} already running")
        return _processes[process_key]

    config = BOT_CONFIGS.get(bot_type_id)
    if not config:
        logger.error(f"No bot config for bot_type_id={bot_type_id}")
        return None

    bot_dir = BOTS_DIR / config["dir"]
    if not bot_dir.exists():
        logger.error(f"Bot directory not found: {bot_dir}")
        return None

    # Build clean environment — only inject required system + bot-specific keys
    # Start with minimal system vars needed for subprocess execution
    _SYSTEM_ENV_KEYS = ("PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "SHELL", "TMPDIR", "PYTHONPATH", "VIRTUAL_ENV", "CONDA_PREFIX", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH")
    env = {k: v for k, v in os.environ.items() if k in _SYSTEM_ENV_KEYS}

    # Infrastructure vars
    env["AGENT_FUND_MODE"] = mode
    env["AGENT_FUND_AGENT_ID"] = process_key  # The user_agent UUID the bot uses for /api/intercept
    env["AGENT_FUND_BOT_TYPE"] = bot_type_id
    env["AGENT_FUND_INTERCEPT_URL"] = os.environ.get(
        "AGENT_FUND_INTERCEPT_URL", "http://localhost:8000"
    )

    # Inject bot-specific env vars (AI API keys isolated per bot)
    if env_vars:
        for key in config.get("bot_env_keys", []):
            if key in env_vars:
                env[key] = env_vars[key]
        # Kalshi credentials for market reads
        if "KALSHI_API_KEY" in env_vars:
            env["KALSHI_API_KEY"] = env_vars["KALSHI_API_KEY"]
        if "KALSHI_PRIVATE_KEY" in env_vars:
            env["KALSHI_PRIVATE_KEY"] = env_vars["KALSHI_PRIVATE_KEY"]
        if "KALSHI_BASE_URL" in env_vars:
            env["KALSHI_BASE_URL"] = env_vars["KALSHI_BASE_URL"]
        # Polymarket credentials
        if "POLYMARKET_PRIVATE_KEY" in env_vars:
            env["POLYMARKET_PRIVATE_KEY"] = env_vars["POLYMARKET_PRIVATE_KEY"]
        if "POLYMARKET_FUNDER_ADDRESS" in env_vars:
            env["POLYMARKET_FUNDER_ADDRESS"] = env_vars["POLYMARKET_FUNDER_ADDRESS"]
        # Bot auth token for intercept endpoint
        if "AGENT_FUND_BOT_TOKEN" in env_vars:
            env["AGENT_FUND_BOT_TOKEN"] = env_vars["AGENT_FUND_BOT_TOKEN"]
        # Cycle interval
        if "CYCLE_INTERVAL_SECONDS" in env_vars:
            env["CYCLE_INTERVAL_SECONDS"] = env_vars["CYCLE_INTERVAL_SECONDS"]
        if "DURATION_MINUTES" in env_vars:
            env["DURATION_MINUTES"] = env_vars["DURATION_MINUTES"]

    # Security fix 3C: write credentials to temp file instead of env vars
    # so they're not visible via /proc/pid/environ
    env, creds_file = write_credentials_file(env)

    # Initialize reasoning buffer
    _reasoning_buffers[process_key] = []

    try:
        process = await asyncio.create_subprocess_exec(
            *config["cmd"],
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(bot_dir),
            env=env,
        )

        bot = BotProcess(process_key, process, mode=mode, user_id=user_id, creds_file=creds_file)
        _processes[process_key] = bot

        # Start streaming stdout/stderr in background
        bot.start_stdout_capture()

        logger.info(f"Bot {process_key} ({bot_type_id}) started (pid={process.pid}, mode={mode})")
        return bot

    except Exception as e:
        logger.error(f"Failed to start bot {process_key}: {e}")
        cleanup_credentials_file(creds_file)
        try:
            import sentry_sdk
            sentry_sdk.capture_exception(e)
        except ImportError:
            pass
        return None


async def stop_bot(agent_id: str) -> bool:
    """Stop a running bot by its process key (user_agent_id)."""
    bot = _processes.get(agent_id)
    if not bot:
        return False

    await bot.stop()
    del _processes[agent_id]
    # Clean up reasoning buffer
    _reasoning_buffers.pop(agent_id, None)
    return True


async def kill_bot(agent_id: str) -> bool:
    """Force kill a bot by its process key (user_agent_id)."""
    bot = _processes.get(agent_id)
    if not bot:
        return False

    await bot.kill()
    del _processes[agent_id]
    _reasoning_buffers.pop(agent_id, None)
    return True


def get_bot(agent_id: str) -> Optional[BotProcess]:
    """Get a running bot process by its process key."""
    return _processes.get(agent_id)


def get_all_bots() -> dict[str, BotProcess]:
    """Get all running bot processes."""
    return dict(_processes)


async def get_pending_decisions(agent_id: str) -> list[dict]:
    """Legacy: kept for backwards compatibility.

    In the proxy-intercept architecture, decisions come via /api/intercept.
    Stdout is captured by the stream task for reasoning only.
    """
    return []


async def stop_all():
    """Stop all running bots."""
    for agent_id in list(_processes.keys()):
        await stop_bot(agent_id)
    _reasoning_buffers.clear()
    logger.info("All bots stopped")
