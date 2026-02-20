from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class CotBroadcaster:
    """Thread-safe broadcaster: sync code can call publish() to push COT data to WebSocket clients."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def connect(self, ws: WebSocket) -> None:
        self._clients.add(ws)
        logger.info("COT WS client connected (%d total)", len(self._clients))

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)
        logger.info("COT WS client disconnected (%d total)", len(self._clients))

    def publish(self, data: dict[str, Any]) -> None:
        """Called from any thread. Schedules async broadcast on the event loop."""
        if not self._clients or not self._loop:
            return
        try:
            self._loop.call_soon_threadsafe(
                self._loop.create_task, self._broadcast(data)
            )
        except RuntimeError:
            pass  # loop closed

    async def _broadcast(self, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)


cot_broadcaster = CotBroadcaster()
