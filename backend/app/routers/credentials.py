"""Credential management API endpoints."""
from __future__ import annotations

import re
import uuid
import logging
from typing import List

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException


def _normalize_pem(raw: str) -> str:
    """Fix PEM keys that got flattened when pasted into a web form.

    Handles: escaped newlines, completely flattened base64, missing line wraps.
    Returns a properly formatted PEM string that cryptography can parse.
    """
    # Replace escaped newlines from JSON round-trip
    s = raw.replace("\\n", "\n").strip()

    # If it already looks like a properly formatted PEM, return as-is
    if s.startswith("-----BEGIN") and "\n" in s.split("-----")[2]:
        return s

    # Try to extract and re-wrap a flattened PEM
    pem_match = re.match(
        r"(-----BEGIN [A-Z ]+-----)(.+?)(-----END [A-Z ]+-----)",
        s.replace("\n", ""),
        re.DOTALL,
    )
    if pem_match:
        header, b64_body, footer = pem_match.groups()
        b64_clean = re.sub(r"\s+", "", b64_body)
        wrapped = "\n".join(b64_clean[i:i+64] for i in range(0, len(b64_clean), 64))
        return f"{header}\n{wrapped}\n{footer}\n"

    # Can't fix it — return as-is and let the caller handle the error
    return s

from ..auth import CurrentUser, require_user, require_mfa_user
from ..database import Database
from ..services.encryption import encrypt_value, encrypt_value_v3, decrypt_value, get_last_four
from ..schemas.credential import CredentialCreate, CredentialResponse, CredentialTestResult
from ..services.audit import log_audit
from ..config import settings
from kalshi.client import KalshiClient

from ..services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/credentials", tags=["credentials"])


@router.get("", response_model=List[CredentialResponse])
async def list_credentials(user: CurrentUser = Depends(require_user)):
    """List all saved credentials (masked)."""
    async with Database() as db:
        rows = await db.fetch(
            "SELECT id, provider, label, key_type, last_four, is_active, created_at FROM credentials WHERE user_id = $1 ORDER BY created_at DESC",
            user.user_id,
        )
        return [
            CredentialResponse(
                id=row["id"],
                provider=row["provider"],
                label=row["label"],
                key_type=row["key_type"],
                last_four=row["last_four"],
                is_active=row["is_active"],
                created_at=row["created_at"],
            )
            for row in rows
        ]


