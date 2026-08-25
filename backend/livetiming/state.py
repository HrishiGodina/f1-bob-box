"""Process-wide state for F1's live-timing feed.

`merge_delta` implements the index-keyed-dict array-patch semantics from
docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
§3.7. `LiveSessionState` (added in Task 3) is the only thing that calls it.
"""
from typing import Any


def merge_delta(target: Any, delta: Any) -> Any:
    """Merge `delta` onto `target` and return the result. `target` is never
    mutated — every level that changes gets a fresh dict/list.

    If `delta` isn't a dict, it replaces `target` wholesale (this is how
    F1 sends full-array replacements for topics like CarData.z's `Entries`
    and Position.z's `Position`, and how any scalar/list leaf value updates).

    If `delta` is a dict and `target` is a list, `delta`'s keys are treated
    as numeric string indices patching individual list elements — the
    array-patch encoding F1 uses for TimingData's `Sectors`, TimingAppData's
    `Stints`, and RaceControlMessages' `Messages`. The list is extended with
    `None` if an index arrives past the current end.

    Otherwise `delta` is merged key-by-key into a (possibly absent) dict
    target. The noise key `_kf` is stripped at every depth. Calling
    `merge_delta(None, snapshot)` is also how a topic's very first snapshot
    gets ingested — there's no separate "first assignment" code path.
    """
    if not isinstance(delta, dict):
        return delta

    if isinstance(target, list):
        result = list(target)
        for key, value in delta.items():
            if key == "_kf":
                continue
            index = int(key)
            while len(result) <= index:
                result.append(None)
            result[index] = merge_delta(result[index], value)
        return result

    base = dict(target) if isinstance(target, dict) else {}
    base.pop("_kf", None)
    for key, value in delta.items():
        if key == "_kf":
            continue
        base[key] = merge_delta(base.get(key), value)
    return base


import time
from typing import Dict, List, Optional


