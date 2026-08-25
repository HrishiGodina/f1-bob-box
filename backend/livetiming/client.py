"""Client for F1's SignalR Core live-timing feed.

See docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
§3 for the verified protocol this implements: OPTIONS negotiate for cookies,
POST negotiate for a connection token, then a WebSocket carrying a JSON
SignalR Core protocol. All constants below are grounded in handoff §7
decision 9 except PING_INTERVAL_SECONDS, which is our own conservative
choice — see its docstring.
"""
import asyncio
import json
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

import httpx
from websockets.asyncio.client import connect as ws_connect

from .decode import RECORD_SEPARATOR, extract_snapshot, extract_topic_message, parse_frame
from .state import LiveSessionState

logger = logging.getLogger(__name__)

NEGOTIATE_URL = "https://livetiming.formula1.com/signalrcore/negotiate"
WS_URL = "wss://livetiming.formula1.com/signalrcore"
BACKOFF_SCHEDULE: Tuple[int, ...] = (1, 2, 5, 10)  # seconds; last value repeats
CLIENT_HEADERS = {"User-Agent": "BestHTTP", "Accept-Encoding": "gzip,identity"}
SUBSCRIBE_TOPICS: List[str] = [
    "Heartbeat", "SessionInfo", "DriverList", "TimingData", "TimingAppData",
    "TimingStats", "TrackStatus", "RaceControlMessages", "WeatherData",
    "CarData.z", "Position.z",
]
# SignalR Core's own conventional keepalive is ~15s client-side against a
# ~30s server timeout; the handoff doesn't pin an exact number for F1's
# feed specifically, so this is a conservative choice, not a verified fact.
PING_INTERVAL_SECONDS = 15

PatchHandler = Callable[[Dict[str, Any]], Awaitable[None]]


class LiveTimingClient:
    def __init__(
        self,
        state: LiveSessionState,
        on_patch: PatchHandler,
        negotiate_url: str = NEGOTIATE_URL,
        ws_url: str = WS_URL,
        ws_connect_fn: Callable[..., Any] = ws_connect,
    ) -> None:
        self._state = state
        self._on_patch = on_patch
        self._negotiate_url = negotiate_url
        self._ws_url = ws_url
        self._ws_connect_fn = ws_connect_fn
        self._stopped = False

    async def _negotiate(self) -> str:
        """OPTIONS then POST, sharing one httpx.AsyncClient so the cookie
        the OPTIONS response sets is attached to the POST automatically."""
        async with httpx.AsyncClient(headers=CLIENT_HEADERS) as http:
            await http.options(self._negotiate_url)
            response = await http.post(self._negotiate_url, params={"negotiateVersion": "1"})
            response.raise_for_status()
            return response.json()["connectionToken"]

    def _apply_topic(self, topic: str, payload: Any) -> Dict[str, Any]:
        """The one place a topic's payload reaches LiveSessionState.apply
        on the live-network path. Any exception here (malformed payload,
        unexpected shape) is logged with the topic name and a truncated
        payload prefix and swallowed — decision 5: a single bad topic must
        never drop the connection. Returns {} (an empty, no-op patch) on
        failure so callers can broadcast unconditionally."""
        try:
            return self._state.apply(topic, payload)
        except Exception as exc:  # noqa: BLE001 - intentional: decision 5
            logger.warning(
                "failed to decode topic %s (payload prefix: %.200s): %s",
                topic, payload, exc,
            )
            return {}

    async def _handle_record(self, record: dict) -> None:
        snapshot = extract_snapshot(record)
        if snapshot is not None:
            combined: Dict[str, Any] = {}
            for topic, payload in snapshot.items():
                combined.update(self._apply_topic(topic, payload))
            if combined:
                await self._on_patch(combined)
            return
        message = extract_topic_message(record)
        if message is not None:
            patch = self._apply_topic(message.topic, message.data)
            if patch:
                await self._on_patch(patch)

    async def _handle_frame(self, raw: str) -> None:
        for record in parse_frame(raw):
            await self._handle_record(record)

    async def _ping_loop(self, ws: Any) -> None:
        while True:
            await asyncio.sleep(PING_INTERVAL_SECONDS)
            await ws.send(json.dumps({"type": 6}) + RECORD_SEPARATOR)

    async def _connect_once(self) -> None:
        connection_token = await self._negotiate()
        url = "{}?id={}".format(self._ws_url, connection_token)
        # No read timeout anywhere in this method or in ws_connect's own
        # kwargs — an idle-but-healthy connection (quiet practice session,
        # red flag) must never be torn down for inactivity. ping_interval/
        # ping_timeout govern the WebSocket protocol-level keepalive only.
        async with self._ws_connect_fn(
            url, additional_headers=CLIENT_HEADERS, max_size=None,
            ping_interval=20, ping_timeout=20,
        ) as ws:
            await ws.send(json.dumps({"protocol": "json", "version": 1}) + RECORD_SEPARATOR)
            await ws.send(json.dumps({
                "type": 1, "invocationId": "0", "target": "Subscribe",
                "arguments": [SUBSCRIBE_TOPICS],
            }) + RECORD_SEPARATOR)
            await self._emit_status("connected")
            ping_task = asyncio.ensure_future(self._ping_loop(ws))
            try:
                async for raw in ws:
                    await self._handle_frame(raw)
            finally:
                ping_task.cancel()

    async def _emit_status(self, status: str) -> None:
        patch = self._state.set_connection_status(status)
        await self._on_patch(patch)

    async def stop(self) -> None:
        self._stopped = True

    async def run(self) -> None:
        attempt = 0
        while not self._stopped:
            try:
                await self._emit_status("connecting" if attempt == 0 else "reconnecting")
                await self._connect_once()
                attempt = 0  # a connection that made it to "connected" resets backoff
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - intentional: decision 5
                logger.warning("live-timing connection dropped: %s", exc)
            await self._emit_status("disconnected")
            if self._stopped:
                return
            delay = BACKOFF_SCHEDULE[min(attempt, len(BACKOFF_SCHEDULE) - 1)]
            attempt += 1
            await asyncio.sleep(delay)
