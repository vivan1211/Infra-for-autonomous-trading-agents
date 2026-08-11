"""Kalshi API RSA-PSS signature generation."""
from __future__ import annotations

import time
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, utils


def load_private_key(pem_string: str):
    """Load an RSA private key from PEM string."""
    return serialization.load_pem_private_key(
        pem_string.encode("utf-8"),
        password=None,
    )


def sign_request(
    private_key_pem: str,
    method: str,
    path: str,
    timestamp_ms: int | None = None,
) -> tuple[str, str]:
    """
    Generate Kalshi API signature headers.

    Returns (timestamp_str, signature_base64).

    Kalshi requires:
      - KALSHI-ACCESS-TIMESTAMP: Unix timestamp in milliseconds
      - KALSHI-ACCESS-SIGNATURE: RSA-PSS(SHA256) over "timestamp_ms + method + path"
    """
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)

    timestamp_str = str(timestamp_ms)

    # Message to sign: timestamp + METHOD + /path
    message = f"{timestamp_str}{method.upper()}{path}"

    private_key = load_private_key(private_key_pem)
    signature = private_key.sign(
        message.encode("utf-8"),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )

    signature_b64 = base64.b64encode(signature).decode("utf-8")
    return timestamp_str, signature_b64
