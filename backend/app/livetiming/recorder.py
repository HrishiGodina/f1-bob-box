"""Recording and replay for F1's live-timing feed.

Recording captures each topic update as one JSONL line, in the exact shape
`{"topic": ..., "payload": ..., "timestamp": ...}` — `.z` topics' payloads
are stored as the still-base64-encoded string exactly as they arrived on
the wire, never pre-inflated. Replaying a recorded (or hand-written)
fixture through `decode.decode_topic_payload` + `state.LiveSessionState.apply`
therefore exercises the real inflate-and-merge pipeline end to end.
"""
import json
from typing import Any, Awaitable, Callable, Dict, Iterator, Optional

from .decode import decode_topic_payload
from .state import LiveSessionState


def record_topic(path: str, topic: str, payload: Any, timestamp: Optional[str]) -> None:
    """Append one topic update to the fixture file at `path`, creating it
    if needed. `payload` is recorded exactly as received — no decoding."""
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps({"topic": topic, "payload": payload, "timestamp": timestamp}) + "\n")


def record_snapshot(path: str, topics: Dict[str, Any]) -> None:
    """Expand a type:3 completion's `{topic: payload}` snapshot into one
    recorded line per topic — a fixture file never needs to distinguish
    "this line was originally a snapshot" from "this line was a delta"."""
    for topic, payload in topics.items():
        record_topic(path, topic, payload, timestamp=None)


def load_fixture(path: str) -> Iterator[dict]:
    """Yield each recorded `{"topic", "payload", "timestamp"}` line, in
    file order."""
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


PatchHandler = Callable[[dict], Awaitable[None]]


async def replay_fixture(path: str, state: LiveSessionState, on_patch: PatchHandler) -> None:
    """Replay a fixture file through the real decode + merge pipeline,
    calling `on_patch` with each resulting broadcast patch — used both by
    the end-to-end test below and by LIVETIMING_REPLAY (Task 6) for
    offline frontend development without a live F1 session."""
    for record in load_fixture(path):
        payload = decode_topic_payload(record["topic"], record["payload"])
        patch = state.apply(record["topic"], payload)
        await on_patch(patch)
