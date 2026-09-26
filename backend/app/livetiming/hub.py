"""Fan-out of LiveSessionState patches to connected /ws/live clients.

Deliberately framework-agnostic: anything with an async `send_text(str)`
works here (in production these are `fastapi.WebSocket` instances; tests
use plain fakes). One client's dead socket must never stop delivery to
the others — see broadcast()'s per-client try/except.
"""
import json
import logging
from typing import Any, Dict, Set

logger = logging.getLogger(__name__)


class Broadcaster:
    def __init__(self) -> None:
        self._clients: Set[Any] = set()

    async def register(self, websocket: Any) -> None:
        self._clients.add(websocket)

    async def unregister(self, websocket: Any) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, patch: Dict[str, Any]) -> None:
        if not patch or not self._clients:
            return
        message = json.dumps(patch)
        dead = []
        for client in list(self._clients):
            try:
                await client.send_text(message)
            except Exception as exc:
                logger.warning("dropping dead /ws/live client: %s", exc)
                dead.append(client)
        for client in dead:
            self._clients.discard(client)
