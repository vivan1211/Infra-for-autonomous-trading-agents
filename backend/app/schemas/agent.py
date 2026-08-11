"""Agent request/response schemas."""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Union


class AgentDeploy(BaseModel):
    agent_id: str
    mode: str = "training"  # 'training' or 'live'
    capital_allocated: float = 2000.0
    config: Optional[dict] = None


class AgentResponse(BaseModel):
    id: str
    bot_type_id: str = ""
    name: str
    repo_url: Optional[str] = None
    repo_slug: Optional[str] = None
    description: Optional[str] = None
    strategy: Optional[str] = None
    llms: Optional[str] = None
    status: str
    mode: str
    capital_allocated: float
    capital_used: float
    total_pnl: float
    trade_count: int
    win_count: int
    settled_count: int = 0
    pid: Optional[int] = None
    started_at: Optional[Union[str, datetime]] = None
    created_at: Union[str, datetime]
    config_json: Optional[dict] = None
    available: bool = True
    deprecated: bool = False
    exchange: Optional[str] = None  # 'kalshi' or 'polymarket'


class AgentStatusResponse(BaseModel):
    agent_id: str
    status: str
    pid: Optional[int] = None
    uptime_seconds: Optional[int] = None
