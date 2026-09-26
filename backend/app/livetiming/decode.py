"""Decoding for F1's SignalR Core live-timing feed.

Pure functions only — no I/O, no state. See
docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
§3 for the protocol this implements: messages are ASCII\\x1e-separated JSON
records; `type` distinguishes an invocation (1, a streamed topic update)
from a completion (3, the full initial snapshot) from a ping (6).
"""
import base64
import json
import zlib
from typing import Any, Dict, List, NamedTuple, Optional

RECORD_SEPARATOR = "\x1e"


class TopicMessage(NamedTuple):
    topic: str
    data: Any
    timestamp: Optional[str]


def split_records(raw: str) -> List[str]:
    """Split one WebSocket text frame into its \\x1e-separated JSON records,
    discarding the empty fragment a trailing separator always produces."""
    return [rec for rec in raw.split(RECORD_SEPARATOR) if rec.strip()]


def inflate_z(payload: str) -> Any:
    """Decode a `.z`-suffixed topic's payload: base64 -> raw DEFLATE
    (negative wbits — there is no zlib/gzip header, F1's `.z` topics are
    bare DEFLATE streams) -> UTF-8 JSON."""
    raw = zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS)
    return json.loads(raw)


def decode_topic_payload(topic: str, payload: Any) -> Any:
    """Dispatch on topic name: `.z`-suffixed topics (CarData.z, Position.z)
    are inflate_z'd; every other topic's payload is already plain JSON."""
    if topic.endswith(".z") and isinstance(payload, str):
        return inflate_z(payload)
    return payload


def parse_frame(raw: str) -> List[dict]:
    """Parse one WebSocket text frame into its constituent JSON records."""
    return [json.loads(rec) for rec in split_records(raw)]


def extract_topic_message(record: dict) -> Optional[TopicMessage]:
    """Extract a streamed topic update from a type:1 invocation record.
    Returns None for any other record type or a malformed invocation
    (decision 5: fail-soft, never raise on an unexpected shape here —
    the caller decides whether None means "skip" or "log and skip")."""
    if record.get("type") != 1:
        return None
    arguments = record.get("arguments") or []
    if not arguments:
        return None
    topic = arguments[0]
    payload = arguments[1] if len(arguments) > 1 else None
    timestamp = arguments[2] if len(arguments) > 2 else None
    return TopicMessage(
        topic=topic,
        data=decode_topic_payload(topic, payload),
        timestamp=timestamp,
    )


def extract_snapshot(record: dict) -> Optional[Dict[str, Any]]:
    """Extract the full initial `{topic: payload}` snapshot from a type:3
    completion record (F1 sends every subscribed topic's current value in
    one such record right after Subscribe). Returns None for any other
    record type."""
    if record.get("type") != 3:
        return None
    result = record.get("result")
    if not isinstance(result, dict):
        return None
    return {topic: decode_topic_payload(topic, payload) for topic, payload in result.items()}
