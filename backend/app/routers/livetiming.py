import time
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from app.livetiming.f1auth import (
    REFRESH_WINDOW_SECONDS,
    TOKEN_FILE,
    _token_expiry,
    refresh_coordinator,
)
from app.livetiming.hub import Broadcaster
from app.livetiming.state import LiveSessionState
from app.schemas.livetiming import F1AuthStatusResponse, RefreshStartResponse

router = APIRouter()


@router.websocket("/ws/live")
async def ws_live(websocket: WebSocket) -> None:
    await websocket.accept()
    broadcaster: Broadcaster = websocket.app.state.broadcaster
    live_state: LiveSessionState = websocket.app.state.live_state
    await broadcaster.register(websocket)
    try:
        await websocket.send_json(live_state.snapshot())
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, ConnectionClosed):
        pass
    finally:
        await broadcaster.unregister(websocket)


@router.get("/api/f1auth/status", response_model=F1AuthStatusResponse)
async def f1auth_status():
    exp: Optional[float] = None
    if TOKEN_FILE.exists():
        exp = _token_expiry(TOKEN_FILE.read_text().strip())
    return {
        "valid_until": exp,
        "needs_refresh": exp is None or exp <= time.time() + REFRESH_WINDOW_SECONDS,
    }


@router.post("/api/f1auth/refresh/start", response_model=RefreshStartResponse)
async def f1auth_refresh_start():
    return {"url": refresh_coordinator.start()}
