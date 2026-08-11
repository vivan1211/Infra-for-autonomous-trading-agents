"""Abstract base class for bot adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional


class BaseBotAdapter(ABC):
    """
    Interface for bot adapters.

    Each forked bot needs an adapter that knows:
    1. How to prepare the bot's input (markets, config)
    2. How to start the bot subprocess
    3. How to read decisions from stdout
    """

    agent_id: str
    name: str
    bot_dir: str  # Subdirectory under bots/

    @abstractmethod
    def get_required_env_keys(self) -> list[str]:
        """Return list of environment variable names this bot needs."""
        ...

    @abstractmethod
    def prepare_input(self, markets: list[dict], config: dict) -> str:
        """
        Prepare the input to feed to the bot via stdin.
        Returns a JSON string.
        """
        ...

    @abstractmethod
    def get_command(self) -> list[str]:
        """Return the command to start the bot subprocess."""
        ...