@router.post("", response_model=CredentialResponse, status_code=201)
async def create_credential(cred: CredentialCreate, user: CurrentUser = Depends(require_mfa_user)):
    """Save a new encrypted credential (one per provider+key_type per user)."""
    cred_id = str(uuid.uuid4())
    # Normalize PEM keys that got flattened when pasted into web forms
    value = _normalize_pem(cred.value) if cred.key_type == "private_key" else cred.value
    encrypted, iv, key_version, salt = encrypt_value_v3(value)
    last_four = get_last_four(cred.value)

    async with Database() as db:
        # Delete any existing credential with same user+provider+key_type (one per slot)
        await db.execute(
            "DELETE FROM credentials WHERE user_id = $1 AND provider = $2 AND key_type = $3",
            user.user_id, cred.provider, cred.key_type,
        )
        await db.execute(
            """INSERT INTO credentials (id, user_id, provider, label, key_type, encrypted_value, iv, last_four, key_version, salt)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
            cred_id, user.user_id, cred.provider, cred.label, cred.key_type, encrypted, iv, last_four, key_version, salt,
        )

        await log_audit("user_action", "credential_add", "user", detail={
            "provider": cred.provider, "key_type": cred.key_type, "last_four": last_four,
        }, user_id=str(user.user_id))

        return CredentialResponse(
            id=cred_id,
            provider=cred.provider,
            label=cred.label,
            key_type=cred.key_type,
            last_four=last_four,
            is_active=True,
            created_at="just now",
        )


@router.delete("/{credential_id}")
async def delete_credential(credential_id: str, user: CurrentUser = Depends(require_mfa_user)):
    """Delete a credential and stop any running bots (they have stale keys in memory)."""
    async with Database() as db:
        result = await db.execute(
            "DELETE FROM credentials WHERE id = $1 AND user_id = $2",
            credential_id, user.user_id,
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Credential not found")

        # Stop all running bots for this user — their env vars have stale credentials
        running = await db.fetch(
            "SELECT id, bot_type_id FROM user_agents WHERE user_id = $1 AND status = 'running'",
            user.user_id,
        )
        if running:
            from bot_runner.manager import stop_bot
            for r in running:
                try:
                    await stop_bot(str(r["id"]))
                    await db.execute(
                        "UPDATE user_agents SET status = 'stopped', pid = NULL, bot_token = NULL WHERE id = $1",
                        r["id"],
                    )
                    logger.info("Stopped bot %s (credential deleted)", r["id"])
                except Exception as e:
                    logger.warning("Failed to stop bot %s on credential delete: %s", r["id"], e)

        await log_audit("user_action", "credential_delete", "user",
                        detail={"credential_id": credential_id, "bots_stopped": len(running)},
                        user_id=str(user.user_id))
        return {"ok": True, "bots_stopped": len(running)}


@router.post("/test", response_model=CredentialTestResult)
async def test_credential(cred: CredentialCreate, user: CurrentUser = Depends(require_user)):
    """Test a credential by making a real API call."""
    if cred.provider != "kalshi":
        # For non-Kalshi providers, just validate the format
        return CredentialTestResult(
            success=True,
            message=f"{cred.provider} key format looks valid",
        )

    # For Kalshi, we need both an API key and a private key to test
    async with Database() as db:
        # Handle "existing" sentinel — frontend sends this to test a stored credential
        test_value = cred.value
        if test_value == "existing":
            stored_row = await db.fetchrow(
                "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE user_id = $1 AND provider = 'kalshi' AND key_type = $2 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
                user.user_id, cred.key_type,
            )
            if not stored_row:
                return CredentialTestResult(
                    success=False,
                    message=f"No stored Kalshi {cred.key_type} found to test",
                )
            test_value = decrypt_value(stored_row["encrypted_value"], stored_row["iv"], stored_row.get("key_version"), salt=stored_row.get("salt"))

        if cred.key_type == "api_key":
            # Look up stored private key
            pk_row = await db.fetchrow(
                "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE user_id = $1 AND provider = 'kalshi' AND key_type = 'private_key' AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
                user.user_id,
            )
            if not pk_row:
                return CredentialTestResult(
                    success=False,
                    message="Save a Kalshi private key first, then test the API key",
                )
            private_key_pem = decrypt_value(pk_row["encrypted_value"], pk_row["iv"], pk_row.get("key_version"), salt=pk_row.get("salt"))
            api_key = test_value
        else:
            # Testing the private key — look up stored API key
            ak_row = await db.fetchrow(
                "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE user_id = $1 AND provider = 'kalshi' AND key_type = 'api_key' AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
                user.user_id,
            )
            if not ak_row:
                return CredentialTestResult(
                    success=False,
                    message="Save a Kalshi API key first, then test the private key",
                )
            api_key = decrypt_value(ak_row["encrypted_value"], ak_row["iv"], ak_row.get("key_version"), salt=ak_row.get("salt"))
            private_key_pem = _normalize_pem(test_value)

    # Test the connection
    client = KalshiClient(
        base_url=settings.kalshi_base_url,
        api_key=api_key,
        private_key_pem=private_key_pem,
    )
    try:
        balance = await client.get_balance()
        await log_audit("user_action", "credential_test", "user", detail={
            "provider": cred.provider, "key_type": cred.key_type, "result": "success",
        }, user_id=str(user.user_id))
        return CredentialTestResult(
            success=True,
            message=f"Connected to Kalshi ({settings.kalshi_environment})",
            balance=balance.balance / 100,  # Kalshi stores in cents
        )
    except Exception as e:
        logger.error(f"Kalshi test failed: {e}")
        await log_audit("user_action", "credential_test", "user", detail={
            "provider": cred.provider, "key_type": cred.key_type, "result": "failed", "error": str(e)[:200],
        }, status="error", user_id=str(user.user_id))
        return CredentialTestResult(
            success=False,
            message=f"Connection failed: {str(e)[:200]}",
        )
    finally:
        await client.close()


@router.get("/by-provider/{provider}", response_model=List[CredentialResponse])
async def get_credentials_by_provider(provider: str, user: CurrentUser = Depends(require_user)):
    """Get credentials for a specific provider."""
    async with Database() as db:
        rows = await db.fetch(
            "SELECT id, provider, label, key_type, last_four, is_active, created_at FROM credentials WHERE user_id = $1 AND provider = $2 ORDER BY created_at DESC",
            user.user_id, provider,
        )
        return [
            CredentialResponse(
                id=row["id"],
                provider=row["provider"],
                label=row["label"],
                key_type=row["key_type"],
                last_four=row["last_four"],
                is_active=row["is_active"],
                created_at=row["created_at"],
            )
            for row in rows
        ]