class LiveSessionState:
    """Process-wide, single-writer store of the live-timing feed's state.

    Raw topic payloads (post merge_delta) are the single source of truth,
    stored in `_raw`. Every frontend-facing "derived" key is a pure
    projection computed from one or more raw topics on every read — never
    cached, so there is exactly one place any given fact about the session
    lives. See docs/superpowers/handoffs/2026-08-17-live-timing-signalr-
    context-transfer.md §7 decision 3.
    """

    #: raw topic name -> derived (frontend-facing) key(s) it feeds
    TOPIC_TO_DERIVED = {
        "SessionInfo": ("session_info",),
        "DriverList": ("drivers",),
        "TimingData": ("timing",),
        "TimingAppData": ("timing",),
        "TimingStats": ("timing",),
        "TrackStatus": ("track_status",),
        "RaceControlMessages": ("race_control",),
        "WeatherData": ("weather",),
        "CarData.z": ("telemetry",),
        "Position.z": ("positions",),
        "Heartbeat": (),
    }

    RACE_CONTROL_MAX = 100
    #: CarData.z channel id -> decoded field name (handoff §7 decision 9)
    CAR_DATA_CHANNELS = {0: "rpm", 2: "speed", 3: "gear", 4: "throttle", 5: "brake", 45: "drs"}

    def __init__(self) -> None:
        self._raw: Dict[str, Any] = {}
        self._connection_status = "disconnected"
        self._last_message_at: Optional[float] = None

    def apply(self, topic: str, payload: Any) -> Dict[str, Any]:
        """Merge one topic's payload into the raw store and return the
        patch of derived keys this topic affects, ready to broadcast.
        `merge_delta` unifies "first snapshot for this topic" and
        "subsequent delta" into the same call — `self._raw.get(topic)`
        is simply `None` the first time, and `merge_delta(None, payload)`
        already means "adopt payload verbatim, minus any `_kf` keys"
        (verified in Task 2, Step 5). Always includes `is_live`, since
        every message can move `seconds_since_last_message()`."""
        self._raw[topic] = merge_delta(self._raw.get(topic), payload)
        self._touch()
        return self._derive_patch_for_topic(topic)

    def apply_many(self, topics: Dict[str, Any]) -> Dict[str, Any]:
        """Apply a `{topic: payload}` dict — used for the type:3 completion's
        full initial snapshot, which covers every subscribed topic in a
        single record. Returns the union of every topic's patch, so seeding
        a newly-connected client needs exactly one broadcast."""
        combined: Dict[str, Any] = {}
        for topic, payload in topics.items():
            combined.update(self.apply(topic, payload))
        return combined

    def _touch(self) -> None:
        self._last_message_at = time.monotonic()

    def _derive_patch_for_topic(self, topic: str) -> Dict[str, Any]:
        patch: Dict[str, Any] = {"is_live": self.is_live()}
        for derived_key in self.TOPIC_TO_DERIVED.get(topic, ()):
            patch[derived_key] = getattr(self, "_derive_" + derived_key)()
        return patch

    def seconds_since_last_message(self) -> float:
        """`inf` if no message has ever been received."""
        if self._last_message_at is None:
            return float("inf")
        return time.monotonic() - self._last_message_at

    def set_connection_status(self, status: str) -> Dict[str, Any]:
        """Record a connection-lifecycle transition (`connecting`,
        `connected`, `disconnected`, `reconnecting` — client.py, Task 5,
        is the only caller). Returns the patch to broadcast — always
        includes recomputed `is_live`, since connection state is one of
        its three inputs."""
        self._connection_status = status
        return {"connection_status": status, "is_live": self.is_live()}

    def is_live(self) -> bool:
        return (
            self._connection_status == "connected"
            and self._session_status() not in ("Finalised", "Ends")
            and self.seconds_since_last_message() < 120
        )

    def _session_status(self) -> Optional[str]:
        """Best-effort: the handoff's decision 6 (`session_status not in
        {"Finalised", "Ends"}`) doesn't pin down which exact SessionInfo
        field carries it — SessionInfo's documented shape (handoff §3.6)
        is meeting/session identity, not lifecycle status. Check the two
        plausible field names; an absent field (None) is "not Finalised/
        Ends" so it never blocks liveness on its own — fail-soft, same
        spirit as the segment-Status-code fallback in decision 4."""
        info = self._raw.get("SessionInfo") or {}
        return info.get("SessionStatus") or info.get("Status")

    def snapshot(self) -> Dict[str, Any]:
        """Full derived state, for seeding a newly-connected /ws/live client."""
        return {
            "connection_status": self._connection_status,
            "is_live": self.is_live(),
            "session_info": self._derive_session_info(),
            "drivers": self._derive_drivers(),
            "timing": self._derive_timing(),
            "positions": self._derive_positions(),
            "telemetry": self._derive_telemetry(),
            "track_status": self._derive_track_status(),
            "race_control": self._derive_race_control(),
            "weather": self._derive_weather(),
        }

    def _derive_session_info(self) -> Dict[str, Any]:
        return self._raw.get("SessionInfo") or {}

    def _derive_drivers(self) -> Dict[str, Any]:
        """DriverList's raw shape is already `{driverNumber: {...}}` at the
        top level (unlike the Timing* topics, which wrap in `Lines`). The
        one normalization worth doing here: `TeamColour` arrives as a bare
        hex string with no leading `#` (handoff §3.6) — prepend it once,
        here, so no frontend component has to remember the quirk."""
        raw_drivers = self._raw.get("DriverList") or {}
        result: Dict[str, Any] = {}
        for number, info in raw_drivers.items():
            if not isinstance(info, dict):
                continue
            result[number] = {
                "racing_number": info.get("RacingNumber", number),
                "tla": info.get("Tla"),
                "full_name": info.get("FullName"),
                "team_name": info.get("TeamName"),
                "team_colour": ("#" + info["TeamColour"]) if info.get("TeamColour") else None,
                "line": info.get("Line"),
            }
        return result

    def _derive_timing(self) -> Dict[str, Any]:
        """One entry per driver number, combining the three raw topics
        that carry per-driver timing facts. Deliberately does NOT
        duplicate driver identity (name/team/etc.) from DriverList — the
        frontend joins timing rows to `drivers` by driver number, so
        identity facts have exactly one home."""
        timing_lines = (self._raw.get("TimingData") or {}).get("Lines") or {}
        app_lines = (self._raw.get("TimingAppData") or {}).get("Lines") or {}
        stats_lines = (self._raw.get("TimingStats") or {}).get("Lines") or {}
        numbers = set(timing_lines) | set(app_lines) | set(stats_lines)

        result: Dict[str, Any] = {}
        for number in numbers:
            line = timing_lines.get(number) or {}
            stints = (app_lines.get(number) or {}).get("Stints") or []
            current_stint = stints[-1] if stints else {}
            interval = line.get("IntervalToPositionAhead") or {}
            result[number] = {
                "position": line.get("Position"),
                "gap_to_leader": line.get("GapToLeader"),
                "interval": interval.get("Value"),
                "catching": interval.get("Catching", False),
                # Sector coloring keys off these two verified booleans, not
                # the undecoded segment `Status` codes (handoff §7
                # decision 4) — the frontend falls back to grey when both
                # are false, never by interpreting `Status` itself.
                "sectors": line.get("Sectors") or [],
                "last_lap": line.get("LastLapTime") or {},
                "best_lap": line.get("BestLapTime") or {},
                "tyre_compound": current_stint.get("Compound"),
                "tyre_is_new": current_stint.get("New"),
                "stint_laps": current_stint.get("TotalLaps"),
                "pit_count": line.get("NumberOfPitStops"),
                "in_pit": line.get("InPit", False),
                "retired": line.get("Retired", False),
                "personal_best_lap": (stats_lines.get(number) or {}).get("PersonalBestLapTime"),
            }
        return result

    def _derive_positions(self) -> Dict[str, Any]:
        """Position.z's raw shape is `{"Position": [<frame>, ...]}`; F1
        replaces the whole array with a fresh one-element list on every
        delta (it is a plain JSON array in the delta, not an index-keyed
        dict, so merge_delta's "not a dict -> replace wholesale" rule
        applies) — so the current tick is always the last frame."""
        frames = (self._raw.get("Position.z") or {}).get("Position") or []
        if not frames:
            return {}
        entries = (frames[-1] or {}).get("Entries") or {}
        return {
            number: {"x": e.get("X"), "y": e.get("Y"), "z": e.get("Z"), "status": e.get("Status")}
            for number, e in entries.items()
        }

    def _derive_telemetry(self) -> Dict[str, Any]:
        """Same latest-frame reasoning as `_derive_positions`, for
        CarData.z's `Entries` array. Each car's `Channels` dict is keyed
        by a numeric channel id (JSON forces it to a string) that
        CAR_DATA_CHANNELS maps to a field name."""
        frames = (self._raw.get("CarData.z") or {}).get("Entries") or []
        if not frames:
            return {}
        cars = (frames[-1] or {}).get("Cars") or {}
        result: Dict[str, Any] = {}
        for number, car in cars.items():
            channels = (car or {}).get("Channels") or {}
            decoded: Dict[str, Any] = {}
            for channel_id, field_name in self.CAR_DATA_CHANNELS.items():
                decoded[field_name] = channels.get(str(channel_id), channels.get(channel_id))
            result[number] = decoded
        return result

    def _derive_track_status(self) -> Dict[str, Any]:
        return self._raw.get("TrackStatus") or {}

    def _derive_race_control(self) -> List[Dict[str, Any]]:
        """Newest-first (the natural display order), bounded to
        RACE_CONTROL_MAX. The bound applies only to this projection, not
        to `_raw["RaceControlMessages"]` itself — raw state is the SSOT
        (decision 3) and a real session's message count (tens, rarely over
        a hundred) is nowhere near large enough to justify losing history
        there. `None` entries (which `merge_delta`'s list-extension could
        in principle produce for a not-yet-arrived index) are dropped."""
        messages = (self._raw.get("RaceControlMessages") or {}).get("Messages") or []
        ordered = [m for m in reversed(messages) if m is not None]
        return ordered[: self.RACE_CONTROL_MAX]

    def _derive_weather(self) -> Dict[str, Any]:
        return self._raw.get("WeatherData") or {}
