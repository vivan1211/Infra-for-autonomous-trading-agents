"""Entry point for Tail Buyer Kalshi bot.

Launched by arq worker as a subprocess. Env vars (AGENT_FUND_AGENT_ID,
AGENT_FUND_BOT_TOKEN) must be set. Runs a single trading cycle and exits.
Handles RSA private key temp file creation for Kalshi auth.
"""

import sys
import os
import asyncio
import logging
import tempfile

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


def _setup_private_key():
    """Write KALSHI_PRIVATE_KEY env content to a temp file for RSA auth.
    Kalshi's cryptography library needs a file path, not a string."""
    import re

    pk_content = os.environ.get("KALSHI_PRIVATE_KEY", "")
    if not pk_content:
        return

    # Normalize escaped newlines from JSON round-trip
    pk_content = pk_content.replace("\\n", "\n")

    # Fix completely flattened PEM: re-wrap base64 body at 64-char lines
    pem_match = re.match(
        r"(-----BEGIN [A-Z ]+-----)(.+?)(-----END [A-Z ]+-----)",
        pk_content.strip().replace("\n", ""),
        re.DOTALL,
    )
    if pem_match:
        header, b64_body, footer = pem_match.groups()
        b64_clean = re.sub(r"\s+", "", b64_body)
        wrapped = "\n".join(b64_clean[i:i+64] for i in range(0, len(b64_clean), 64))
        pk_content = f"{header}\n{wrapped}\n{footer}\n"

    if not pk_content.startswith("-----BEGIN"):
        logger.warning("KALSHI_PRIVATE_KEY doesn't look like PEM format")
        return

    try:
        tmp = tempfile.NamedTemporaryFile(
            mode="wb", suffix=".pem", prefix="kalshi_pk_", delete=False
        )
        tmp.write(pk_content.encode("utf-8"))
        tmp.close()
        os.chmod(tmp.name, 0o600)  # Restrict to owner-only read/write
        os.environ["KALSHI_PRIVATE_KEY_PATH"] = tmp.name

        lines = pk_content.strip().split("\n")
        logger.info(f"Private key: {len(pk_content)} chars, {len(lines)} lines")

        # Validate key can be loaded
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        with open(tmp.name, "rb") as f:
            load_pem_private_key(f.read(), password=None)
        logger.info("Private key validated successfully")
    except Exception as e:
        logger.error(f"Private key setup failed: {type(e).__name__}")

    return os.environ.get("KALSHI_PRIVATE_KEY_PATH")


def fetch_credentials(agent_id: str, bot_token: str):
    """Fetch Kalshi credentials from the backend API."""
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

        for key in ("KALSHI_API_KEY", "KALSHI_PRIVATE_KEY"):
            if key in creds and creds[key]:
                os.environ[key] = creds[key]
                logger.info(f"Fetched {key} from backend ({len(creds[key])} chars)")

        if "mode" in creds:
            os.environ["AGENT_FUND_MODE"] = creds["mode"]

        # Write private key to temp file for RSA auth
        _setup_private_key()

    except Exception as e:
        logger.error(f"Failed to fetch credentials: {e}")


def run_trading_cycle(agent_id: str, bot_token: str):
    """Run a single trading cycle."""
    os.environ["EXCHANGE"] = "kalshi"
    os.environ["AGENT_FUND_AGENT_ID"] = agent_id
    os.environ["AGENT_FUND_BOT_TOKEN"] = bot_token

    logger.info("Starting Tail Buyer Kalshi trading cycle")

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
    try:
        subprocess_agent_id = os.environ.get("AGENT_FUND_AGENT_ID")
        subprocess_bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN")
        if not subprocess_agent_id or not subprocess_bot_token:
            logger.error("Missing AGENT_FUND_AGENT_ID or AGENT_FUND_BOT_TOKEN — must be launched by worker")
            sys.exit(1)

        logger.info(f"Subprocess mode (agent={subprocess_agent_id}) — single cycle")
        fetch_credentials(subprocess_agent_id, subprocess_bot_token)
        run_trading_cycle(subprocess_agent_id, subprocess_bot_token)
    finally:
        tmp_key_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH")
        if tmp_key_path and os.path.exists(tmp_key_path):
            os.unlink(tmp_key_path)
            logger.info("Cleaned up temp private key file")


if __name__ == "__main__":
    main()
