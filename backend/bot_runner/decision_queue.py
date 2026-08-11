"""Thread-safe queue of pending trade decisions from bots."""

import asyncio
from dataclasses import dataclass, field
from typing import Optional

from app.schemas.decision import BotDecision


@dataclass
class PendingDecision:
    """A trade decision waiting to be validated and executed."""
    agent_id: str
    decision: BotDecision
    timestamp: float = 0.0

    def __post_init__(self):
        if self.timestamp == 0.0:
            import time
            self.timestamp = time.time()


class DecisionQueue:
    """Async queue for pending bot decisions."""

    def __init__(self, maxsize: int = 1000):
        self._queue: asyncio.Queue[PendingDecision] = asyncio.Queue(maxsize=maxsize)

    async def put(self, agent_id: str, decision: BotDecision):
        """Add a decision to the queue."""
        await self._queue.put(PendingDecision(agent_id=agent_id, decision=decision))

    async def get(self, timeout: float = 1.0) -> Optional[PendingDecision]:
        """Get the next pending decision, or None if queue is empty."""
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    @property
    def size(self) -> int:
        return self._queue.qsize()

    @property
    def empty(self) -> bool:
        return self._queue.empty()


# Global decision queue
decision_queue = DecisionQueue()
