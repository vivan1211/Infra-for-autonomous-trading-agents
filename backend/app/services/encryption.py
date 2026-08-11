"""AES-256-GCM encryption for API credentials with versioned key derivation."""
from __future__ import annotations

import base64
import json
import os
import hashlib
import logging
import stat
import tempfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from ..config import settings

logger = logging.getLogger(__name__)

# Static salt for v2 key derivation — not secret, just ensures different derived key from v1
_V2_SALT = b"arbiter-credential-encryption-v2"
_V2_ITERATIONS = 100_000


def _derive_key_v1() -> bytes:
    """Legacy key derivation: single-iteration SHA256 (no salt)."""
    return hashlib.sha256(settings.master_key.encode()).digest()


def _derive_key_v2() -> bytes:
    """Strengthened key derivation: PBKDF2-HMAC-SHA256 with 100K iterations."""
    return hashlib.pbkdf2_hmac(
        "sha256",
        settings.master_key.encode(),
        _V2_SALT,
        iterations=_V2_ITERATIONS,
    )


def _derive_key_v3(salt: bytes) -> bytes:
    """Per-credential key derivation: PBKDF2-HMAC-SHA256 with random salt."""
    return hashlib.pbkdf2_hmac(
        "sha256",
        settings.master_key.encode(),
        salt,
        iterations=_V2_ITERATIONS,
    )


def _derive_key(version: int = 2, salt: bytes | None = None) -> bytes:
    """Derive a 256-bit AES key for the given version."""
    if version == 1:
        return _derive_key_v1()
    if version == 3:
        if not salt:
            raise ValueError("v3 key derivation requires a per-credential salt")
        return _derive_key_v3(salt)
    return _derive_key_v2()


def encrypt_value(plaintext: str) -> tuple[str, str, int]:
    """
    Encrypt a string value using AES-256-GCM with v2 key derivation.
    Returns (encrypted_value_b64, iv_b64, key_version).
    Stored as TEXT in DB to avoid BYTEA issues with PgBouncer.
    """
    key = _derive_key(version=2)
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # 96-bit nonce for GCM
    encrypted = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(encrypted).decode("ascii"), base64.b64encode(iv).decode("ascii"), 2


def encrypt_value_v3(plaintext: str) -> tuple[str, str, int, str]:
    """Encrypt with per-credential random salt (v3).
    Returns (encrypted_value_b64, iv_b64, key_version=3, salt_b64).
    """
    salt = os.urandom(16)  # 128-bit random salt
    key = _derive_key_v3(salt)
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    encrypted = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return (
        base64.b64encode(encrypted).decode("ascii"),
        base64.b64encode(iv).decode("ascii"),
        3,
        base64.b64encode(salt).decode("ascii"),
    )


def decrypt_value(encrypted_value: str | bytes, iv: str | bytes, key_version: int | None = None, salt: str | bytes | None = None) -> str:
    """
    Decrypt a value encrypted with encrypt_value() or encrypt_value_v3().
    Accepts both base64 strings (new format) and raw bytes (legacy BYTEA).

    key_version controls which derived key to use:
      - 3: use v3 (PBKDF2 with per-credential salt) — requires salt parameter
      - 2: use v2 (PBKDF2 with static salt) key
      - 1 or None: use v1 (SHA256) key for backward compatibility
      - On failure: tries the other version as fallback (v1/v2 only)
    """
    # Handle both base64 strings (TEXT columns) and raw bytes (legacy BYTEA)
    if isinstance(encrypted_value, str):
        encrypted_value = base64.b64decode(encrypted_value)
    if isinstance(iv, str):
        iv = base64.b64decode(iv)

    # v3: per-credential salt — no fallback (salt is required and unique)
    if key_version == 3 and not salt:
        raise ValueError("v3 credential requires a per-credential salt but none was provided")
    if key_version == 3 and salt:
        if isinstance(salt, str):
            salt = base64.b64decode(salt)
        key = _derive_key_v3(salt)
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(iv, encrypted_value, None).decode("utf-8")

    # Determine primary and fallback versions
    primary = key_version if key_version in (1, 2) else 1
    fallback = 1 if primary == 2 else 2

    # Try primary version first
    try:
        key = _derive_key(version=primary)
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, encrypted_value, None)
        return decrypted.decode("utf-8")
    except Exception:
        pass

    # Fallback to other version
    try:
        key = _derive_key(version=fallback)
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, encrypted_value, None)
        logger.warning(f"Credential decrypted with fallback key version {fallback} (expected {primary})")
        return decrypted.decode("utf-8")
    except Exception:
        raise ValueError(f"Failed to decrypt credential with both v1 and v2 key derivation")


