"""Credential request/response schemas."""

from pydantic import BaseModel, field_serializer
from typing import Optional, Any
from datetime import datetime
from uuid import UUID


class CredentialCreate(BaseModel):
    provider: str  # 'kalshi','openai','anthropic','xai','google','deepseek','openrouter','octagon'
    label: str
    key_type: str = "api_key"  # 'api_key' or 'private_key'
    value: str  # The actual key value (never stored in plaintext)


class CredentialResponse(BaseModel):
    id: Any
    provider: str
    label: str
    key_type: str
    last_four: str
    is_active: bool
    created_at: Any

    @field_serializer("id")
    def serialize_id(self, v: Any) -> str:
        return str(v)

    @field_serializer("created_at")
    def serialize_created_at(self, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class CredentialTestResult(BaseModel):
    success: bool
    message: str
    balance: Optional[float] = None  # For Kalshi, show demo balance
