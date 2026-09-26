import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import LIVETIMING_REPLAY_DELAY_SECONDS, Settings
from app.livetiming.client import LiveTimingClient
from app.livetiming.f1auth import TOKEN_FILE, get_subscription_token
from app.livetiming.hub import Broadcaster
from app.livetiming.recorder import replay_fixture
from app.livetiming.state import LiveSessionState
from app.routers import circuits, idle, stats
from app.routers.livetiming import router as livetiming_router

BACKEND_DIR = Path(__file__).resolve().parent.parent
RECORDINGS_DIR = BACKEND_DIR / "recordings"


async def _run_replay_loop(
    path: str, live_state: LiveSessionState, broadcaster: Broadcaster
) -> None:
    """LIVETIMING_REPLAY dev mode: loop the fixture through the real
    decode -> state -> broadcast pipeline forever."""
    patch = live_state.set_connection_status("connected")
    await broadcaster.broadcast(patch)
    while True:
        await replay_fixture(path, live_state, broadcaster.broadcast)
        await asyncio.sleep(LIVETIMING_REPLAY_DELAY_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    live_state = LiveSessionState()
    broadcaster = Broadcaster()
    app.state.live_state = live_state
    app.state.broadcaster = broadcaster

    client: Optional[LiveTimingClient] = None
    background_task: Optional["asyncio.Task[None]"] = None
    token_watcher: Optional["asyncio.Task[None]"] = None
    runtime: Dict[str, Any] = {}

    def start_client() -> None:
        RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        client = LiveTimingClient(
            live_state,
            broadcaster.broadcast,
            record_path=runtime.get("record_path"),
            token_provider=get_subscription_token,
        )
        runtime["client"] = client
        runtime["task"] = asyncio.ensure_future(client.run())

    if settings.livetiming_autostart:
        replay_path = settings.livetiming_replay
        if replay_path:
            background_task = asyncio.ensure_future(
                _run_replay_loop(replay_path, live_state, broadcaster)
            )
        else:
            RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ") + ".jsonl"
            runtime["record_path"] = str(RECORDINGS_DIR / stamp)
            start_client()

            async def watch_token_file() -> None:
                def read_token_file() -> str:
                    try:
                        return TOKEN_FILE.read_text().strip()
                    except OSError:
                        return ""

                last = read_token_file()
                while True:
                    await asyncio.sleep(30)
                    content = read_token_file()
                    if content and content != last:
                        last = content
                        task = runtime.get("task")
                        if task is not None:
                            task.cancel()
                            try:
                                await task
                            except asyncio.CancelledError:
                                pass
                        start_client()

            token_watcher = asyncio.ensure_future(watch_token_file())

    yield

    if client is not None:
        await client.stop()
    if token_watcher is not None:
        token_watcher.cancel()
    if background_task is not None:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="F1 Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(livetiming_router)
app.include_router(idle.router)
app.include_router(stats.router)
app.include_router(circuits.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