def decrypt_value_with_old_key(
    encrypted_value: str | bytes,
    iv: str | bytes,
    key_version: int | None,
    salt: str | bytes | None,
    old_master_key: str,
) -> str:
    """Decrypt a v3 credential using an old master key (for key rotation).

    Used during MASTER_KEY rotation: if decryption with the current key fails,
    this function tries the old key. Only supports v3 credentials (per-credential salt).
    """
    if isinstance(encrypted_value, str):
        encrypted_value = base64.b64decode(encrypted_value)
    if isinstance(iv, str):
        iv = base64.b64decode(iv)

    if key_version != 3 or not salt:
        raise ValueError("decrypt_value_with_old_key only supports v3 credentials with salt")

    if isinstance(salt, str):
        salt = base64.b64decode(salt)

    # Derive key using the OLD master key (same PBKDF2 params as v3)
    old_derived = hashlib.pbkdf2_hmac(
        "sha256",
        old_master_key.encode(),
        salt,
        iterations=_V2_ITERATIONS,
    )
    aesgcm = AESGCM(old_derived)
    return aesgcm.decrypt(iv, encrypted_value, None).decode("utf-8")


def get_last_four(value: str) -> str:
    """Extract last 4 characters of a key for display."""
    if len(value) < 4:
        return "****"
    return value[-4:]


# ── Credential file helpers (security fix 3C) ──

# Sensitive keys that must not be passed as subprocess environment variables.
# These are written to a temp file (mode 0400) and the path is passed instead.
CREDENTIAL_KEYS = {
    "KALSHI_API_KEY", "KALSHI_PRIVATE_KEY",
    "POLYMARKET_PRIVATE_KEY", "POLYMARKET_FUNDER_ADDRESS",
    "XAI_API_KEY", "OPENROUTER_API_KEY", "OCTAGON_API_KEY",
    "AGENT_FUND_BOT_TOKEN",
}


def write_credentials_file(env_vars: dict) -> tuple[dict, str | None]:
    """Extract credential env vars into a temp file, return sanitized env + file path.

    Moves sensitive keys from env_vars into a JSON temp file (mode 0400).
    Returns (sanitized_env_vars, creds_file_path).
    If there are no credentials to extract, returns the original env_vars and None.
    """
    creds = {}
    sanitized = {}
    for key, value in env_vars.items():
        if key in CREDENTIAL_KEYS and value:
            creds[key] = value
        else:
            sanitized[key] = value

    if not creds:
        return env_vars, None

    # Create temp file with restricted permissions atomically (no brief world-readable window)
    tmp_dir = tempfile.gettempdir()
    fd = tempfile.mkstemp(suffix=".json", prefix="af_creds_", dir=tmp_dir)
    try:
        os.fchmod(fd[0], stat.S_IRUSR | stat.S_IWUSR)  # 0600 before writing
        with os.fdopen(fd[0], "w") as f:
            json.dump(creds, f)
        os.chmod(fd[1], stat.S_IRUSR)  # 0400 after writing (read-only)
    except Exception:
        os.close(fd[0])
        os.unlink(fd[1])
        raise
    tmp_name = fd[1]

    sanitized["AGENT_FUND_CREDS_FILE"] = tmp_name
    return sanitized, tmp_name


def cleanup_credentials_file(path: str | None) -> None:
    """Remove a credentials temp file if it exists."""
    if path:
        try:
            os.unlink(path)
        except OSError:
            pass
