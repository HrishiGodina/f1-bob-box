# Live Timing: Custom SignalR Client Implementation Plan

> **For agentic workers:** This plan follows `superpowers:writing-plans`. Before
> executing any task, read `docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md`
> in full — §3 and §7 are the ground truth for every constant and signature below,
> and they correct `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md`'s
> "Connection lifecycle" section, which describes the wrong (legacy SignalR 1.x)
> protocol. Execute this plan with `superpowers:subagent-driven-development`
> (one subagent per task, parallelizable within a task's dependency wave) or
> `superpowers:executing-plans` (sequential, inline) — confirm which with the
> human before starting Task 1.

**Goal:** Replace the OpenF1-backed live-session view with a custom client for
F1's own SignalR Core live-timing feed, so the dashboard gets sub-second timing,
telemetry, track position, and race control data directly from the source F1
broadcasts to, instead of a third-party mirror.

**Architecture:** A backend-owned `LiveTimingClient` (asyncio, `websockets`)
negotiates and holds the single upstream connection to F1's feed, decodes and
merges every topic into one process-wide `LiveSessionState` (raw topics are the
source of truth; a derived, snake_case, frontend-facing projection is computed
from them), and broadcasts the *complete new value* of each changed derived key
over a bare `/ws/live` WebSocket route to any number of connected browser tabs.
The frontend's `useLiveTimingSocket` hook owns exactly one WebSocket and folds
incoming patches into local state with a pure reducer — it never re-implements
the merge logic; it only ever replaces whole keys.

**Tech Stack:** FastAPI (existing) + `websockets==15.0.1` (new, backend outbound
client and — via its bundled `websockets/legacy/` server — the inbound `/ws/live`
route through uvicorn 0.24) + `httpx` (existing, negotiate handshake) on the
backend; React 19 + a new pure-reducer/hook pair + `vitest` (new, frontend's
first test runner) on the frontend. Python target is 3.9.6 — no PEP 604 `X | Y`
unions, no `match` statements anywhere in new backend code.

**Spec:** `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md`,
corrected by `docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md`
§3 (protocol facts) and §7 (locked decisions/constants). Task 12 writes the
correction back into the spec file itself so it stops being wrong for the next
reader.

## Global Constraints

- **Python 3.9.6 syntax only** in every backend file: use `typing.Optional`,
  `typing.Dict`, `typing.List`, `typing.NamedTuple`, `typing.Any`, `typing.Callable`,
  `typing.Awaitable` — never `X | Y`, never a `match` statement.
- **`websockets==15.0.1` pinned exactly** in `backend/requirements.txt` — the last
  release with a `cp39` wheel containing both `websockets/asyncio/` (used here for
  the outbound client via `from websockets.asyncio.client import connect`) and
  `websockets/legacy/` (required by uvicorn 0.24 for the inbound server route).
- **Backend is the single source of truth for merged state.** Raw topic payloads
  (post index-keyed-dict delta merge) live in `LiveSessionState._raw`; the
  snake_case shape the frontend sees is always a fresh projection computed from
  that raw store, never a second hand-maintained copy.
- **Broadcast patches carry the complete new value of each top-level derived key**
  (`drivers`, `timing`, `positions`, `telemetry`, `track_status`, `race_control`,
  `weather`, `session_info`, `connection_status`, `is_live`) — never a raw delta.
  The frontend reducer only ever replaces whole keys; it must never merge arrays
  or index-keyed dicts itself.
- **Per-topic fail-soft decoding**: if one topic's payload fails to decode/merge,
  log the topic name and a truncated payload prefix, skip that topic, and keep
  the connection open. A malformed message must never crash the client loop.
- **Routing**: existing HTTP routes keep the `/api/` prefix; the new WebSocket
  route is the bare path `/ws/live` (not `/api/ws/live`). The frontend must derive
  the WS URL from `window.location`, not by string-appending onto `API_BASE`.
- **Env flags**: `LIVETIMING_AUTOSTART` (default on; set to `"0"` to disable the
  background client — `backend/conftest.py` sets this for every test so no test
  ever opens a real network connection) and `LIVETIMING_REPLAY` (a filesystem path;
  when set, the app replays that fixture through the real decode/merge/broadcast
  pipeline instead of connecting to F1, for offline frontend development).
- **No placeholder code.** Every step below is real, runnable code. Where the
  handoff explicitly flags a fact as unverified (e.g. the exact field carrying
  session status inside `SessionInfo`), the code still does something concrete
  and safe — it does not stub the behavior out.

## Files

| File | Purpose |
|---|---|
| `backend/livetiming/__init__.py` | New. Empty package marker. |
| `backend/livetiming/decode.py` | New. SignalR Core frame/record parsing, `.z` inflation (Task 1). |
| `backend/livetiming/state.py` | New. `merge_delta` + `LiveSessionState` (Tasks 2-3). |
| `backend/livetiming/recorder.py` | New. Fixture recording + replay-through-pipeline (Task 4). |
| `backend/livetiming/client.py` | New. Negotiate/connect/subscribe/reconnect loop (Task 5). |
| `backend/livetiming/hub.py` | New. Broadcaster: tracks connected `/ws/live` sockets, fans out patches (Task 6). |
| `backend/fixtures/live_timing_sample.jsonl` | New. Recorded-shape fixture for replay tests and `LIVETIMING_REPLAY` (Task 4). |
| `backend/test_livetiming_decode.py` | New (Task 1). |
| `backend/test_livetiming_state.py` | New (Tasks 2-3). |
| `backend/test_livetiming_recorder.py` | New (Task 4). |
| `backend/test_livetiming_client.py` | New (Task 5). |
| `backend/test_livetiming_hub.py` | New (Task 6). |
| `backend/test_main_live.py` | New. `/api/status` + `/ws/live` integration tests (Task 6). |
| `backend/pytest.ini` | New. `asyncio_mode = auto` (Task 1). |
| `backend/conftest.py` | New. Forces `LIVETIMING_AUTOSTART=0` for the whole test session (Task 1). |
| `backend/requirements-dev.txt` | New. Pinned test deps (Task 1). |
| `backend/requirements.txt` | Edited. Add `websockets==15.0.1` (Task 6). |
| `backend/main.py` | Edited. Rewrite `is_live`, delete `/api/live-data` + `/api/location`, add `lifespan` + `/ws/live` (Task 6). |
| `frontend/src/live/types.ts` | New. Shared TS types mirroring the derived state shape (Task 7). |
| `frontend/src/live/liveState.ts` | New. Pure reducer folding patches into state (Task 7). |
| `frontend/src/live/useLiveTimingSocket.ts` | New. Owns the browser's one `/ws/live` connection (Task 7). |
| `frontend/src/live/liveState.test.ts` | New (Task 7). |
| `frontend/src/live/TimingTower.tsx` | New. Leaderboard component (Task 8). |
| `frontend/src/live/TrackMap.tsx` | New. Live car-position map (Task 9). |
| `frontend/src/live/RaceControlFeed.tsx` | New. Race control message feed (Task 10). |
| `frontend/src/live/DriverTelemetryPanel.tsx` | New. Per-driver telemetry gauges (Task 11). |
| `frontend/src/ui/CircularGauge.tsx` | New. Extracted from `App.tsx` (Task 11). |
| `frontend/src/live/LiveDashboard.tsx` | New. Composition root, replaces the old `LiveDashboard` (Task 12). |
| `frontend/src/App.tsx` | Edited. Remove old `LiveDashboard`/`TrackMap`/`CircularGauge`/mock helpers, wire in the new component (Task 12). |
| `frontend/package.json` | Edited. Add `vitest` + a `test` script (Task 7). |
| `frontend/vitest.config.ts` | New (Task 7). |
| `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md` | Edited. §3 correction addendum (Task 12). |
| `README.md` | Edited. API table + Live Session description (Task 12). |
| `MEMORY.md` | Edited. Refreshed component index (Task 12). |

## Task 1: Frame decoding + backend test infrastructure

**Files:**
- `backend/livetiming/__init__.py` (new)
- `backend/livetiming/decode.py` (new)
- `backend/test_livetiming_decode.py` (new)
- `backend/pytest.ini` (new)
- `backend/conftest.py` (new)
- `backend/requirements-dev.txt` (new)

**Interfaces:**
- Produces: `RECORD_SEPARATOR: str`; `class TopicMessage(NamedTuple)` with fields
  `topic: str, data: Any, timestamp: Optional[str]`; `split_records(raw: str) -> List[str]`;
  `inflate_z(payload: str) -> Any`; `decode_topic_payload(topic: str, payload: Any) -> Any`;
  `parse_frame(raw: str) -> List[dict]`; `extract_topic_message(record: dict) -> Optional[TopicMessage]`;
  `extract_snapshot(record: dict) -> Optional[Dict[str, Any]]`.
- Consumes: nothing (foundation task, no dependency on other new modules).

- [ ] **Step 1: Add backend test infrastructure**

  Create `backend/requirements-dev.txt`:

  ```
  pytest==8.4.2
  pytest-asyncio==1.2.0
  respx==0.23.1
  ```

  Create `backend/pytest.ini`:

  ```ini
  [pytest]
  asyncio_mode = auto
  ```

  Create `backend/conftest.py`:

  ```python
  """Test-session setup. Runs before any test module is imported.

  Forces the live-timing background client off for the entire test run —
  no test may open a real network connection to F1's feed. See
  docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
  §7 decision 8.
  """
  import os

  os.environ["LIVETIMING_AUTOSTART"] = "0"
  ```

  Run:
  ```bash
  cd backend && venv/bin/pip install -r requirements-dev.txt
  ```
  Expected: pytest/pytest-asyncio/respx install cleanly (already proven
  compatible with this venv's Python 3.9.6 + existing pinned deps).

- [ ] **Step 2: Create the `livetiming` package**

  Create `backend/livetiming/__init__.py` (empty):

  ```python
  ```

- [ ] **Step 3: Write `split_records` and prove it strips the record separator**

  Create `backend/livetiming/decode.py`:

  ```python
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
  ```

  Create `backend/test_livetiming_decode.py`:

  ```python
  import os
  import sys

  sys.path.insert(0, os.path.dirname(__file__))

  from livetiming.decode import split_records


  def test_split_records_splits_on_record_separator():
      raw = '{"a":1}\x1e{"b":2}\x1e'
      assert split_records(raw) == ['{"a":1}', '{"b":2}']


  def test_split_records_discards_empty_fragments():
      raw = '\x1e{"a":1}\x1e\x1e'
      assert split_records(raw) == ['{"a":1}']
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_decode.py -v
  ```
  Expected: both tests pass.

- [ ] **Step 4: Add `inflate_z` and prove raw-DEFLATE round-trips with negative wbits**

  Add to `backend/livetiming/decode.py`:

  ```python
  def inflate_z(payload: str) -> Any:
      """Decode a `.z`-suffixed topic's payload: base64 -> raw DEFLATE
      (negative wbits — there is no zlib/gzip header, F1's `.z` topics are
      bare DEFLATE streams) -> UTF-8 JSON."""
      raw = zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS)
      return json.loads(raw)
  ```

  Add to `backend/test_livetiming_decode.py`:

  ```python
  import base64
  import zlib

  from livetiming.decode import inflate_z


  def _deflate_b64(obj) -> str:
      compressor = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)
      raw = compressor.compress(json.dumps(obj).encode("utf-8")) + compressor.flush()
      return base64.b64encode(raw).decode("ascii")


  def test_inflate_z_roundtrips_raw_deflate_with_negative_wbits():
      import json

      payload = _deflate_b64({"Entries": [{"Cars": {"1": {"Channels": {"0": 11000}}}}]})
      assert inflate_z(payload) == {"Entries": [{"Cars": {"1": {"Channels": {"0": 11000}}}}]}
  ```

  Note: `_deflate_b64` calls `json.dumps` before `import json` executes in
  test file order — fix by moving `import json` to the top of the test file
  alongside the other imports rather than inside the test function. Final
  top of `backend/test_livetiming_decode.py`:

  ```python
  import base64
  import json
  import os
  import sys
  import zlib

  sys.path.insert(0, os.path.dirname(__file__))

  from livetiming.decode import inflate_z, split_records


  def _deflate_b64(obj) -> str:
      compressor = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)
      raw = compressor.compress(json.dumps(obj).encode("utf-8")) + compressor.flush()
      return base64.b64encode(raw).decode("ascii")
  ```

  (`test_inflate_z_roundtrips_raw_deflate_with_negative_wbits` no longer
  needs its own `import json`.)

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_decode.py -v
  ```
  Expected: 3 tests pass.

- [ ] **Step 5: Add `decode_topic_payload` — the `.z`-vs-plain dispatch**

  Add to `backend/livetiming/decode.py`:

  ```python
  def decode_topic_payload(topic: str, payload: Any) -> Any:
      """Dispatch on topic name: `.z`-suffixed topics (CarData.z, Position.z)
      are inflate_z'd; every other topic's payload is already plain JSON."""
      if topic.endswith(".z") and isinstance(payload, str):
          return inflate_z(payload)
      return payload
  ```

  Add to `backend/test_livetiming_decode.py`:

  ```python
  from livetiming.decode import decode_topic_payload


  def test_decode_topic_payload_inflates_dot_z_topics():
      payload = _deflate_b64({"Position": [{"Entries": {"1": {"X": 10}}}]})
      assert decode_topic_payload("Position.z", payload) == {"Position": [{"Entries": {"1": {"X": 10}}}]}


  def test_decode_topic_payload_passes_through_plain_topics():
      assert decode_topic_payload("TrackStatus", {"Status": "1"}) == {"Status": "1"}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_decode.py -v
  ```
  Expected: 5 tests pass.

- [ ] **Step 6: Add `parse_frame`**

  Add to `backend/livetiming/decode.py`:

  ```python
  def parse_frame(raw: str) -> List[dict]:
      """Parse one WebSocket text frame into its constituent JSON records."""
      return [json.loads(rec) for rec in split_records(raw)]
  ```

  Add to `backend/test_livetiming_decode.py`:

  ```python
  from livetiming.decode import parse_frame


  def test_parse_frame_returns_one_dict_per_record():
      raw = '{"type":6}\x1e{"type":1,"target":"X"}\x1e'
      assert parse_frame(raw) == [{"type": 6}, {"type": 1, "target": "X"}]
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_decode.py -v
  ```
  Expected: 6 tests pass.

- [ ] **Step 7: Add `extract_topic_message`**

  Add to `backend/livetiming/decode.py`:

  ```python
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
  ```

  Add to `backend/test_livetiming_decode.py`:

  ```python
  from livetiming.decode import extract_topic_message


  def test_extract_topic_message_from_invocation_record():
      record = {"type": 1, "target": "feed", "arguments": ["TrackStatus", {"Status": "2"}, "2026-07-26T13:00:00Z"]}
      msg = extract_topic_message(record)
      assert msg == ("TrackStatus", {"Status": "2"}, "2026-07-26T13:00:00Z")


  def test_extract_topic_message_inflates_dot_z_topics():
      payload = _deflate_b64({"Position": [{"Entries": {}}]})
      record = {"type": 1, "target": "feed", "arguments": ["Position.z", payload, "t"]}
      msg = extract_topic_message(record)
      assert msg.data == {"Position": [{"Entries": {}}]}


  def test_extract_topic_message_returns_none_for_non_invocation():
      assert extract_topic_message({"type": 3, "result": {}}) is None
      assert extract_topic_message({"type": 6}) is None


  def test_extract_topic_message_returns_none_for_empty_arguments():
      assert extract_topic_message({"type": 1, "arguments": []}) is None
      assert extract_topic_message({"type": 1}) is None
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_decode.py -v
  ```
  Expected: 10 tests pass.

- [ ] **Step 8: Add `extract_snapshot`**

  Add to `backend/livetiming/decode.py`:

  ```python
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
  ```

  Add to `backend/test_livetiming_decode.py`:

  ```python
  from livetiming.decode import extract_snapshot


  def test_extract_snapshot_decodes_every_topic_including_dot_z():
      position_payload = _deflate_b64({"Position": [{"Entries": {}}]})
      record = {
          "type": 3,
          "result": {
              "TrackStatus": {"Status": "1"},
              "Position.z": position_payload,
          },
      }
      snapshot = extract_snapshot(record)
      assert snapshot == {
          "TrackStatus": {"Status": "1"},
          "Position.z": {"Position": [{"Entries": {}}]},
      }


  def test_extract_snapshot_returns_none_for_non_completion():
      assert extract_snapshot({"type": 1, "arguments": []}) is None
      assert extract_snapshot({"type": 3, "result": "not-a-dict"}) is None
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_decode.py -v
  ```
  Expected: 12 tests pass, 0 failures.

- [ ] **Step 9: Commit**

  ```bash
  cd backend && git add livetiming/__init__.py livetiming/decode.py \
    test_livetiming_decode.py pytest.ini conftest.py requirements-dev.txt
  git commit -m "feat(livetiming): add SignalR Core frame decoding + backend test infra"
  ```

## Task 2: Index-keyed delta merge (`merge_delta`)

**Files:**
- `backend/livetiming/state.py` (new)
- `backend/test_livetiming_state.py` (new)

**Interfaces:**
- Produces: `merge_delta(target: Any, delta: Any) -> Any`.
- Consumes: nothing new (pure function, no dependency on `decode.py`).

This is the single highest-risk piece in the whole feed per the handoff §3.7 —
F1 represents array patches as index-keyed dicts (`{"1": {...}}` patches index 1
of an array) at arbitrary nesting depth, and every recursive call must strip the
noise key `_kf`. Give it the most test coverage of any function in this plan.

- [ ] **Step 1: Plain dict merge (no lists involved)**

  Create `backend/livetiming/state.py`:

  ```python
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

      base = dict(target) if isinstance(target, dict) else {}
      for key, value in delta.items():
          if key == "_kf":
              continue
          base[key] = merge_delta(base.get(key), value)
      return base
  ```

  Create `backend/test_livetiming_state.py`:

  ```python
  import os
  import sys

  sys.path.insert(0, os.path.dirname(__file__))

  from livetiming.state import merge_delta


  def test_merge_delta_merges_plain_dicts():
      target = {"a": 1, "b": 2}
      delta = {"b": 3, "c": 4}
      assert merge_delta(target, delta) == {"a": 1, "b": 3, "c": 4}


  def test_merge_delta_does_not_mutate_target():
      target = {"a": {"b": 1}}
      merge_delta(target, {"a": {"b": 2}})
      assert target == {"a": {"b": 1}}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 2 tests pass.

- [ ] **Step 2: List-index patching, including past-end extension**

  Add to `backend/livetiming/state.py`, replacing the function body (the
  list branch must run *before* the generic dict branch, since a list
  target with a dict delta is the array-patch case, not a plain merge):

  ```python
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
      for key, value in delta.items():
          if key == "_kf":
              continue
          base[key] = merge_delta(base.get(key), value)
      return base
  ```

  Add to `backend/test_livetiming_state.py`:

  ```python
  def test_merge_delta_patches_list_element_by_index():
      target = [{"Value": "28.312"}, {"Value": "31.001"}]
      delta = {"1": {"Value": "30.500"}}
      result = merge_delta(target, delta)
      assert result == [{"Value": "28.312"}, {"Value": "30.500"}]
      assert target == [{"Value": "28.312"}, {"Value": "31.001"}], "target must be untouched"


  def test_merge_delta_extends_list_with_none_past_current_end():
      target = [{"Message": "GREEN"}]
      delta = {"2": {"Message": "YELLOW"}}
      result = merge_delta(target, delta)
      assert result == [{"Message": "GREEN"}, None, {"Message": "YELLOW"}]
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 4 tests pass.

- [ ] **Step 3: Deeply nested index-keyed patches**

  No production code change — `merge_delta` is already recursive. Add to
  `backend/test_livetiming_state.py` to prove the recursion actually reaches
  the exact shape TimingData uses (`Lines.<driver>.Sectors.<n>`):

  ```python
  def test_merge_delta_patches_nested_index_keyed_structure():
      target = {
          "Lines": {
              "1": {
                  "Sectors": [
                      {"Value": "28.312", "PersonalFastest": False},
                      {"Value": "31.001", "PersonalFastest": False},
                  ]
              }
          }
      }
      delta = {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500", "PersonalFastest": True}}}}}
      result = merge_delta(target, delta)
      sectors = result["Lines"]["1"]["Sectors"]
      assert sectors[0] == {"Value": "28.312", "PersonalFastest": False}, "sector 0 untouched"
      assert sectors[1] == {"Value": "30.500", "PersonalFastest": True}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 5 tests pass.

- [ ] **Step 4: `_kf` stripping at every depth**

  No production code change — every recursive call already re-checks
  `key == "_kf"`. Add to `backend/test_livetiming_state.py` to prove it:

  ```python
  def test_merge_delta_strips_kf_noise_key_at_every_depth():
      target = {"Lines": {"1": {"Position": "1"}}, "_kf": True}
      delta = {"_kf": True, "Lines": {"_kf": True, "1": {"_kf": True, "Position": "2"}}}
      result = merge_delta(target, delta)
      assert result == {"Lines": {"1": {"Position": "2"}}}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 6 tests pass.

- [ ] **Step 5: Snapshot ingestion reuses `merge_delta` — no separate code path**

  Add to `backend/test_livetiming_state.py` to lock in the `merge_delta(None, snapshot)`
  contract that Task 3's `LiveSessionState.apply` depends on:

  ```python
  def test_merge_delta_of_none_and_snapshot_ingests_the_snapshot_verbatim_minus_kf():
      snapshot = {"Status": "1", "_kf": True, "Lines": {"1": {"Position": "1", "_kf": True}}}
      result = merge_delta(None, snapshot)
      assert result == {"Status": "1", "Lines": {"1": {"Position": "1"}}}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 7 tests pass, 0 failures.

- [ ] **Step 6: Commit**

  ```bash
  cd backend && git add livetiming/state.py test_livetiming_state.py
  git commit -m "feat(livetiming): add index-keyed delta merge (merge_delta)"
  ```

## Task 3: `LiveSessionState` — raw SSOT + derived projections

**Files:**
- `backend/livetiming/state.py` (edited — appends to the file from Task 2)
- `backend/test_livetiming_state.py` (edited)

**Interfaces:**
- Produces: `class LiveSessionState` with `RACE_CONTROL_MAX: int = 100`,
  `CAR_DATA_CHANNELS: Dict[int, str]`, `apply(topic: str, payload: Any) -> Dict[str, Any]`,
  `apply_many(topics: Dict[str, Any]) -> Dict[str, Any]`,
  `set_connection_status(status: str) -> Dict[str, Any]`,
  `seconds_since_last_message() -> float`, `is_live() -> bool`,
  `snapshot() -> Dict[str, Any]`.
- Consumes: `merge_delta` (Task 2, same file).

Every derived key is a fresh projection computed from `_raw` on every call —
there is no incremental/cached derived state, so there is exactly one thing
that can be wrong about any fact (decision 3). One raw topic can feed more
than one derived key's inputs, but `TOPIC_TO_DERIVED` records which derived
key(s) a topic's update should recompute, so a patch only ever names the keys
that actually changed.

- [ ] **Step 1: Constructor, `snapshot()`, and an always-false `is_live()` on a fresh state**

  Append to `backend/livetiming/state.py`:

  ```python
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

      def seconds_since_last_message(self) -> float:
          """`inf` if no message has ever been received."""
          if self._last_message_at is None:
              return float("inf")
          return time.monotonic() - self._last_message_at

      def is_live(self) -> bool:
          return False  # placeholder — Step 6 fills in the real formula

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
          return {}

      def _derive_timing(self) -> Dict[str, Any]:
          return {}

      def _derive_positions(self) -> Dict[str, Any]:
          return {}

      def _derive_telemetry(self) -> Dict[str, Any]:
          return {}

      def _derive_track_status(self) -> Dict[str, Any]:
          return self._raw.get("TrackStatus") or {}

      def _derive_race_control(self) -> List[Dict[str, Any]]:
          return []

      def _derive_weather(self) -> Dict[str, Any]:
          return self._raw.get("WeatherData") or {}
  ```

  Note the placeholder `is_live` returning `False` and the empty `_derive_*`
  stubs are intentional *within this single TDD step* — Step 6 below replaces
  the `is_live` body with the real formula, and Steps 2-5 fill each `_derive_*`
  stub in turn, each with its own test. This is the one place in this plan a
  function body is temporarily trivial; it does not ship this way.

  Add to `backend/test_livetiming_state.py`:

  ```python
  from livetiming.state import LiveSessionState


  def test_fresh_state_is_not_live_and_snapshot_is_all_empty():
      state = LiveSessionState()
      assert state.is_live() is False
      snap = state.snapshot()
      assert snap["drivers"] == {}
      assert snap["timing"] == {}
      assert snap["connection_status"] == "disconnected"


  def test_seconds_since_last_message_is_infinite_before_any_message():
      state = LiveSessionState()
      assert state.seconds_since_last_message() == float("inf")
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 9 tests pass (7 from Task 2 + 2 new).

- [ ] **Step 2: `apply`/`apply_many` + `_touch()`, and the `drivers` projection**

  Replace the `__init__` and add `apply`/`apply_many`/`_touch` to
  `backend/livetiming/state.py`:

  ```python
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
  ```

  Replace the `_derive_drivers` stub:

  ```python
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
  ```

  Add to `backend/test_livetiming_state.py`:

  ```python
  def test_apply_merges_into_raw_and_returns_is_live_patch():
      state = LiveSessionState()
      patch = state.apply("TrackStatus", {"Status": "1", "Message": "AllClear"})
      assert patch == {"is_live": False, "track_status": {"Status": "1", "Message": "AllClear"}}


  def test_apply_driver_list_projects_snake_case_with_hash_prefixed_colour():
      state = LiveSessionState()
      patch = state.apply("DriverList", {
          "1": {"RacingNumber": "1", "Tla": "VER", "FullName": "Max Verstappen",
                "TeamName": "Red Bull Racing", "TeamColour": "3671C6", "Line": 1},
      })
      assert patch["drivers"]["1"] == {
          "racing_number": "1", "tla": "VER", "full_name": "Max Verstappen",
          "team_name": "Red Bull Racing", "team_colour": "#3671C6", "line": 1,
      }


  def test_apply_many_applies_every_topic_and_unions_the_patches():
      state = LiveSessionState()
      patch = state.apply_many({
          "TrackStatus": {"Status": "1"},
          "DriverList": {"1": {"Tla": "VER"}},
      })
      assert "track_status" in patch and "drivers" in patch


  def test_heartbeat_touches_last_message_but_has_no_derived_key():
      state = LiveSessionState()
      patch = state.apply("Heartbeat", {})
      assert patch == {"is_live": False}
      assert state.seconds_since_last_message() < 1.0
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 13 tests pass.

- [ ] **Step 3: `timing` projection — merges TimingData + TimingAppData + TimingStats**

  Replace the `_derive_timing` stub:

  ```python
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
  ```

  Add to `backend/test_livetiming_state.py`:

  ```python
  def test_timing_projection_combines_all_three_timing_topics():
      state = LiveSessionState()
      state.apply("TimingData", {"Lines": {"1": {
          "Position": "1", "GapToLeader": "",
          "IntervalToPositionAhead": {"Value": "", "Catching": False},
          "Sectors": [{"Value": "28.312", "PersonalFastest": False, "OverallFastest": False}],
          "NumberOfPitStops": 0, "InPit": False, "Retired": False,
      }}})
      state.apply("TimingAppData", {"Lines": {"1": {"Stints": [{"Compound": "SOFT", "New": True, "TotalLaps": 5}]}}})
      state.apply("TimingStats", {"Lines": {"1": {"PersonalBestLapTime": {"Value": "1:18.223"}}}})

      timing = state._derive_timing()
      assert timing["1"]["position"] == "1"
      assert timing["1"]["tyre_compound"] == "SOFT"
      assert timing["1"]["personal_best_lap"] == {"Value": "1:18.223"}


  def test_timing_projection_applies_index_keyed_sector_delta():
      state = LiveSessionState()
      state.apply("TimingData", {"Lines": {"1": {
          "Sectors": [
              {"Value": "28.312", "PersonalFastest": False, "OverallFastest": False},
              {"Value": "31.001", "PersonalFastest": False, "OverallFastest": False},
          ],
      }}})
      state.apply("TimingData", {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500", "PersonalFastest": True}}}}})

      sectors = state._derive_timing()["1"]["sectors"]
      assert sectors[0]["Value"] == "28.312", "sector 0 must be untouched by the sector-1 patch"
      assert sectors[1] == {"Value": "30.500", "PersonalFastest": True}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 15 tests pass.

- [ ] **Step 4: `positions` and `telemetry` projections — latest `.z` frame only**

  Replace the `_derive_positions` and `_derive_telemetry` stubs:

  ```python
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
  ```

  Add to `backend/test_livetiming_state.py`:

  ```python
  def test_positions_projection_reads_the_latest_frame():
      state = LiveSessionState()
      state.apply("Position.z", {"Position": [{"Timestamp": "t", "Entries": {
          "1": {"Status": "OnTrack", "X": 10, "Y": 20, "Z": 0},
      }}]})
      assert state._derive_positions() == {"1": {"x": 10, "y": 20, "z": 0, "status": "OnTrack"}}


  def test_telemetry_projection_decodes_car_data_channels():
      state = LiveSessionState()
      state.apply("CarData.z", {"Entries": [{"Utc": "t", "Cars": {
          "1": {"Channels": {"0": 11000, "2": 300, "3": 8, "4": 100, "5": 0, "45": 1}},
      }}]})
      assert state._derive_telemetry() == {
          "1": {"rpm": 11000, "speed": 300, "gear": 8, "throttle": 100, "brake": 0, "drs": 1},
      }
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 17 tests pass.

- [ ] **Step 5: `race_control` projection — newest-first, bounded**

  Replace the `_derive_race_control` stub:

  ```python
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
  ```

  Add to `backend/test_livetiming_state.py`:

  ```python
  def test_race_control_projection_is_newest_first():
      state = LiveSessionState()
      state.apply("RaceControlMessages", {"Messages": [{"Message": "GREEN LIGHT"}]})
      state.apply("RaceControlMessages", {"Messages": {"1": {"Message": "YELLOW"}}})
      rc = state._derive_race_control()
      assert rc[0]["Message"] == "YELLOW"
      assert rc[1]["Message"] == "GREEN LIGHT"


  def test_race_control_projection_is_bounded_to_race_control_max():
      state = LiveSessionState()
      many = {str(i): {"Message": str(i)} for i in range(150)}
      state.apply("RaceControlMessages", {"Messages": many})
      assert len(state._derive_race_control()) == LiveSessionState.RACE_CONTROL_MAX
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 19 tests pass.

- [ ] **Step 6: The real `is_live()` formula + connection lifecycle**

  Replace the placeholder `is_live` and add `set_connection_status` and
  `_session_status`:

  ```python
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
  ```

  Add to `backend/test_livetiming_state.py`:

  ```python
  def test_is_live_requires_connected_status():
      state = LiveSessionState()
      state.apply("Heartbeat", {})
      assert state.is_live() is False, "never live while disconnected, regardless of message freshness"
      state.set_connection_status("connected")
      assert state.is_live() is True


  def test_is_live_false_when_session_status_is_finalised_or_ends():
      state = LiveSessionState()
      state.set_connection_status("connected")
      state.apply("Heartbeat", {})
      assert state.is_live() is True
      state.apply("SessionInfo", {"SessionStatus": "Finalised"})
      assert state.is_live() is False


  def test_is_live_false_after_120_seconds_of_silence():
      state = LiveSessionState()
      state.set_connection_status("connected")
      state.apply("Heartbeat", {})
      assert state.is_live() is True
      state._last_message_at = time.monotonic() - 200
      assert state.is_live() is False


  def test_set_connection_status_patch_always_includes_is_live():
      state = LiveSessionState()
      patch = state.set_connection_status("connecting")
      assert patch == {"connection_status": "connecting", "is_live": False}
  ```

  Add `import time` to the top of `backend/test_livetiming_state.py` (needed
  by `test_is_live_false_after_120_seconds_of_silence`).

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_state.py -v
  ```
  Expected: 23 tests pass, 0 failures.

- [ ] **Step 7: Commit**

  ```bash
  cd backend && git add livetiming/state.py test_livetiming_state.py
  git commit -m "feat(livetiming): add LiveSessionState raw-SSOT + derived projections"
  ```

## Task 4: Fixture recording/replay + a real 12-line fixture

**Files:**
- `backend/livetiming/recorder.py` (new)
- `backend/fixtures/live_timing_sample.jsonl` (new)
- `backend/test_livetiming_recorder.py` (new)

**Interfaces:**
- Produces: `record_topic(path: str, topic: str, payload: Any, timestamp: Optional[str]) -> None`;
  `record_snapshot(path: str, topics: dict) -> None`; `load_fixture(path: str) -> Iterator[dict]`;
  `PatchHandler = Callable[[dict], Awaitable[None]]`;
  `async replay_fixture(path: str, state: LiveSessionState, on_patch: PatchHandler) -> None`.
- Consumes: `decode_topic_payload` (Task 1, `decode.py`); `LiveSessionState` (Task 3, `state.py`).

This is a developer/test tool, not the spec's "historical persistence/replay
of past live sessions" — that's an explicit non-goal. Nothing here lets a
user browse or replay a *past* live session from the UI: fixtures only feed
`backend/test_livetiming_recorder.py`, Task 6's hub tests, and the
`LIVETIMING_REPLAY` env var (handoff §7 decision 7) for local frontend work
without a live session to connect to. No fixture is persisted across process
restarts, and no HTTP or WebSocket route ever exposes a recorded fixture to
the browser.

The fixture format is one JSON object per line, `{"topic", "payload", "timestamp"}`,
with `.z` topics' payload left exactly as they arrive on the wire — still
base64-encoded, never pre-inflated — so replaying it exercises the real
`decode_topic_payload` inflation, not a shortcut. A topic's *first* line in a
fixture plays the role of that topic's initial snapshot, and any later line
for the same topic plays the role of a delta — there is no separate "is this
a snapshot" flag in the file, because `LiveSessionState.apply` already unifies
both cases (Task 2, Step 5: `merge_delta(None, payload)` is exactly what
happens on a topic's first `apply` call, since `self._raw.get(topic)` is `None`).

- [ ] **Step 1: `record_topic` / `record_snapshot` / `load_fixture`**

  Create `backend/livetiming/recorder.py`:

  ```python
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
  ```

  Create `backend/test_livetiming_recorder.py`:

  ```python
  import os
  import sys

  sys.path.insert(0, os.path.dirname(__file__))

  from livetiming.recorder import load_fixture, record_snapshot, record_topic


  def test_record_topic_then_load_fixture_roundtrips(tmp_path):
      path = str(tmp_path / "sample.jsonl")
      record_topic(path, "TrackStatus", {"Status": "1"}, "2026-07-26T13:00:00.000Z")
      record_topic(path, "TrackStatus", {"Status": "2"}, "2026-07-26T13:00:05.000Z")
      records = list(load_fixture(path))
      assert records == [
          {"topic": "TrackStatus", "payload": {"Status": "1"}, "timestamp": "2026-07-26T13:00:00.000Z"},
          {"topic": "TrackStatus", "payload": {"Status": "2"}, "timestamp": "2026-07-26T13:00:05.000Z"},
      ]


  def test_record_snapshot_writes_one_line_per_topic(tmp_path):
      path = str(tmp_path / "sample.jsonl")
      record_snapshot(path, {"TrackStatus": {"Status": "1"}, "WeatherData": {"AirTemp": "28.4"}})
      records = list(load_fixture(path))
      topics = {r["topic"] for r in records}
      assert topics == {"TrackStatus", "WeatherData"}
      assert all(r["timestamp"] is None for r in records)
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_recorder.py -v
  ```
  Expected: 2 tests pass. (`tmp_path` is pytest's built-in fixture — no
  extra dependency needed.)

- [ ] **Step 2: `replay_fixture`**

  Add to `backend/livetiming/recorder.py`:

  ```python
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
  ```

  Add to `backend/test_livetiming_recorder.py`:

  ```python
  from livetiming.state import LiveSessionState
  from livetiming.recorder import replay_fixture


  async def test_replay_fixture_drives_the_real_decode_and_merge_pipeline(tmp_path):
      path = str(tmp_path / "sample.jsonl")
      record_topic(path, "TrackStatus", {"Status": "1"}, "t")
      record_topic(path, "TimingData", {"Lines": {"1": {"Sectors": [{"Value": "28.312"}, {"Value": "31.001"}]}}}, "t")
      record_topic(path, "TimingData", {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500"}}}}}, "t")

      state = LiveSessionState()
      patches = []

      async def on_patch(patch):
          patches.append(patch)

      await replay_fixture(path, state, on_patch)

      assert len(patches) == 3
      timing = state._derive_timing()
      assert timing["1"]["sectors"][0]["Value"] == "28.312"
      assert timing["1"]["sectors"][1]["Value"] == "30.500"
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_recorder.py -v
  ```
  Expected: 3 tests pass (`pytest-asyncio`'s `asyncio_mode = auto` from Task 1
  picks up the `async def test_...` automatically — no `@pytest.mark.asyncio`
  needed).

- [ ] **Step 3: Add the real 12-line fixture and prove it end to end**

  Create `backend/fixtures/live_timing_sample.jsonl` (twelve lines, one
  JSON object each — SessionInfo/DriverList/TimingData/TimingAppData/
  TimingStats/TrackStatus/RaceControlMessages/WeatherData/CarData.z/
  Position.z as the initial snapshot, then a TimingData sector delta and a
  RaceControlMessages delta):

  ```jsonl
  {"topic": "SessionInfo", "payload": {"Meeting": {"Name": "Hungarian Grand Prix"}, "Type": "Race"}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "DriverList", "payload": {"1": {"RacingNumber": "1", "Tla": "VER", "FullName": "Max Verstappen", "TeamName": "Red Bull Racing", "TeamColour": "3671C6", "Line": 1}, "44": {"RacingNumber": "44", "Tla": "HAM", "FullName": "Lewis Hamilton", "TeamName": "Ferrari", "TeamColour": "E8002D", "Line": 2}}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "TimingData", "payload": {"Lines": {"1": {"Position": "1", "GapToLeader": "", "IntervalToPositionAhead": {"Value": "", "Catching": false}, "Sectors": [{"Value": "28.312", "PersonalFastest": false, "OverallFastest": false}, {"Value": "31.001", "PersonalFastest": false, "OverallFastest": false}], "NumberOfPitStops": 0, "InPit": false, "Retired": false}, "44": {"Position": "2", "GapToLeader": "+1.203", "IntervalToPositionAhead": {"Value": "+1.203", "Catching": false}, "Sectors": [{"Value": "28.501", "PersonalFastest": false, "OverallFastest": false}, {"Value": "31.150", "PersonalFastest": false, "OverallFastest": false}], "NumberOfPitStops": 0, "InPit": false, "Retired": false}}}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "TimingAppData", "payload": {"Lines": {"1": {"Stints": [{"Compound": "SOFT", "New": true, "TotalLaps": 5}]}, "44": {"Stints": [{"Compound": "MEDIUM", "New": true, "TotalLaps": 5}]}}}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "TimingStats", "payload": {"Lines": {"1": {"PersonalBestLapTime": {"Value": "1:18.223"}}, "44": {"PersonalBestLapTime": {"Value": "1:18.760"}}}}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "TrackStatus", "payload": {"Status": "1", "Message": "AllClear"}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "RaceControlMessages", "payload": {"Messages": [{"Category": "Flag", "Message": "GREEN LIGHT - PIT EXIT OPEN"}]}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "WeatherData", "payload": {"AirTemp": "28.4", "TrackTemp": "41.2", "Humidity": "45.0", "Rainfall": "0"}, "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "CarData.z", "payload": "dYxBCsIwEEWvUmZt5U+apLHb4g10o7goUlCQLNruQu7uTy2IC4dh5jHzeUmOcZme4yxddU1yXu4EMTC+Rlsbf9KmA9h7ABfZVdIPUwkn0XX2jyHG8fU5gVPVAcwZsjkEUkNquS13KOAIJWILaM4F7R8bwtcW3Gbzm03X348OmXXLbw==", "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "Position.z", "payload": "q1YKyC/OLMnMz1OyUoiuVgrJzE0tLknMLQBylYwMjMx0Dcx1jcxCDI2tDAyASM/AwCBKSUdByTWvpCgztRiorFrJEEwGlySWlIIElPzzQooSk7NByiKAfEMjYyArEsgyMTUDsqKALINaIMPEBL9GcwtLqEZDA0NDuM7a2thaAA==", "timestamp": "2026-07-26T13:00:00.000Z"}
  {"topic": "TimingData", "payload": {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500", "PersonalFastest": true, "OverallFastest": true}}}}}, "timestamp": "2026-07-26T13:00:05.000Z"}
  {"topic": "RaceControlMessages", "payload": {"Messages": {"1": {"Category": "Flag", "Message": "YELLOW FLAG SECTOR 2"}}}, "timestamp": "2026-07-26T13:00:05.000Z"}
  ```

  The `CarData.z` line decodes to `{"Entries": [{"Utc": "2026-07-26T13:00:00.000Z",
  "Cars": {"1": {"Channels": {"0": 11500, "2": 298, "3": 7, "4": 87, "5": 0, "45": 1}},
  "44": {"Channels": {"0": 10800, "2": 285, "3": 6, "4": 100, "5": 0, "45": 0}}}}]}`.
  The `Position.z` line decodes to `{"Position": [{"Timestamp": "2026-07-26T13:00:00.000Z",
  "Entries": {"1": {"Status": "OnTrack", "X": 123, "Y": 456, "Z": 0},
  "44": {"Status": "OnTrack", "X": 789, "Y": 1011, "Z": 0}}}]}`. Both base64
  strings are raw-DEFLATE (`-zlib.MAX_WBITS`) + base64 of exactly those
  objects, generated and round-trip-verified with the project's own Python
  3.9.6 venv before being written here.

  Add to `backend/test_livetiming_recorder.py`:

  ```python
  FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "live_timing_sample.jsonl")


  async def test_sample_fixture_replays_end_to_end_through_real_pipeline():
      state = LiveSessionState()
      state.set_connection_status("connected")
      patches = []

      async def on_patch(patch):
          patches.append(patch)

      await replay_fixture(FIXTURE_PATH, state, on_patch)

      assert len(patches) == 12
      snap = state.snapshot()

      assert snap["drivers"]["1"]["team_colour"] == "#3671C6"
      assert snap["drivers"]["44"]["tla"] == "HAM"

      timing = snap["timing"]
      assert timing["1"]["sectors"][0]["Value"] == "28.312", "sector 0 untouched by the later delta"
      assert timing["1"]["sectors"][1]["Value"] == "30.500", "sector 1 patched by the delta line"
      assert timing["1"]["sectors"][1]["PersonalFastest"] is True
      assert timing["1"]["tyre_compound"] == "SOFT"

      tel = snap["telemetry"]
      assert tel["1"] == {"rpm": 11500, "speed": 298, "gear": 7, "throttle": 87, "brake": 0, "drs": 1}
      assert tel["44"] == {"rpm": 10800, "speed": 285, "gear": 6, "throttle": 100, "brake": 0, "drs": 0}

      pos = snap["positions"]
      assert pos["1"] == {"x": 123, "y": 456, "z": 0, "status": "OnTrack"}
      assert pos["44"] == {"x": 789, "y": 1011, "z": 0, "status": "OnTrack"}

      rc = snap["race_control"]
      assert rc[0]["Message"] == "YELLOW FLAG SECTOR 2", "newest-first"
      assert rc[1]["Message"] == "GREEN LIGHT - PIT EXIT OPEN"

      assert snap["weather"]["AirTemp"] == "28.4"
      assert snap["track_status"] == {"Status": "1", "Message": "AllClear"}
      assert snap["is_live"] is True
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_recorder.py -v
  ```
  Expected: 4 tests pass, 0 failures. This test is this plan's strongest
  end-to-end guarantee: it exercises real base64/DEFLATE decoding, index-keyed
  delta merging at two different nesting depths, and every derived projection,
  all through the same code path production traffic will use.

- [ ] **Step 4: Commit**

  ```bash
  cd backend && git add livetiming/recorder.py fixtures/live_timing_sample.jsonl test_livetiming_recorder.py
  git commit -m "feat(livetiming): add fixture recording/replay + a verified sample fixture"
  ```

## Task 5: `LiveTimingClient` — negotiate, connect, subscribe, reconnect

**Files:**
- `backend/livetiming/client.py` (new)
- `backend/test_livetiming_client.py` (new)

**Interfaces:**
- Produces: `NEGOTIATE_URL: str`, `WS_URL: str`, `BACKOFF_SCHEDULE: Tuple[int, ...]`,
  `CLIENT_HEADERS: Dict[str, str]`, `SUBSCRIBE_TOPICS: List[str]`,
  `PatchHandler = Callable[[Dict[str, Any]], Awaitable[None]]`,
  `class LiveTimingClient` with `__init__(self, state: LiveSessionState, on_patch: PatchHandler,
  negotiate_url: str = NEGOTIATE_URL, ws_url: str = WS_URL, ws_connect_fn: Callable[..., Any] = ws_connect)`,
  `async run(self) -> None`, `async stop(self) -> None`.
- Consumes: `RECORD_SEPARATOR`, `parse_frame`, `extract_topic_message`, `extract_snapshot`
  (Task 1, `decode.py`); `LiveSessionState` (Task 3, `state.py`).

Verified against the actual installed `websockets==15.0.1` wheel before writing
this task: `websockets.asyncio.client.connect(url, additional_headers=..., max_size=...,
ping_interval=..., ping_timeout=...)` is the real signature — the extra-headers
parameter is named `additional_headers`, not the legacy API's `extra_headers`.

- [ ] **Step 1: Constants + `_negotiate` (httpx handshake, no WebSocket yet)**

  Create `backend/livetiming/client.py`:

  ```python
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
  ```

  Create `backend/test_livetiming_client.py`:

  ```python
  import os
  import sys

  import httpx
  import pytest
  import respx

  sys.path.insert(0, os.path.dirname(__file__))

  from livetiming.client import CLIENT_HEADERS, LiveTimingClient, NEGOTIATE_URL
  from livetiming.state import LiveSessionState


  async def _noop_on_patch(patch):
      pass


  @pytest.mark.respx(base_url=NEGOTIATE_URL)
  async def test_negotiate_returns_the_connection_token():
      with respx.mock:
          respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200, headers={"set-cookie": "sess=abc"}))
          respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
              return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
          )
          client = LiveTimingClient(LiveSessionState(), _noop_on_patch)
          token = await client._negotiate()
          assert token == "tok-123"
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_client.py -v
  ```
  Expected: 1 test passes. (The `@pytest.mark.respx` marker is inert here —
  `with respx.mock:` blocks, matching the existing pattern in
  `test_circuit_history.py`, are what actually intercept the request; remove
  the decorator if pytest warns about an unregistered marker.)

- [ ] **Step 2: `_apply_topic` — the per-topic fail-soft chokepoint**

  Add to `backend/livetiming/client.py`:

  ```python
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
  ```

  Add to `backend/test_livetiming_client.py`:

  ```python
  def test_apply_topic_is_fail_soft_on_a_bad_payload():
      client = LiveTimingClient(LiveSessionState(), _noop_on_patch)
      # RaceControlMessages' "Messages" list-index branch calls int(key) on
      # every delta key once a prior snapshot has made the target a list —
      # seed that, then send a non-numeric key to reproduce a real
      # decode-time failure (ValueError inside merge_delta).
      client._apply_topic("RaceControlMessages", {"Messages": [{"Message": "GREEN"}]})
      patch = client._apply_topic("RaceControlMessages", {"Messages": {"not-a-number": {}}})
      assert patch == {}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_client.py -v
  ```
  Expected: 2 tests pass.

- [ ] **Step 3: `_connect_once` — WS connect, protocol init, Subscribe, receive loop**

  Add to `backend/livetiming/client.py`:

  ```python
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
  ```

  Add to `backend/test_livetiming_client.py`:

  ```python
  class _FakeConnection:
      """Stands in for the object `async with ws_connect(...) as ws` binds —
      an async iterator of text frames with an async `send`."""

      def __init__(self, frames):
          self._frames = list(frames)
          self.sent = []

      async def send(self, message):
          self.sent.append(message)

      def __aiter__(self):
          return self

      async def __anext__(self):
          if not self._frames:
              raise StopAsyncIteration
          return self._frames.pop(0)


  class _FakeConnect:
      """Stands in for `websockets.asyncio.client.connect` — records every
      call's url/kwargs and hands out fake connections in call order."""

      def __init__(self, connections):
          self._connections = list(connections)
          self.calls = []

      def __call__(self, url, **kwargs):
          self.calls.append((url, kwargs))
          return self

      async def __aenter__(self):
          return self._connections.pop(0)

      async def __aexit__(self, *exc_info):
          return False


  @pytest.mark.respx(base_url=NEGOTIATE_URL)
  async def test_connect_once_sends_protocol_init_then_subscribe_with_every_topic():
      with respx.mock:
          respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
          respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
              return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
          )
          fake_conn = _FakeConnection(frames=[])
          fake_connect = _FakeConnect(connections=[fake_conn])
          patches = []

          async def on_patch(patch):
              patches.append(patch)

          client = LiveTimingClient(LiveSessionState(), on_patch, ws_connect_fn=fake_connect)
          await client._connect_once()

          assert fake_connect.calls[0][0] == "wss://livetiming.formula1.com/signalrcore?id=tok-123"
          assert fake_connect.calls[0][1]["additional_headers"] == CLIENT_HEADERS
          assert fake_connect.calls[0][1]["max_size"] is None
          assert fake_conn.sent[0] == '{"protocol": "json", "version": 1}\x1e'
          import json as _json
          subscribe = _json.loads(fake_conn.sent[1].rstrip("\x1e"))
          assert subscribe["target"] == "Subscribe"
          assert subscribe["arguments"] == [[
              "Heartbeat", "SessionInfo", "DriverList", "TimingData", "TimingAppData",
              "TimingStats", "TrackStatus", "RaceControlMessages", "WeatherData",
              "CarData.z", "Position.z",
          ]]
          assert any(p.get("connection_status") == "connected" for p in patches)
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_client.py -v
  ```
  Expected: 3 tests pass.

- [ ] **Step 4: A received frame updates state and broadcasts a patch**

  No production code change. Add to `backend/test_livetiming_client.py`:

  ```python
  @pytest.mark.respx(base_url=NEGOTIATE_URL)
  async def test_connect_once_applies_received_frames_to_state():
      with respx.mock:
          respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
          respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
              return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
          )
          frame = '{"type":1,"target":"feed","arguments":["TrackStatus",{"Status":"2"},"t"]}\x1e'
          fake_conn = _FakeConnection(frames=[frame])
          fake_connect = _FakeConnect(connections=[fake_conn])
          patches = []

          async def on_patch(patch):
              patches.append(patch)

          state = LiveSessionState()
          client = LiveTimingClient(state, on_patch, ws_connect_fn=fake_connect)
          await client._connect_once()

          assert state._derive_track_status() == {"Status": "2"}
          assert any(p.get("track_status") == {"Status": "2"} for p in patches)
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_client.py -v
  ```
  Expected: 4 tests pass.

- [ ] **Step 5: `run` — the outer reconnect-with-backoff loop, and `stop`**

  Add to `backend/livetiming/client.py`:

  ```python
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
  ```

  Add to `backend/test_livetiming_client.py`:

  ```python
  @pytest.mark.respx(base_url=NEGOTIATE_URL)
  async def test_run_reconnects_with_backoff_after_a_failed_connect_then_stops():
      with respx.mock:
          respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
          respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
              return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
          )

          class _FailingConnect:
              def __call__(self, url, **kwargs):
                  return self

              async def __aenter__(self):
                  raise ConnectionRefusedError("boom")

              async def __aexit__(self, *exc_info):
                  return False

          working_frame = '{"type":1,"target":"feed","arguments":["TrackStatus",{"Status":"2"},"t"]}\x1e'
          fake_conn = _FakeConnection(frames=[working_frame])

          calls = {"n": 0}
          failing = _FailingConnect()
          working = _FakeConnect(connections=[fake_conn])

          def ws_connect_fn(url, **kwargs):
              calls["n"] += 1
              return failing if calls["n"] == 1 else working(url, **kwargs)

          statuses = []
          client = None

          async def on_patch(patch):
              statuses.append(patch)
              if patch.get("track_status") == {"Status": "2"}:
                  await client.stop()

          client = LiveTimingClient(LiveSessionState(), on_patch, ws_connect_fn=ws_connect_fn)
          await client.run()

          connection_statuses = [p["connection_status"] for p in statuses if "connection_status" in p]
          assert connection_statuses == ["connecting", "disconnected", "reconnecting", "connected", "disconnected"]
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_client.py -v
  ```
  Expected: 5 tests pass, 0 failures. (This test sleeps for real during
  `BACKOFF_SCHEDULE[0]` = 1 second — the only real delay in the whole suite;
  acceptable for one test, and it proves the actual constant, not a mock of it.)

- [ ] **Step 6: Commit**

  ```bash
  cd backend && git add livetiming/client.py test_livetiming_client.py
  git commit -m "feat(livetiming): add LiveTimingClient negotiate/connect/subscribe/reconnect"
  ```

## Task 6: `hub.py` broadcaster + `main.py` wiring (deletes `/api/live-data`, `/api/location`)

This is the widest-blast-radius task in the plan: it deletes two existing
public routes and rewrites a third. Tasks 1-5 were purely additive; nothing
in the running app changed. From this task onward, the OLD frontend
`LiveDashboard` component in `App.tsx` (the one being replaced wholesale by
Task 12, not the new one Task 8-11 build) is intentionally left partially
broken until Task 12 lands: it calls `GET /api/live-data` and
`GET /api/location` (both deleted below) and reads `status.session_key` /
`status.no_api_access` / `status.session_name` (all removed from
`/api/status`'s response below). That component's own fetch is already
wrapped in `try { ... } catch (e) { console.error(e); }` (`frontend/src/App.tsx`
line 771), so the failure mode between this task and Task 12 is a 404 logged
to the console and an empty leaderboard/telemetry panel — not a crash. This
was confirmed by reading the current component before writing this task, and
is an accepted consequence of the task ordering (Tasks 7-11 build the new
frontend components in isolation, without touching `App.tsx`; Task 12 does
the swap and deletes the old component). If you are executing this plan
piecemeal and find that gap uncomfortable to live with between sessions,
reorder Task 12 immediately after this one — nothing about Task 12 depends
on Tasks 7-11 having landed first, they're independent frontend builds.

**Files:**
- `backend/livetiming/hub.py` (new)
- `backend/test_livetiming_hub.py` (new)
- `backend/main.py` (edited)
- `backend/requirements.txt` (edited)
- `backend/test_main_live.py` (new)

**Interfaces:**
- Produces: `class Broadcaster` with `async register(websocket) -> None`,
  `async unregister(websocket) -> None`, `async broadcast(patch: Dict[str, Any]) -> None`;
  `main.py`'s `lifespan` async context manager; a rewritten `GET /api/status`
  returning only `{"is_live": bool}`; a new `WEBSOCKET /ws/live` route (bare,
  not `/api/`-prefixed, per handoff §7 decision 8).
- Consumes: `LiveSessionState` (Task 3, `state.py`), `replay_fixture` (Task 4,
  `recorder.py`), `LiveTimingClient` (Task 5, `client.py`).
- Deletes: `GET /api/live-data` and `GET /api/location` (both currently in
  `main.py`) — fully superseded by the raw-topic-derived `timing` /
  `positions` / `telemetry` keys pushed over `/ws/live`.

Every code change below against `main.py` was written against the file's
actual current content, read fresh immediately before writing this task (not
reconstructed from memory), and the full lifespan-to-broadcast-to-`/ws/live`
wiring was verified end-to-end in a scratch reproduction of this exact design
— including the `LIVETIMING_REPLAY` path replaying the real Task 4 fixture
through the real `decode.py`/`state.py`/`recorder.py` pipeline into a
`TestClient` WebSocket connection, and asserting on the fully-merged state
(driver TLAs, the index-patched sector delta, decoded telemetry/position
channels, and newest-first race control ordering) — before it was written
here. `TestClient(app)` used bare (no `with`) does **not** run FastAPI's
`lifespan` — confirmed by direct test — so every test below that needs
`app.state.live_state` / `app.state.broadcaster` to exist uses
`with TestClient(app) as client:`. This is a deliberate departure from the
bare `client = TestClient(app)` module-level pattern in the existing
`backend/test_circuit_history.py`, which never touches `app.state` and so
never needed lifespan to run. Don't "fix" the new tests back to the old
pattern — they will fail with `AttributeError` if you do.

- [ ] **Step 1: `Broadcaster` — fan-out with per-client failure isolation**

  Create `backend/livetiming/hub.py`:

  ```python
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
  ```

  Create `backend/test_livetiming_hub.py`:

  ```python
  import sys, os
  sys.path.insert(0, os.path.dirname(__file__))

  from livetiming.hub import Broadcaster


  class _FakeClient:
      def __init__(self, fail: bool = False):
          self.fail = fail
          self.received = []

      async def send_text(self, message):
          if self.fail:
              raise RuntimeError("connection closed")
          self.received.append(message)


  async def test_broadcast_delivers_to_all_registered_clients():
      hub = Broadcaster()
      a, b = _FakeClient(), _FakeClient()
      await hub.register(a)
      await hub.register(b)

      await hub.broadcast({"is_live": True})

      assert a.received == ['{"is_live": true}']
      assert b.received == ['{"is_live": true}']


  async def test_broadcast_isolates_a_dead_client_and_evicts_it():
      hub = Broadcaster()
      good, bad = _FakeClient(), _FakeClient(fail=True)
      await hub.register(good)
      await hub.register(bad)

      await hub.broadcast({"is_live": True})  # bad raises; good must still get it

      assert good.received == ['{"is_live": true}']
      await hub.broadcast({"is_live": False})  # bad was evicted, so no second raise
      assert good.received == ['{"is_live": true}', '{"is_live": false}']


  async def test_unregister_stops_delivery():
      hub = Broadcaster()
      client = _FakeClient()
      await hub.register(client)
      await hub.unregister(client)

      await hub.broadcast({"is_live": True})

      assert client.received == []


  async def test_broadcast_is_a_no_op_with_no_clients_or_empty_patch():
      hub = Broadcaster()
      await hub.broadcast({"is_live": True})  # no clients registered — must not raise

      client = _FakeClient()
      await hub.register(client)
      await hub.broadcast({})  # empty patch — must not send anything
      assert client.received == []
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_livetiming_hub.py -v
  ```
  Expected: 4 tests pass, 0 failures.

- [ ] **Step 2: `requirements.txt` pin + `main.py` lifespan wiring**

  In `backend/requirements.txt`, add one line (`websockets` is
  `LiveTimingClient`'s only runtime dependency beyond what's already pinned;
  handoff §7 decision 1 pins the exact patch version):

  ```
  websockets==15.0.1
  ```

  In `backend/main.py`, replace lines 1-12 (every import plus the
  `app = FastAPI(...)` line) with:

  ```python
  import asyncio
  import os
  import sys
  from contextlib import asynccontextmanager
  from datetime import datetime, timedelta, timezone
  from typing import Optional

  # main.py is run both as `uvicorn main:app` (Railway, cwd=backend/) and
  # imported by test files that already do this same insert — belt-and-
  # suspenders so `import livetiming` resolves regardless of invocation cwd.
  sys.path.insert(0, os.path.dirname(__file__))

  from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
  from fastapi.middleware.cors import CORSMiddleware
  import httpx
  from dotenv import load_dotenv

  from livetiming.client import LiveTimingClient
  from livetiming.hub import Broadcaster
  from livetiming.recorder import replay_fixture
  from livetiming.state import LiveSessionState

  load_dotenv()

  # Our own choice for LIVETIMING_REPLAY dev-loop pacing — not a locked
  # constant from the handoff.
  LIVETIMING_REPLAY_DELAY_SECONDS = 5


  async def _run_replay_loop(path: str, live_state: LiveSessionState, broadcaster: Broadcaster) -> None:
      """LIVETIMING_REPLAY dev mode: loop the fixture through the real
      decode -> state -> broadcast pipeline forever, so a frontend developer
      sees a live-looking feed without ever touching F1's servers.
      Connection status is set once, up front; replay itself only ever
      calls LiveSessionState.apply (Task 4's replay_fixture), never
      set_connection_status — a fixture file has no connection lifecycle of
      its own."""
      patch = live_state.set_connection_status("connected")
      await broadcaster.broadcast(patch)
      while True:
          await replay_fixture(path, live_state, broadcaster.broadcast)
          await asyncio.sleep(LIVETIMING_REPLAY_DELAY_SECONDS)


  @asynccontextmanager
  async def lifespan(app: FastAPI):
      live_state = LiveSessionState()
      broadcaster = Broadcaster()
      app.state.live_state = live_state
      app.state.broadcaster = broadcaster

      client: Optional[LiveTimingClient] = None
      background_task: Optional["asyncio.Task[None]"] = None

      if os.environ.get("LIVETIMING_AUTOSTART", "1") != "0":
          replay_path = os.environ.get("LIVETIMING_REPLAY")
          if replay_path:
              background_task = asyncio.ensure_future(_run_replay_loop(replay_path, live_state, broadcaster))
          else:
              client = LiveTimingClient(live_state, broadcaster.broadcast)
              background_task = asyncio.ensure_future(client.run())

      yield

      if client is not None:
          await client.stop()  # cooperative: takes effect at run()'s next loop boundary
      if background_task is not None:
          background_task.cancel()  # forceful: unwinds even a suspended no-timeout WS read
          try:
              await background_task
          except asyncio.CancelledError:
              pass


  app = FastAPI(title="F1 Dashboard API", lifespan=lifespan)
  ```

  `"asyncio.Task[None]"` is quoted because `asyncio.Task` is not subscriptable
  at runtime on Python 3.9 — as a string it's a forward-reference type hint
  only, never evaluated, so this is 3.9.6-safe (no `from __future__ import
  annotations` needed since the subscript never executes).

  Lines 13-138 of the original file (IST constant, CORS `add_middleware`
  block, `OPENF1_BASE_URL`/`JOLPICA_BASE_URL`/`ESPN_NEWS_URL` constants,
  `get_openf1_headers()`, and every route handler other than `/api/status`)
  are unchanged by this step.

  No test yet — this step only wires state that Steps 3-4 make reachable
  from HTTP. Confirm it at least imports cleanly:
  ```bash
  cd backend && venv/bin/python -c "import main"
  ```
  Expected: no output, exit code 0.

- [ ] **Step 3: `/ws/live` route**

  In `backend/main.py`, immediately after the existing CORS
  `app.add_middleware(...)` block (still before `OPENF1_BASE_URL = ...`),
  insert:

  ```python
  @app.websocket("/ws/live")
  async def ws_live(websocket: WebSocket) -> None:
      await websocket.accept()
      broadcaster: Broadcaster = websocket.app.state.broadcaster
      live_state: LiveSessionState = websocket.app.state.live_state
      await broadcaster.register(websocket)
      try:
          # Full current state on connect, so a client that joins mid-session
          # doesn't have to wait for the next delta to see anything.
          await websocket.send_json(live_state.snapshot())
          while True:
              # The frontend never sends anything meaningful up this socket;
              # this purely blocks until the browser disconnects.
              await websocket.receive_text()
      except WebSocketDisconnect:
          pass
      finally:
          await broadcaster.unregister(websocket)
  ```

  Add to `backend/test_main_live.py` (new file):

  ```python
  import os
  import sys
  sys.path.insert(0, os.path.dirname(__file__))

  from fastapi.testclient import TestClient

  from main import app

  FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "live_timing_sample.jsonl")


  def test_ws_live_sends_initial_snapshot_on_connect():
      with TestClient(app) as client:  # runs lifespan; LIVETIMING_AUTOSTART=0 via conftest.py
          with client.websocket_connect("/ws/live") as ws:
              snapshot = ws.receive_json()
              assert snapshot == {
                  "connection_status": "disconnected", "is_live": False,
                  "session_info": {}, "drivers": {}, "timing": {}, "positions": {},
                  "telemetry": {}, "track_status": {}, "race_control": [], "weather": {},
              }
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_main_live.py -v
  ```
  Expected: 1 test passes. This confirms the route, the registration, and
  `LiveSessionState.snapshot()`'s empty-state shape (Task 3) all agree —
  with no background task running (autostart is off), the snapshot is
  exactly a freshly-constructed state's defaults.

- [ ] **Step 4: Rewrite `/api/status`; delete `/api/live-data` and `/api/location`**

  In `backend/main.py`, replace the entire existing `/api/status` handler
  (currently the `mock`-branch / OpenF1-session-window version) with:

  ```python
  @app.get("/api/status")
  async def get_status():
      """Live-session detection now comes from our own SignalR connection
      (Task 3's LiveSessionState.is_live(), fed by Task 5's LiveTimingClient
      or Task 6's LIVETIMING_REPLAY loop) instead of an OpenF1 session-time
      heuristic. The old `mock` query param and its session_key/session_name/
      no_api_access fields are gone with it — nothing in the frontend called
      `?mock=true` (confirmed by search), and those fields only ever existed
      to support the OpenF1-window heuristic this replaces."""
      live_state: LiveSessionState = app.state.live_state
      return {"is_live": live_state.is_live()}
  ```

  Delete the entire existing `GET /api/live-data` handler (`async def
  get_live_data(session_key: int, driver_number: Optional[int] = None)`) and
  the entire existing `GET /api/location` handler (`async def
  get_location(session_key: int)`) — both fully superseded by the `timing`,
  `positions`, and `telemetry` keys `LiveSessionState` derives and
  `/ws/live` pushes.

  Add to `backend/test_main_live.py`:

  ```python
  def test_status_reports_not_live_with_no_connection():
      with TestClient(app) as client:
          response = client.get("/api/status")
          assert response.status_code == 200
          assert response.json() == {"is_live": False}


  def test_status_has_no_leftover_mock_or_session_fields():
      with TestClient(app) as client:
          response = client.get("/api/status")
          body = response.json()
          assert set(body.keys()) == {"is_live"}


  def test_deleted_routes_are_gone():
      with TestClient(app) as client:
          assert client.get("/api/live-data", params={"session_key": 1}).status_code == 404
          assert client.get("/api/location", params={"session_key": 1}).status_code == 404
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_main_live.py -v
  ```
  Expected: 4 tests pass (the Step 3 test plus these three), 0 failures.

- [ ] **Step 5: Integration test — `LIVETIMING_REPLAY` through the full pipeline into `/ws/live`**

  This is the one test in the whole plan that exercises every backend piece
  built so far as a single running system: `lifespan` reads env vars, starts
  `_run_replay_loop`, which drives Task 4's `replay_fixture` over Task 1's
  `decode.py` and Task 3's `LiveSessionState`, broadcasting through this
  task's `Broadcaster` to a real `/ws/live` WebSocket connection — and
  `/api/status` must agree with what that connection saw.

  Add to `backend/test_main_live.py`:

  ```python
  def test_livetiming_replay_flows_end_to_end_into_ws_live_and_status(monkeypatch):
      # conftest.py forces LIVETIMING_AUTOSTART=0 globally so importing main.py
      # never starts a real network connection during unrelated test runs
      # (e.g. test_circuit_history.py). This test explicitly re-enables it and
      # points it at the fixture — monkeypatch reverts both after the test.
      monkeypatch.setenv("LIVETIMING_AUTOSTART", "1")
      monkeypatch.setenv("LIVETIMING_REPLAY", FIXTURE_PATH)

      with TestClient(app) as client:
          with client.websocket_connect("/ws/live") as ws:
              merged = {}
              # One full replay lap is 12 fixture patches + 1 connection-status
              # patch; whether our connect-time snapshot already reflects a
              # completed lap (racy — see Task 6 header) or arrives interleaved
              # with broadcasts, this bound is generous enough either way and
              # still finite, so a wiring bug fails fast instead of hanging.
              for _ in range(13):
                  merged.update(ws.receive_json())
                  if merged.get("race_control") and "44" in merged.get("drivers", {}):
                      break

          assert merged["is_live"] is True
          assert merged["drivers"]["1"]["tla"] == "VER"
          assert merged["drivers"]["44"]["tla"] == "HAM"
          assert merged["timing"]["1"]["position"] == "1"
          # the fixture's second TimingData line is an index-keyed sector
          # delta (Task 2's merge_delta) — sector index 1 must show the patch,
          # not the original snapshot value.
          assert merged["timing"]["1"]["sectors"][1]["PersonalFastest"] is True
          assert merged["telemetry"]["1"]["speed"] == 298
          assert merged["positions"]["44"]["x"] == 789
          # race control newest-first (Task 3's _derive_race_control)
          assert merged["race_control"][0]["Message"] == "YELLOW FLAG SECTOR 2"
          assert merged["race_control"][1]["Message"] == "GREEN LIGHT - PIT EXIT OPEN"

          status_response = client.get("/api/status")
          assert status_response.json() == {"is_live": True}
  ```

  Run:
  ```bash
  cd backend && venv/bin/python -m pytest test_main_live.py -v
  ```
  Expected: 5 tests pass, 0 failures. This exact scenario — fixture path,
  assertions, and the `monkeypatch.setenv` overrides — was run against a
  scratch reproduction of this design before being written here, and passed.

- [ ] **Step 6: Commit**

  ```bash
  cd backend && git add livetiming/hub.py test_livetiming_hub.py main.py \
    requirements.txt test_main_live.py
  git commit -m "feat(livetiming): wire lifespan, /ws/live, and LIVETIMING_REPLAY; retire OpenF1 live routes"
  ```

## Task 7: Frontend types + pure `liveState` reducer + `useLiveTimingSocket` hook

First frontend task. `frontend/src/` is currently flat (only `circuits/` and
`assets/` subdirectories exist besides `App.tsx`) — this task introduces
`frontend/src/live/` to group every new live-timing file together, since
there are eight of them coming across Tasks 7-12 and dumping them flat
alongside `App.tsx` would work against Component Cohesion. Two frontend
tsconfig settings shape everything written below: `verbatimModuleSyntax`
means every type-only import must say `import type`, and `erasableSyntaxOnly`
forbids real `enum` — `ConnectionStatus` below is a string-literal union
instead. Both files' full content, plus the hook, were typechecked against
the project's actual `tsconfig.app.json` (`tsc -b`, zero errors, including
`noUnusedLocals`/`noUnusedParameters`) before being written here; a
deliberately-injected type error was also confirmed to fail that same check,
so the clean result isn't a misconfigured no-op.

**Files:**
- `frontend/src/live/types.ts` (new)
- `frontend/src/live/liveState.ts` (new)
- `frontend/src/live/useLiveTimingSocket.ts` (new)
- `frontend/src/live/liveState.test.ts` (new)
- `frontend/package.json` (edited — add `vitest`, a `test` script)
- `frontend/vitest.config.ts` (new)

**Interfaces:**
- Produces: types `ConnectionStatus`, `DriverInfo`, `SectorTime`, `LapTime`,
  `TimingLine`, `PositionEntry`, `TelemetryChannels`, `RaceControlMessage`,
  `SessionInfo`, `TrackStatusInfo`, `WeatherInfo`, `LiveSnapshot`,
  `LivePatch = Partial<LiveSnapshot>` (`types.ts`); `INITIAL_LIVE_STATE: LiveSnapshot`,
  `applyLivePatch(state: LiveSnapshot, patch: LivePatch): LiveSnapshot`,
  `deriveWsUrl(apiBase: string): string` (`liveState.ts`);
  `useLiveTimingSocket(): LiveSnapshot` (`useLiveTimingSocket.ts`).
- Consumes: nothing backend-side (frontend-only task); reuses the existing
  `API_BASE` env-var convention already in `App.tsx`
  (`(import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000/api"`)
  rather than introducing a second env var for the WebSocket URL.

- [ ] **Step 1: `types.ts` — shapes mirroring `LiveSessionState`'s derived projections**

  Create `frontend/src/live/types.ts`:

  ```typescript
  // Shared types mirroring backend/livetiming/state.py's LiveSessionState
  // derived projections (see docs/superpowers/handoffs/2026-08-17-live-timing-
  // signalr-context-transfer.md §7). The backend is the source of truth for
  // shape; these types describe what it promises to send, not a separate
  // contract we invented independently.

  export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

  export interface DriverInfo {
    racing_number: string;
    tla: string | null;
    full_name: string | null;
    team_name: string | null;
    team_colour: string | null;
    line: number | null;
  }

  export interface SectorTime {
    Value?: string;
    PersonalFastest?: boolean;
    OverallFastest?: boolean;
  }

  export interface LapTime {
    Value?: string;
  }

  export interface TimingLine {
    position: string | null;
    gap_to_leader: string | null;
    interval: string | null;
    catching: boolean;
    sectors: SectorTime[];
    last_lap: LapTime;
    best_lap: LapTime;
    tyre_compound: string | null;
    tyre_is_new: boolean | null;
    stint_laps: number | null;
    pit_count: number | null;
    in_pit: boolean;
    retired: boolean;
    personal_best_lap: LapTime | null;
  }

  export interface PositionEntry {
    x: number | null;
    y: number | null;
    z: number | null;
    status: string | null;
  }

  export interface TelemetryChannels {
    rpm: number | null;
    speed: number | null;
    gear: number | null;
    throttle: number | null;
    brake: number | null;
    drs: number | null;
  }

  // RaceControlMessages, SessionInfo, TrackStatus, and WeatherData are passed
  // through by the backend largely as F1 sends them (state.py only reshapes
  // DriverList/TimingData*/Position.z/CarData.z into the snake_case types
  // above). The handoff and Task 4's fixture only confirm the fields below;
  // the index signature keeps these forward-compatible with real F1 payloads
  // without claiming a completeness this plan can't verify.
  export interface RaceControlMessage {
    Category?: string;
    Message?: string;
    [key: string]: unknown;
  }

  export interface SessionInfo {
    Meeting?: { Name?: string };
    Type?: string;
    [key: string]: unknown;
  }

  export interface TrackStatusInfo {
    Status?: string;
    Message?: string;
    [key: string]: unknown;
  }

  export interface WeatherInfo {
    AirTemp?: string;
    TrackTemp?: string;
    Humidity?: string;
    Rainfall?: string;
    [key: string]: unknown;
  }

  export interface LiveSnapshot {
    connection_status: ConnectionStatus;
    is_live: boolean;
    session_info: SessionInfo;
    drivers: Record<string, DriverInfo>;
    timing: Record<string, TimingLine>;
    positions: Record<string, PositionEntry>;
    telemetry: Record<string, TelemetryChannels>;
    track_status: TrackStatusInfo;
    race_control: RaceControlMessage[];
    weather: WeatherInfo;
  }

  // What actually arrives over /ws/live: the backend always sends the
  // complete new value for every top-level key it's patching (never a raw
  // delta) — see LiveSessionState._derive_patch_for_topic. A LivePatch is
  // therefore always a subset of LiveSnapshot's keys, each fully resolved.
  export type LivePatch = Partial<LiveSnapshot>;
  ```

  No runtime behavior yet — confirm it typechecks:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0.

- [ ] **Step 2: Vitest infrastructure + `liveState.ts`'s reducer and `deriveWsUrl`**

  In `frontend/package.json`, add to `"devDependencies"`:
  ```json
  "vitest": "^4.1.10"
  ```
  and add to `"scripts"`:
  ```json
  "test": "vitest run"
  ```
  (`run`, not the bare watch-mode default — every other script in this file
  is one-shot and CI-friendly; tests should terminate with a pass/fail, not
  hang open.) Then install:
  ```bash
  cd frontend && npm install
  ```

  Create `frontend/vitest.config.ts` (separate from `vite.config.ts` — that
  file's `defineConfig` comes from plain `"vite"`, whose `UserConfig` type
  doesn't know about a `test` key; a standalone Vitest config avoids a type
  error without touching the existing build's chunk-splitting config):
  ```typescript
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: {
      environment: "node", // liveState.ts is pure logic — no DOM needed
    },
  });
  ```

  Create `frontend/src/live/liveState.ts`:

  ```typescript
  import type { LivePatch, LiveSnapshot } from "./types";

  // Mirrors LiveSessionState.snapshot()'s empty-state shape exactly (backend/
  // livetiming/state.py) — verified against the actual empty-snapshot test in
  // backend/test_main_live.py (Task 6, Step 3).
  export const INITIAL_LIVE_STATE: LiveSnapshot = {
    connection_status: "disconnected",
    is_live: false,
    session_info: {},
    drivers: {},
    timing: {},
    positions: {},
    telemetry: {},
    track_status: {},
    race_control: [],
    weather: {},
  };

  // Deliberately a shallow merge, not a recursive one: the backend already
  // resolved every delta (Task 2's merge_delta) before broadcasting, so each
  // key in a patch is a complete, final value. Recursively merging here would
  // re-introduce the exact class of bug Task 2 exists to avoid — stale
  // nested fields surviving under a key the backend meant to fully replace.
  export function applyLivePatch(state: LiveSnapshot, patch: LivePatch): LiveSnapshot {
    return { ...state, ...patch };
  }

  // Derives the /ws/live WebSocket URL from the existing VITE_API_BASE
  // (App.tsx already defines API_BASE = ".../api"), rather than introducing a
  // second env var that could drift out of sync with it across deployments.
  // /ws/live is bare, not /api-prefixed (handoff §7 decision 8), so the /api
  // suffix is stripped before swapping the scheme.
  export function deriveWsUrl(apiBase: string): string {
    const withoutApiSuffix = apiBase.replace(/\/api\/?$/, "");
    const wsBase = withoutApiSuffix.replace(/^http/, "ws"); // http->ws, https->wss
    return `${wsBase}/ws/live`;
  }
  ```

  Create `frontend/src/live/liveState.test.ts`:

  ```typescript
  import { describe, expect, it } from "vitest";
  import { INITIAL_LIVE_STATE, applyLivePatch, deriveWsUrl } from "./liveState";

  describe("applyLivePatch", () => {
    it("merges a patch key in without disturbing other keys", () => {
      const next = applyLivePatch(INITIAL_LIVE_STATE, { drivers: { "1": { racing_number: "1", tla: "VER", full_name: null, team_name: null, team_colour: null, line: null } } });
      expect(next.drivers["1"].tla).toBe("VER");
      expect(next.is_live).toBe(false);
      expect(next.timing).toBe(INITIAL_LIVE_STATE.timing); // untouched key, same reference
    });

    it("accumulates keys from separate patches applied in sequence", () => {
      const afterDrivers = applyLivePatch(INITIAL_LIVE_STATE, { drivers: { "1": { racing_number: "1", tla: "VER", full_name: null, team_name: null, team_colour: null, line: null } } });
      const afterTiming = applyLivePatch(afterDrivers, { timing: { "1": { position: "1", gap_to_leader: null, interval: null, catching: false, sectors: [], last_lap: {}, best_lap: {}, tyre_compound: null, tyre_is_new: null, stint_laps: null, pit_count: null, in_pit: false, retired: false, personal_best_lap: null } } });
      expect(afterTiming.drivers["1"].tla).toBe("VER");
      expect(afterTiming.timing["1"].position).toBe("1");
    });

    it("lets a later patch fully replace an earlier value for the same key (shallow, not deep-merged)", () => {
      const live = applyLivePatch(INITIAL_LIVE_STATE, { is_live: true });
      const offlineAgain = applyLivePatch(live, { is_live: false });
      expect(offlineAgain.is_live).toBe(false);
    });

    it("never mutates the state object passed in", () => {
      const before = JSON.stringify(INITIAL_LIVE_STATE);
      applyLivePatch(INITIAL_LIVE_STATE, { is_live: true });
      expect(JSON.stringify(INITIAL_LIVE_STATE)).toBe(before);
    });
  });

  describe("deriveWsUrl", () => {
    it("derives a ws:// url from a plain http API base", () => {
      expect(deriveWsUrl("http://localhost:8000/api")).toBe("ws://localhost:8000/ws/live");
    });

    it("derives a wss:// url from an https API base", () => {
      expect(deriveWsUrl("https://f1-dashboard-backend.up.railway.app/api")).toBe(
        "wss://f1-dashboard-backend.up.railway.app/ws/live"
      );
    });

    it("tolerates a trailing slash on the API base", () => {
      expect(deriveWsUrl("http://localhost:8000/api/")).toBe("ws://localhost:8000/ws/live");
    });
  });
  ```

  Run:
  ```bash
  cd frontend && npm test
  ```
  Expected: 7 tests pass, 0 failures. (All seven assertions above were
  independently verified against the exact same reducer/URL logic via a
  throwaway Node script before being written into this test file.)

- [ ] **Step 3: `useLiveTimingSocket` hook**

  Create `frontend/src/live/useLiveTimingSocket.ts`:

  ```typescript
  import { useEffect, useState } from "react";
  import type { LivePatch, LiveSnapshot } from "./types";
  import { INITIAL_LIVE_STATE, applyLivePatch, deriveWsUrl } from "./liveState";

  const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000/api";

  // The frontend's own reconnect delay for the browser <-> backend /ws/live
  // link. This is unrelated to (and much simpler than) BACKOFF_SCHEDULE in
  // backend/livetiming/client.py, which governs the backend's own reconnect
  // to F1's servers — two independent links, two independent policies. When
  // this link re-establishes, the backend immediately sends a fresh full
  // snapshot (Task 6's /ws/live route), so the frontend needs no special
  // catch-up logic beyond just reconnecting.
  const RECONNECT_DELAY_MS = 3000;

  // Owns the single browser connection to /ws/live and folds incoming
  // patches into a LiveSnapshot via the pure applyLivePatch reducer
  // (liveState.ts). connection_status/is_live on the returned snapshot
  // reflect the backend's link to F1, not this hook's own link to the
  // backend — that link's health is handled transparently by the reconnect
  // loop below.
  export function useLiveTimingSocket(): LiveSnapshot {
    const [state, setState] = useState<LiveSnapshot>(INITIAL_LIVE_STATE);

    useEffect(() => {
      let socket: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;

      const connect = () => {
        if (stopped) return;
        socket = new WebSocket(deriveWsUrl(API_BASE));

        socket.onmessage = (event: MessageEvent<string>) => {
          try {
            const patch = JSON.parse(event.data) as LivePatch;
            setState((prev) => applyLivePatch(prev, patch));
          } catch (error) {
            console.error("failed to parse /ws/live message", error);
          }
        };

        socket.onclose = () => {
          if (stopped) return;
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        };

        socket.onerror = () => {
          socket?.close();
        };
      };

      connect();

      return () => {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        socket?.close();
      };
    }, []);

    return state;
  }
  ```

  No new automated test — this hook is a thin, side-effecting wrapper around
  the already-tested pure functions above; Task 12 exercises it for real
  once it's wired into the running app. Confirm it typechecks alongside
  everything else:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

  ```bash
  cd frontend && git add src/live/types.ts src/live/liveState.ts \
    src/live/useLiveTimingSocket.ts src/live/liveState.test.ts \
    package.json package-lock.json vitest.config.ts
  git commit -m "feat(live): add types, pure liveState reducer, and useLiveTimingSocket hook"
  ```

## Task 8: `TimingTower.tsx` — full-grid leaderboard

Spec goal: "Live timing tower for every driver: position, gap, interval,
sector times (with personal/session-best coloring), tyre compound + stint,
pit stop count." This task is purely additive — a new file with no App.tsx
wiring yet (that's Task 12) — and depends only on `./types` from Task 7.
Sector coloring keys off `PersonalFastest`/`OverallFastest` booleans only
(handoff §7 decision 4: the per-segment `Status` codes are unverified and
must never drive the primary color). The full component below was
typechecked against the project's real `tsconfig.app.json` before being
written here (temporarily placed at its real path, `tsc -b --force`, zero
errors — including a deliberately-injected error that was confirmed to
fail the same check before being reverted).

**Files:**
- `frontend/src/live/TimingTower.tsx` (new)

**Interfaces:**
- Produces: `TimingTowerProps { drivers: Record<string, DriverInfo>; timing: Record<string, TimingLine>; selectedDriver: string | null; onSelectDriver: (racingNumber: string) => void }`,
  `TimingTower(props: TimingTowerProps): JSX.Element`.
- Consumes: `DriverInfo`, `TimingLine`, `SectorTime` from `./types` (Task 7).
- Selection is a controlled prop, not local state — `LiveDashboard` (Task 12)
  owns `selectedDriver` because `DriverTelemetryPanel` (Task 11) needs the
  same value. Two components needing one piece of state means it lives in
  their nearest common parent, not in either of them (State Colocation /
  SSOT).

- [ ] **Step 1: Create `TimingTower.tsx`**

  ```typescript
  import type { DriverInfo, SectorTime, TimingLine } from "./types";

  const TYRE_COLORS: Record<string, string> = {
    SOFT: "#da291c",
    MEDIUM: "#ffd12e",
    HARD: "#f0f0f0",
    INTERMEDIATE: "#43b02a",
    WET: "#0067ad",
  };

  function tyreColor(compound: string | null): string {
    if (!compound) return "#666666";
    return TYRE_COLORS[compound.toUpperCase()] ?? "#666666";
  }

  function tyreTextColor(compound: string | null): string {
    const upper = (compound ?? "").toUpperCase();
    return upper === "HARD" || upper === "MEDIUM" ? "#000000" : "#ffffff";
  }

  // Position sorts numerically. Drivers with no position yet (session hasn't
  // gone green, or a non-numeric value) sort after every ranked driver, in
  // stable DriverList order (Line) rather than jumping around randomly frame
  // to frame.
  function comparePosition(
    a: [string, TimingLine],
    b: [string, TimingLine],
    drivers: Record<string, DriverInfo>
  ): number {
    const posA = a[1].position ? parseInt(a[1].position, 10) : null;
    const posB = b[1].position ? parseInt(b[1].position, 10) : null;
    if (posA !== null && !Number.isNaN(posA) && posB !== null && !Number.isNaN(posB)) return posA - posB;
    if (posA !== null && !Number.isNaN(posA)) return -1;
    if (posB !== null && !Number.isNaN(posB)) return 1;
    const lineA = drivers[a[0]]?.line ?? Number.MAX_SAFE_INTEGER;
    const lineB = drivers[b[0]]?.line ?? Number.MAX_SAFE_INTEGER;
    return lineA - lineB;
  }

  // Broadcast convention: purple = overall (session) fastest, green =
  // personal best, plain white = a normal sector time. This keys off the
  // booleans only (handoff §7 decision 4) — the per-segment Status codes are
  // an unverified guess and deliberately not used for the primary coloring.
  function sectorClass(sector: SectorTime | undefined): string {
    if (!sector || sector.Value === undefined) return "bg-white/10 text-mkbhd-gray";
    if (sector.OverallFastest) return "bg-purple-500 text-white";
    if (sector.PersonalFastest) return "bg-emerald-500 text-black";
    return "bg-white/10 text-white";
  }

  export interface TimingTowerProps {
    drivers: Record<string, DriverInfo>;
    timing: Record<string, TimingLine>;
    selectedDriver: string | null;
    onSelectDriver: (racingNumber: string) => void;
  }

  export function TimingTower({ drivers, timing, selectedDriver, onSelectDriver }: TimingTowerProps) {
    const rows = Object.entries(timing).sort((a, b) => comparePosition(a, b, drivers));

    return (
      <div className="mkbhd-card p-0 overflow-hidden bg-white/[0.01]">
        <div className="p-8 border-b border-white/5 bg-mkbhd-red flex justify-between items-center">
          <span className="font-black uppercase italic tracking-tighter text-lg">Running Order</span>
        </div>
        <div className="p-2 max-h-[700px] overflow-y-auto custom-scrollbar">
          {rows.length === 0 && (
            <div className="p-8 text-center text-mkbhd-gray text-xs uppercase tracking-widest">
              Waiting for timing data...
            </div>
          )}
          {rows.map(([racingNumber, line]) => {
            const driver = drivers[racingNumber];
            const isSelected = selectedDriver === racingNumber;
            const teamColour = driver?.team_colour ? `#${driver.team_colour}` : "#444444";
            return (
              <div
                key={racingNumber}
                onClick={() => onSelectDriver(racingNumber)}
                className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-4 ${
                  isSelected ? "bg-mkbhd-red/20 border-l-4 border-mkbhd-red" : "hover:bg-white/[0.03]"
                } ${line.retired ? "opacity-40" : ""}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-xl font-black text-white/20 w-8 text-right">{line.position ?? "-"}</span>
                  <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: teamColour }} />
                  <div className="min-w-0">
                    <div className="font-black uppercase italic leading-none truncate">
                      {driver?.tla ?? driver?.full_name ?? `#${racingNumber}`}
                    </div>
                    <div className="text-[9px] font-bold text-mkbhd-gray uppercase mt-1 tracking-widest flex items-center gap-2">
                      <span>{line.gap_to_leader || "LEADER"}</span>
                      {line.interval && (
                        <span className={line.catching ? "text-emerald-400" : ""}>INT {line.interval}</span>
                      )}
                      {line.in_pit && <span className="text-mkbhd-red">PIT</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`w-8 h-5 rounded flex items-center justify-center text-[9px] font-bold ${sectorClass(
                          line.sectors[i]
                        )}`}
                      >
                        {line.sectors[i]?.Value ?? "-"}
                      </div>
                    ))}
                  </div>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black border border-white/20"
                    style={{ backgroundColor: tyreColor(line.tyre_compound), color: tyreTextColor(line.tyre_compound) }}
                    title={line.tyre_compound ?? "unknown"}
                  >
                    {line.tyre_compound?.[0] ?? "?"}
                  </div>
                  <div className="text-[9px] font-mono text-mkbhd-gray w-12 text-right">
                    L{line.stint_laps ?? 0}/{line.pit_count ?? 0}P
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  ```

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0.

- [ ] **Step 2: Commit**

  ```bash
  cd frontend && git add src/live/TimingTower.tsx
  git commit -m "feat(live): add TimingTower leaderboard component"
  ```

## Task 9: `TrackMap.tsx` — all cars, expand-only bounds

Spec goal: "Track map with every car's live position, color-coded by team."
Handoff §8 Task 9 note, verbatim: "All cars, feed team colors. **Bounds must
be an expand-only ref** — the old `TrackMap` re-normalised min/max every
frame, which makes the map visibly jitter as cars move." The old `TrackMap`
(`App.tsx:127-185`, confirmed via fresh read to have exactly one call site at
`App.tsx:874`, both deleted in Task 12) recomputed `minX/maxX/minY/maxY` from
`useMemo(..., [locations])` every single frame — since the live positions
never stop changing, that dependency never stabilizes, so the normalization
range itself was constantly shifting under the cars. This task's fix is an
expand-only `Bounds` ref: once a bound has seen a wider extent, it only ever
grows, so the coordinate mapping stops moving once the full extent of the
circuit has been seen at least once. A `useRef`, not `useState`, is used for
the bounds themselves, since updating them must never itself cause a
re-render — only new position data should. Team colors come from
`DriverInfo.team_colour`, which is a bare hex string with no leading `#`
(handoff §3.6) — every read of it here prepends `#`. Rendering the actual
circuit outline (e.g. from the existing `frontend/src/circuits/*.json`
GeoJSON used elsewhere in `App.tsx`) is explicitly out of scope: F1's live
timing `Position.z` coordinate system has no verified mapping to those
GeoJSON lon/lat coordinates, and inventing one would be exactly the kind of
unverified placeholder logic this plan avoids. Typechecked the same way as
Task 8 (real path, `tsc -b --force`, zero errors) before being written here.

**Files:**
- `frontend/src/live/TrackMap.tsx` (new)

**Interfaces:**
- Produces: `TrackMapProps { drivers: Record<string, DriverInfo>; positions: Record<string, PositionEntry>; selectedDriver: string | null }`,
  `TrackMap(props: TrackMapProps): JSX.Element`.
- Consumes: `DriverInfo`, `PositionEntry` from `./types` (Task 7).

- [ ] **Step 1: Create `TrackMap.tsx`**

  ```typescript
  import { useMemo, useRef } from "react";
  import { motion } from "framer-motion";
  import type { DriverInfo, PositionEntry } from "./types";

  interface Bounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }

  // Expand-only: once a bound has seen a wider extent, it never shrinks
  // back, even if every car currently on track happens to be clustered
  // tighter this frame (e.g. bunched up behind a Safety Car). The old
  // TrackMap (frontend/src/App.tsx:127, deleted in Task 12) recomputed
  // min/max from only the current frame's points, which rescaled — and
  // therefore visibly jittered — the whole map every time the on-track
  // spread changed. A ref (not state) is deliberate too: updating the
  // bounds must never itself trigger a re-render, only new position data
  // should.
  function expandBounds(prev: Bounds | null, xs: number[], ys: number[]): Bounds {
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (!prev) return { minX, maxX, minY, maxY };
    return {
      minX: Math.min(prev.minX, minX),
      maxX: Math.max(prev.maxX, maxX),
      minY: Math.min(prev.minY, minY),
      maxY: Math.max(prev.maxY, maxY),
    };
  }

  export interface TrackMapProps {
    drivers: Record<string, DriverInfo>;
    positions: Record<string, PositionEntry>;
    selectedDriver: string | null;
  }

  export function TrackMap({ drivers, positions, selectedDriver }: TrackMapProps) {
    const boundsRef = useRef<Bounds | null>(null);

    const points = useMemo(() => {
      const withCoords = Object.entries(positions).filter(
        (entry): entry is [string, PositionEntry & { x: number; y: number }] =>
          typeof entry[1].x === "number" && typeof entry[1].y === "number"
      );
      if (withCoords.length === 0) return [];

      boundsRef.current = expandBounds(
        boundsRef.current,
        withCoords.map(([, p]) => p.x),
        withCoords.map(([, p]) => p.y)
      );
      const bounds = boundsRef.current;
      const rangeX = bounds.maxX - bounds.minX || 1;
      const rangeY = bounds.maxY - bounds.minY || 1;

      return withCoords.map(([racingNumber, p]) => ({
        racingNumber,
        normX: ((p.x - bounds.minX) / rangeX) * 360 + 20,
        normY: ((p.y - bounds.minY) / rangeY) * 360 + 20,
      }));
    }, [positions]);

    return (
      <div className="mkbhd-card relative w-full aspect-square bg-mkbhd-black p-10 overflow-hidden border-white/5">
        <div className="flex items-center gap-3 mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.3em]">Grid Telemetry</h2>
        </div>
        <div className="relative w-full h-full border border-white/5 rounded-[2rem] bg-mkbhd-studio/50 backdrop-blur-sm">
          <svg className="w-full h-full">
            {points.map((p) => {
              const driver = drivers[p.racingNumber];
              const isSelected = selectedDriver === p.racingNumber;
              const colour = driver?.team_colour ? `#${driver.team_colour}` : "#ffffff";
              return (
                <motion.g key={p.racingNumber} animate={{ x: p.normX, y: p.normY }} transition={{ duration: 0.8, ease: "linear" }}>
                  <circle
                    r={isSelected ? 8 : 5}
                    fill={colour}
                    stroke={isSelected ? "#ffffff" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                  {isSelected && (
                    <circle r="16" stroke={colour} strokeWidth="1" fill="transparent" className="animate-ping opacity-40" />
                  )}
                  <text y="-12" textAnchor="middle" className="text-[10px] font-black fill-white/60 pointer-events-none uppercase italic">
                    {driver?.tla ?? p.racingNumber}
                  </text>
                </motion.g>
              );
            })}
          </svg>
        </div>
        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-mkbhd-gray text-xs uppercase tracking-widest">
            No position data yet
          </div>
        )}
      </div>
    );
  }
  ```

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0.

- [ ] **Step 2: Commit**

  ```bash
  cd frontend && git add src/live/TrackMap.tsx
  git commit -m "feat(live): add TrackMap with expand-only bounds and team colors"
  ```

## Task 10: `RaceControlFeed.tsx` — newest-first, flag-colored

Spec goal: "Race control message feed (flags, SC/VSC, investigations)."
Handoff §8 Task 10 note: "Newest-first, flag-colored." The ordering is
already decided on the backend: `LiveSessionState` (Task 3) prepends new
race control messages, and Task 6's integration test asserts exactly this —
a message recorded *later* in the fixture (`"YELLOW FLAG SECTOR 2"`) ends up
at `race_control[0]`, ahead of one recorded earlier
(`"GREEN LIGHT - PIT EXIT OPEN"`) at `race_control[1]`. So this component
renders `messages` in the order it receives them, with no client-side
re-sort — re-deriving an ordering the backend already committed to would be
a second, independent decision with its own chance to disagree. Flag
coloring is necessarily best-effort: `RaceControlMessage.Category` (handoff
§3.6) is coarse, so the color cue comes from matching known phrases in
`Message` text, falling back to a neutral style for anything unrecognised —
same fail-soft-by-default posture as decision 4's sector-segment fallback.
Typechecked the same way as Tasks 8-9 before being written here.

**Files:**
- `frontend/src/live/RaceControlFeed.tsx` (new)

**Interfaces:**
- Produces: `RaceControlFeedProps { messages: RaceControlMessage[] }`,
  `RaceControlFeed(props: RaceControlFeedProps): JSX.Element`.
- Consumes: `RaceControlMessage` from `./types` (Task 7).

- [ ] **Step 1: Create `RaceControlFeed.tsx`**

  ```typescript
  import type { RaceControlMessage } from "./types";

  // Best-effort classification from message text. F1's own Category field
  // (when present) is coarse ("Flag", "Other", ...), so the real color cue
  // comes from matching well-known phrases in Message. Anything
  // unrecognised falls back to a neutral style rather than guessing wrong —
  // same fail-soft-by-default spirit as handoff §7 decision 4.
  function messageStyle(message: string): { bar: string; text: string } {
    const upper = message.toUpperCase();
    if (upper.includes("RED FLAG")) return { bar: "bg-red-600", text: "text-red-400" };
    if (upper.includes("YELLOW FLAG") || upper.includes("DOUBLE YELLOW")) {
      return { bar: "bg-yellow-400", text: "text-yellow-300" };
    }
    if (upper.includes("GREEN")) return { bar: "bg-emerald-500", text: "text-emerald-400" };
    if (upper.includes("SAFETY CAR") || upper.includes("VSC")) return { bar: "bg-orange-500", text: "text-orange-400" };
    if (upper.includes("CHEQUERED")) return { bar: "bg-white", text: "text-white" };
    if (upper.includes("DRS")) return { bar: "bg-sky-500", text: "text-sky-400" };
    if (upper.includes("INVESTIGAT") || upper.includes("PENALTY")) return { bar: "bg-mkbhd-red", text: "text-mkbhd-red" };
    return { bar: "bg-white/20", text: "text-mkbhd-gray" };
  }

  export interface RaceControlFeedProps {
    messages: RaceControlMessage[];
  }

  // messages is already newest-first — LiveSessionState prepends on the
  // backend (backend/livetiming/state.py, Task 3), so this component only
  // renders in the order it's given; re-sorting here would be a second,
  // independent ordering decision the frontend has no business making.
  //
  // The array index is used as the React key. RaceControlMessage (handoff
  // §3.6) carries no verified stable identifier field, so an index key is
  // the honest choice here rather than inventing one; the practical effect
  // is that inserting a new message at the front re-keys every row below
  // it, which is fine for a short list bounded by RACE_CONTROL_MAX (100).
  export function RaceControlFeed({ messages }: RaceControlFeedProps) {
    return (
      <div className="mkbhd-card p-10 flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xs font-black uppercase tracking-[0.3em]">Race Control</h2>
          <div className="text-[10px] font-mono text-mkbhd-gray">{messages.length} MSG</div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 max-h-[500px]">
          {messages.length === 0 && (
            <div className="text-mkbhd-gray text-xs uppercase tracking-widest text-center py-12">No messages yet</div>
          )}
          {messages.map((msg, i) => {
            const text = msg.Message ?? JSON.stringify(msg);
            const style = messageStyle(text);
            return (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${style.bar}`} />
                <div className="min-w-0">
                  {msg.Category && (
                    <div className="text-[9px] font-black text-mkbhd-gray uppercase tracking-widest mb-1">
                      {msg.Category}
                    </div>
                  )}
                  <div className={`text-sm font-bold uppercase italic leading-snug ${style.text}`}>{text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  ```

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0.

- [ ] **Step 2: Commit**

  ```bash
  cd frontend && git add src/live/RaceControlFeed.tsx
  git commit -m "feat(live): add RaceControlFeed with flag-colored messages"
  ```

## Task 11: `DriverTelemetryPanel.tsx` + `CircularGauge.tsx` extraction

Spec goal: "Per-driver live telemetry (speed, throttle, brake, RPM, gear)
for whichever driver is selected, replacing the current single-driver
polling view." Handoff §6.2: `CircularGauge` (`App.tsx:98`, confirmed via
fresh read to have exactly two call sites, both at `App.tsx:864-865`, both
inside the old `LiveDashboard`) is **not exported**, so it must move to
`frontend/src/ui/CircularGauge.tsx` before anything in `src/live/` can use
it — otherwise `App.tsx` importing `LiveDashboard` from `src/live/`, while
`DriverTelemetryPanel` (in `src/live/`) imports `CircularGauge` back out of
`App.tsx`, would be a circular import. `frontend/src/ui/` is new — it holds
presentation primitives with no live-timing awareness, as opposed to
`frontend/src/live/`, which holds this feature's domain components.

One deliberate scope note: the old panel's "Performance Trace" chart
(`App.tsx:876-898`) plotted `liveData.telemetry`, an array the *old* OpenF1
poller built by accumulating samples over time. `LiveSessionState` (Task 3)
does not do this — `telemetry` there is a per-driver snapshot of only the
**latest** `CarData.z` sample, and adding a second, backend-owned history
buffer for this would duplicate state that already has one owner (SSOT).
So the trace here is reconstructed as small, local, ephemeral UI state: a
capped ring buffer of the last `SPEED_TRACE_LENGTH` samples for whichever
driver is currently selected, reset on every driver switch. This is
UI-presentation history, not a second copy of domain state, so it doesn't
conflict with decision 3 (raw topics are the backend SSOT). `drs` exists on
`TelemetryChannels` but is intentionally not rendered — its raw code was
never decoded into a meaningful on/off signal anywhere in this feature (see
handoff §3.6), and inventing one now would be an unverified guess. Both
files below were typechecked together against the real `tsconfig.app.json`
(same process as Tasks 8-10) before being written here.

**Files:**
- `frontend/src/ui/CircularGauge.tsx` (new — extracted from `App.tsx:98-125`)
- `frontend/src/live/DriverTelemetryPanel.tsx` (new)

**Interfaces:**
- Produces: `CircularGaugeProps { value: number; max: number; label: string; color: string; unit: string }`,
  `CircularGauge(props: CircularGaugeProps): JSX.Element` (`ui/CircularGauge.tsx`);
  `DriverTelemetryPanelProps { drivers: Record<string, DriverInfo>; telemetry: Record<string, TelemetryChannels>; selectedDriver: string | null }`,
  `DriverTelemetryPanel(props: DriverTelemetryPanelProps): JSX.Element`.
- Consumes: `DriverInfo`, `TelemetryChannels` from `./types` (Task 7);
  `CircularGauge` from `../ui/CircularGauge.tsx`.

- [ ] **Step 1: Create `frontend/src/ui/CircularGauge.tsx`**

  ```typescript
  import { motion } from "framer-motion";

  export interface CircularGaugeProps {
    value: number;
    max: number;
    label: string;
    color: string;
    unit: string;
  }

  // Extracted verbatim (logic and markup unchanged) from the old
  // frontend/src/App.tsx line 98. It has to live outside App.tsx: App.tsx
  // imports LiveDashboard (frontend/src/live/LiveDashboard.tsx), and
  // DriverTelemetryPanel — used by LiveDashboard — needs this gauge, so
  // leaving the definition in App.tsx would create an import cycle. See
  // docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
  // §6.2.
  export function CircularGauge({ value, max, label, color, unit }: CircularGaugeProps) {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="flex flex-col items-center justify-center p-10 mkbhd-card bg-white/[0.01]">
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle cx="80" cy="80" r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="transparent" />
            <motion.circle
              cx="80"
              cy="80"
              r={radius}
              stroke={color}
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.8, ease: "circOut" }}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute text-center">
            <div className="text-4xl font-black italic">{value}</div>
            <div className="text-[10px] font-bold text-mkbhd-gray uppercase tracking-widest">{unit}</div>
          </div>
        </div>
        <div className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-mkbhd-gray">{label}</div>
      </div>
    );
  }
  ```

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0. (`App.tsx` still has its own inline
  `CircularGauge` at this point — that's harmless duplication until Task 12
  deletes it and switches the old `LiveDashboard`'s two call sites over,
  since nothing yet imports from `ui/CircularGauge.tsx`.)

- [ ] **Step 2: Create `frontend/src/live/DriverTelemetryPanel.tsx`**

  ```typescript
  import { useEffect, useState } from "react";
  import { Activity } from "lucide-react";
  import { AreaChart, Area, YAxis, ResponsiveContainer } from "recharts";
  import type { DriverInfo, TelemetryChannels } from "./types";
  import { CircularGauge } from "../ui/CircularGauge";

  const SPEED_TRACE_LENGTH = 50;

  export interface DriverTelemetryPanelProps {
    drivers: Record<string, DriverInfo>;
    telemetry: Record<string, TelemetryChannels>;
    selectedDriver: string | null;
  }

  // The backend's telemetry projection (LiveSessionState) is a per-driver
  // snapshot of only the latest CarData.z sample — it does not keep history
  // (a backend-owned time series would be a second SSOT for the same data,
  // which is out of scope). The short speed trace below is therefore
  // deliberately local, ephemeral UI state, not derived from any backend
  // history: it appends the latest sample each time telemetry changes and
  // resets whenever the selected driver changes, capped at
  // SPEED_TRACE_LENGTH samples. `drs` exists on TelemetryChannels but isn't
  // rendered here — its raw code isn't decoded into an on/off signal
  // anywhere in this feature (see handoff §3.6), so displaying it would
  // mean inventing an interpretation this plan never verified.
  export function DriverTelemetryPanel({ drivers, telemetry, selectedDriver }: DriverTelemetryPanelProps) {
    const [speedTrace, setSpeedTrace] = useState<{ speed: number }[]>([]);

    const channels = selectedDriver ? telemetry[selectedDriver] : undefined;
    const driver = selectedDriver ? drivers[selectedDriver] : undefined;
    const speed = channels?.speed ?? 0;
    const rpm = channels?.rpm ?? 0;
    const gear = channels?.gear ?? 0;
    const throttle = channels?.throttle ?? 0;
    const brake = channels?.brake ?? 0;

    useEffect(() => {
      setSpeedTrace([]);
    }, [selectedDriver]);

    useEffect(() => {
      if (!channels) return;
      setSpeedTrace((prev) => [...prev.slice(-(SPEED_TRACE_LENGTH - 1)), { speed: channels.speed ?? 0 }]);
    }, [channels]);

    if (!selectedDriver) {
      return (
        <div className="mkbhd-card p-16 flex flex-col items-center justify-center gap-4 text-center min-h-[300px] bg-white/[0.01]">
          <Activity size={32} className="text-mkbhd-gray" />
          <div className="text-mkbhd-gray text-xs uppercase tracking-widest">
            Select a driver from Running Order to view telemetry
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-10">
        <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.3em]">
          Tracking: <span className="text-white italic">{driver?.tla ?? `#${selectedDriver}`}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <CircularGauge value={speed} max={360} label="Velocity" color="#ffffff" unit="KM/H" />
          <CircularGauge value={rpm} max={12000} label="Engine State" color="#cc0000" unit="RPM" />
          <div className="mkbhd-card p-10 flex flex-col justify-center items-center bg-mkbhd-red/5">
            <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.4em] mb-6 flex items-center gap-2">
              <Activity size={14} className="text-mkbhd-red" /> Active Ratio
            </div>
            <div className="text-[10rem] font-black italic text-white leading-none">{gear}</div>
            <div className="text-xs font-black uppercase text-mkbhd-red tracking-widest mt-4 italic">GEAR_LOCKED</div>
          </div>
        </div>

        <div className="mkbhd-card p-10 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3">
              <Activity size={16} className="text-mkbhd-red" /> Performance Trace
            </h2>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedTrace}>
                <defs>
                  <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#cc0000" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#cc0000" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="speed" stroke="#cc0000" fill="url(#telemetryGrad)" strokeWidth={4} isAnimationActive={false} />
                <YAxis domain={["auto", "auto"]} hide />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mkbhd-card p-12 h-48 bg-white/[0.01] flex items-center justify-around gap-12">
          <div className="flex-1">
            <div className="text-[10px] font-black text-mkbhd-gray uppercase mb-4 flex justify-between tracking-widest">
              <span>THROTTLE</span>
              <span className="text-white italic">{throttle}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
              <div style={{ width: `${throttle}%` }} className="h-full bg-white rounded-full transition-all duration-300" />
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-black text-mkbhd-gray uppercase mb-4 flex justify-between tracking-widest">
              <span>BRAKE_SYSTEM</span>
              <span className="text-mkbhd-red italic">{brake}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
              <div style={{ width: `${brake}%` }} className="h-full bg-mkbhd-red rounded-full transition-all duration-300" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  ```

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

  ```bash
  cd frontend && git add src/ui/CircularGauge.tsx src/live/DriverTelemetryPanel.tsx
  git commit -m "feat(live): extract CircularGauge to src/ui, add DriverTelemetryPanel"
  ```

## Task 12: `LiveDashboard.tsx` + `App.tsx` integration + docs

This is the integration task: no new domain logic, only composing Tasks
7-11's pieces into one component, wiring it into `App.tsx` in place of the
old OpenF1-polling dashboard, and bringing the docs current. All four of
the spec's UI goals (timing tower, track map, race control feed,
per-driver telemetry) are satisfied end to end once this lands.

**`LiveDashboard` takes no props.** The old `frontend/src/App.tsx:756`
`LiveDashboard` took a `status` prop and used `status.session_key` /
`status.no_api_access` to drive its own OpenF1 polling (`App.tsx:761-776`)
and to render a "Live Data Restricted" screen when OpenF1's sponsor auth
was locked out (`App.tsx:780-801`). None of that applies here: the SignalR
feed needs no credentials to lock out, and the connection is push-based,
not polled. The new `LiveDashboard` owns its data source directly via
`useLiveTimingSocket()` (Task 7) and needs nothing from its caller —
`App.tsx` renders `<LiveDashboard />` with zero props, still gated by the
existing `status?.is_live` check (`/api/status`, Task 6, now `{"is_live":
bool}` only — see the README edit in Step 4 below).

**`selectedDriver` is colocated in `LiveDashboard`, not lifted further.**
`TimingTower` (Task 8) and `DriverTelemetryPanel` (Task 11) both need it —
one to render the selection, one to filter telemetry — and `TrackMap`
(Task 9) needs it to highlight the selected dot. `LiveDashboard` is their
closest common parent and nothing above it needs the value, so per the
frontend "state colocation" principle it stops there instead of climbing
into `App`.

**Connection status gets a banner, not a blocking screen.** The old
restricted-access screen (`App.tsx:780-801`) replaced the whole dashboard
when OpenF1 locked out. `connection_status` (Task 7's `LiveSnapshot`)
cycles through `"connecting" / "connected" / "reconnecting" /
"disconnected"` while the backend's reconnect loop (Task 5's `client.py`)
keeps retrying in the background, so `LiveDashboard` always renders its
layout and overlays a small pill ("Connecting to live feed..." /
"Reconnecting to live feed...") whenever `connection_status !==
"connected"`. This is the frontend half of the spec's "distinguish no
session live right now from our connection to F1 is down" requirement —
the backend already carries that distinction (`is_live` gates whether
`LiveDashboard` mounts at all; `connection_status` gates the banner once
it has).

**Two decorative elements from the old dashboard are dropped, not
replaced.** The "System Grid" button (`App.tsx:818-820`, a `StudioButton`
with a `Monitor` icon and no `onClick`) never did anything in the old code
— there's no behavior to port. The "Tracking Driver: <name>" pill
(`App.tsx:813-817`) duplicated what `DriverTelemetryPanel` (Task 11)
already shows once a driver is selected, so it isn't recreated either.

**`track_status` and `weather` stay server-side with no UI consumer.** The
spec's Goals list exactly four UI capabilities, and neither appears among
them. `LiveSessionState` (Task 3) still decodes and stores both — they're
real subscribed topics (handoff §3.4) and removing them from the backend
would contradict Task 3 — but no component built in this plan reads
`snapshot.track_status` or `snapshot.weather`. Adding that UI would be new
scope beyond what this plan was approved to cover.

**Files:**
- `frontend/src/live/LiveDashboard.tsx` (new)
- `frontend/src/App.tsx` (edited — imports, two deletions, one render swap)
- `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md` (edited — corrects "Connection lifecycle")
- `README.md` (edited — Live Session bullets + API Endpoints table)
- `MEMORY.md` (edited — Component Index table + one Architecture line)

**Interfaces:**
- Produces: `LiveDashboard(): JSX.Element` — no props; owns its connection
  via `useLiveTimingSocket` (Task 7).
- Consumes: `useLiveTimingSocket` (Task 7); `TimingTower` (Task 8);
  `TrackMap` (Task 9); `RaceControlFeed` (Task 10); `DriverTelemetryPanel`
  (Task 11).

- [ ] **Step 1: Create `frontend/src/live/LiveDashboard.tsx`**

  ```typescript
  import { useState } from "react";
  import { motion } from "framer-motion";
  import { useLiveTimingSocket } from "./useLiveTimingSocket";
  import { TimingTower } from "./TimingTower";
  import { TrackMap } from "./TrackMap";
  import { RaceControlFeed } from "./RaceControlFeed";
  import { DriverTelemetryPanel } from "./DriverTelemetryPanel";

  export function LiveDashboard() {
    const snapshot = useLiveTimingSocket();
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

    const sessionName = snapshot.session_info.Meeting?.Name ?? "ON AIR";
    const isReconnecting = snapshot.connection_status === "reconnecting";
    const showFeedNotice = snapshot.connection_status !== "connected";

    return (
      <div className="space-y-12" id="live-dashboard">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-12 pb-12 border-b border-white/5">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ opacity: 1, x: 0 }}>
            <div className="text-mkbhd-red font-black uppercase tracking-[0.5em] mb-4 text-xs flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-mkbhd-red animate-pulse" /> Live Satellite Feed
            </div>
            <h1 className="text-7xl md:text-[10rem] tracking-tight leading-none">{sessionName}</h1>
          </motion.div>
          {showFeedNotice && (
            <div className="px-6 py-3 bg-mkbhd-red/10 border border-mkbhd-red/40 rounded-full text-[10px] font-black uppercase tracking-widest text-mkbhd-red">
              {isReconnecting ? "Reconnecting to live feed..." : "Connecting to live feed..."}
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-3">
            <TimingTower
              drivers={snapshot.drivers}
              timing={snapshot.timing}
              selectedDriver={selectedDriver}
              onSelectDriver={setSelectedDriver}
            />
          </div>

          <div className="lg:col-span-9 space-y-10" id="telemetry">
            <DriverTelemetryPanel drivers={snapshot.drivers} telemetry={snapshot.telemetry} selectedDriver={selectedDriver} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
              <TrackMap drivers={snapshot.drivers} positions={snapshot.positions} selectedDriver={selectedDriver} />
              <RaceControlFeed messages={snapshot.race_control} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  ```

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0 — Tasks 7-11 already committed
  `useLiveTimingSocket`, `TimingTower`, `TrackMap`, `RaceControlFeed`, and
  `DriverTelemetryPanel`, so this file type-checks against the real
  project immediately. Directly confirmed while writing this plan: this
  exact file plus Tasks 7-11's files pass `tsc -b --force` with zero
  errors, and a deliberate typo (`snapshot.drivers` → `snapshot.driverz`)
  correctly produces `TS2551: Property 'driverz' does not exist on type
  'LiveSnapshot'. Did you mean 'drivers'?`, proving the check has teeth.

- [ ] **Step 2: Edit `frontend/src/App.tsx`**

  Four changes, all confirmed together against the real file (current
  baseline: 1426 lines) with one `tsc -b tsconfig.app.json --force` pass.

  **(a) Imports.** Replace the `lucide-react` and `recharts` import blocks
  and add the new `LiveDashboard` import after the `CIRCUIT_GEOJSON`
  import.

  Replace:
  ```typescript
  import {
    Trophy, Newspaper, Zap, MapPin, List, X,
    TrendingUp, Activity, Flag,
    User, Menu, ChevronRight, Monitor, Play, Eye, Users
  } from 'lucide-react';
  import {
    AreaChart, Area, YAxis, Tooltip, ResponsiveContainer
  } from 'recharts';
  import { motion, AnimatePresence } from 'framer-motion';
  import "@fontsource/inter/400.css";
  import "@fontsource/inter/700.css";
  import "@fontsource/inter/900.css";
  import { CIRCUIT_GEOJSON } from './circuits/index';
  ```
  with:
  ```typescript
  import {
    Trophy, Newspaper, Zap, MapPin, X,
    Activity, Flag,
    User, Menu, ChevronRight, Play, Eye, Users
  } from 'lucide-react';
  import {
    AreaChart, Area, YAxis, ResponsiveContainer
  } from 'recharts';
  import { motion, AnimatePresence } from 'framer-motion';
  import "@fontsource/inter/400.css";
  import "@fontsource/inter/700.css";
  import "@fontsource/inter/900.css";
  import { CIRCUIT_GEOJSON } from './circuits/index';
  import { LiveDashboard } from './live/LiveDashboard';
  ```
  `List`, `TrendingUp`, `Monitor`, and `Tooltip` are dropped because their
  only call sites are inside the old `LiveDashboard` deleted in (c) below
  — confirmed with `grep -n` against the real file that every other
  occurrence of each name is the import line itself, so leaving them would
  fail the build (`noUnusedLocals` in `tsconfig.app.json`). `AreaChart`,
  `Area`, `YAxis`, and `ResponsiveContainer` stay — `CircuitElevation`
  (`App.tsx:~305`) uses them too (confirmed the same way: each still has a
  usage outside the deleted ranges).

  **(b) Old `CircularGauge` + old `TrackMap`.** Delete both components
  entirely — `const CircularGauge = ({ value, max, label, color, unit }: {
  ... }) => { ... }` and `const TrackMap = ({ locations, selectedDriver }:
  any) => { ... }`, together spanning from the `const CircularGauge = ...`
  line through `TrackMap`'s closing `};` (original lines 98-185) —
  immediately followed by the pre-existing `// --- Real circuit geometry
  from GeoJSON ---` comment, which stays untouched. Superseded by Task
  11's `ui/CircularGauge.tsx` and Task 9's `live/TrackMap.tsx`.

  **(c) Mock data + old `LiveDashboard`.** Delete, as one contiguous
  block (original lines 699-927): the `// --- Mock data for LiveDashboard
  simulation (disconnected, keep for testing) ---` comment, `MOCK_DRIVERS`,
  `_buildMockLiveData`, `_buildMockLocations`, `__mockHelpers`, the `// ---
  View Components ---` comment, and the old `const LiveDashboard = ({
  status }: any) => { ... }` — everything from the mock-data comment
  through the blank line that precedes the `// Official F1 wordmark SVG`
  comment above `F1Logo`, which stays untouched. None of this mock data or
  polling logic is referenced anywhere else in the file (confirmed with
  `grep -n` — every `MOCK_DRIVERS` / `_buildMockLiveData` /
  `_buildMockLocations` / `__mockHelpers` occurrence is inside this
  block). Superseded by Tasks 7-11's socket-backed components, composed in
  Step 1's `LiveDashboard.tsx`.

  **(d) Render call site.** Replace:
  ```typescript
               <LiveDashboard status={status} />
  ```
  with:
  ```typescript
               <LiveDashboard />
  ```
  This is the sole call site (inside the `AnimatePresence` branch keyed on
  `status?.is_live`, `App.tsx:~1090`). `status` keeps gating whether the
  branch renders at all (`/api/status`'s `is_live`, Task 6) — only the
  prop passed to the component itself is removed, since the new
  `LiveDashboard` fetches nothing from its parent.

  Verify:
  ```bash
  cd frontend && npx tsc -b tsconfig.app.json --force
  ```
  Expected: no output, exit code 0. Directly confirmed while writing this
  plan: applying all four changes above to the real `App.tsx`, alongside
  Tasks 7-11's already-committed files, typechecks clean. Net effect:
  `frontend/src/App.tsx` goes from 1426 to 1109 lines.

- [ ] **Step 3: Correct the spec's "Connection lifecycle" section**

  `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md`'s
  "Connection lifecycle" section (currently lines 55-74) describes legacy
  SignalR 1.x/ASP.NET — wrong for this feed, as
  `docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md`
  §3 established (direct observation, corroborated by FastF1's client
  targeting the same path). This step is the written correction the
  handoff calls for. Steps 4-5 of the original section were already
  correct (background task from the lifespan handler; backoff schedule
  `1s → 2s → 5s → 10s`, matching Task 5's actual `BACKOFF_SCHEDULE = (1, 2,
  5, 10)`) and are kept; only steps 1-3 are replaced.

  Replace:
  ```markdown
  ### Connection lifecycle (`client.py`)

  1. **Negotiate**: `GET https://livetiming.formula1.com/signalr/negotiate` (SignalR
     1.x/ASP.NET protocol, not SignalR Core) with the required query params
     (`clientProtocol`, `connectionData=[{"name":"Streaming"}]`) to obtain a
     `ConnectionToken`.
  2. **Connect**: open a WebSocket to the `/signalr/connect` URL with that token.
  3. **Subscribe**: send
     `{"H": "Streaming", "M": "Subscribe", "A": [[<topics>]], "I": 0}` for:
     `Heartbeat, SessionInfo, DriverList, TimingData, TimingAppData, TimingStats,
     TrackStatus, RaceControlMessages, WeatherData, CarData.z, Position.z`.
  4. Runs as an asyncio background task started from the FastAPI lifespan handler
     (not per-request). Stays connected continuously — outside a session the feed
     just idles on `Heartbeat`, which is cheap.
  5. **Reconnect**: on any disconnect/error, retry with exponential backoff
     (e.g. 1s → 2s → 5s → 10s cap). Every state transition (`connecting`,
     `connected`, `disconnected`, `reconnecting`) is logged and also stored on
     `LiveSessionState` so the frontend can distinguish "no session live right
     now" from "our connection to F1 is down."
  ```
  with:
  ```markdown
  ### Connection lifecycle (`client.py`)

  > **Correction (2026-08-17):** steps 1-3 below originally described
  > legacy SignalR 1.x (ASP.NET SignalR, the `/signalr/` path family). The
  > real feed at `livetiming.formula1.com` speaks **ASP.NET Core SignalR**
  > ("SignalR Core") over `/signalrcore/` instead — a different negotiate
  > response, WebSocket URL, and message envelope. Confirmed by direct
  > observation and corroborated by FastF1's own client, which targets the
  > same `signalrcore` path. See
  > `docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md`
  > §3 for the full comparison. Steps 4-5 were already correct and are
  > unchanged.

  1. **Negotiate**: two HTTP calls, in order. First `OPTIONS
     https://livetiming.formula1.com/signalrcore/negotiate`, purely to
     collect the `Set-Cookie` values the server issues. Then `POST
     https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1`,
     carrying those cookies forward, with header `User-Agent: BestHTTP`
     (what the official F1 app sends). Response is HTTP 200 with a JSON
     body containing `connectionToken` — there is no `clientProtocol` /
     `connectionData` query-string handshake; that's the SignalR 1.x shape,
     and this endpoint returns 401 for it.
  2. **Connect**: open a WebSocket to
     `wss://livetiming.formula1.com/signalrcore?id=<connectionToken>`, with
     the same `User-Agent: BestHTTP` header plus `Accept-Encoding:
     gzip,identity`, and no read-side message-size cap (`max_size=None` in
     `websockets` — `CarData.z` frames exceed the library's 1 MiB
     default). There is no separate `/signalr/connect` URL.
  3. **Handshake, then subscribe**: once the socket is open, send
     `{"protocol":"json","version":1}\x1e` and wait for the handshake ack,
     then send
     `{"type":1,"invocationId":"0","target":"Subscribe","arguments":[[<topics>]]}\x1e`
     for the same topic list as before: `Heartbeat, SessionInfo,
     DriverList, TimingData, TimingAppData, TimingStats, TrackStatus,
     RaceControlMessages, WeatherData, CarData.z, Position.z`. The server
     replies with one `type:3` completion record whose `result` is the
     full initial snapshot keyed by topic; every record after that is a
     `type:1` invocation carrying one `[topic, payload, timestamp]` delta.
     `\x1e` (ASCII 30) is the record separator for every frame in both
     directions. The client must also send an app-level `{"type":6}\x1e`
     ping periodically, independent of the WebSocket protocol's own
     ping/pong.
  4. Runs as an asyncio background task started from the FastAPI lifespan handler
     (not per-request). Stays connected continuously — outside a session the feed
     just idles on `Heartbeat`, which is cheap.
  5. **Reconnect**: on any disconnect/error, retry with exponential backoff
     (1s → 2s → 5s → 10s cap). Every state transition (`connecting`,
     `connected`, `disconnected`, `reconnecting`) is logged and also stored on
     `LiveSessionState` so the frontend can distinguish "no session live right
     now" from "our connection to F1 is down."
  ```

- [ ] **Step 4: Update `README.md`**

  Two edits. First, the "Live Session" feature bullets (currently lines
  11-16) still describe the OpenF1-polling dashboard and a mock-mode
  toggle that isn't actually wired to any UI control in the current
  `App.tsx` (confirmed with `grep -n -i "mock"` against the real file —
  every hit is inside the dead code deleted in Step 2c, never a rendered
  toggle).

  Replace:
  ```markdown
  ### Live Session
  - Real-time leaderboard pulled from OpenF1
  - Telemetry gauges — speed, RPM, gear
  - Throttle / brake bar traces
  - Driver position dot map on SVG grid
  - Mock simulation mode (⚡ toggle in navbar) — 20-driver fixture with cycling telemetry, no backend required
  ```
  with:
  ```markdown
  ### Live Session
  - Live timing tower — position, gap/interval, sector times with personal/session-best coloring, tyre compound + stint, pit stop count
  - Live track map — every car's position, color-coded, highlights the selected driver
  - Race control message feed — flags, safety car/VSC, investigations
  - Per-driver telemetry gauges — speed, RPM, gear, throttle/brake for whichever driver is selected
  - Own direct client for F1's live timing feed (`livetiming.formula1.com`, SignalR) — no credentials, no third-party API
  ```

  Second, the API Endpoints table (currently lines 105-116): the
  `/api/status` row still mentions the removed `?mock=true` param, and
  `/api/live-data` / `/api/location` no longer exist (Task 6 deleted both
  in favor of `/ws/live`).

  Replace:
  ```markdown
  | GET | `/api/status` | Live session check. `?mock=true` for simulation |
  | GET | `/api/idle-data` | Standings, schedule, next race, news |
  | GET | `/api/circuit/{id}` | Circuit info + historical results. `?season=N` |
  | GET | `/api/race-weekend/{id}` | Session results. `?year=N&session=race\|quali\|sprint\|fp1\|fp2\|fp3` |
  | GET | `/api/driver/{id}/stats` | Driver career stats |
  | GET | `/api/constructor/{id}/stats` | Constructor career stats |
  | GET | `/api/live-data` | Live telemetry + intervals. `?session_key=N` |
  | GET | `/api/location` | Latest driver positions. `?session_key=N` |
  ```
  with:
  ```markdown
  | GET | `/api/status` | Live session check |
  | GET | `/api/idle-data` | Standings, schedule, next race, news |
  | GET | `/api/circuit/{id}` | Circuit info + historical results. `?season=N` |
  | GET | `/api/race-weekend/{id}` | Session results. `?year=N&session=race\|quali\|sprint\|fp1\|fp2\|fp3` |
  | GET | `/api/driver/{id}/stats` | Driver career stats |
  | GET | `/api/constructor/{id}/stats` | Constructor career stats |
  | WS | `/ws/live` | Live timing feed — full snapshot on connect, then incremental patches (see the live-timing spec under `docs/superpowers/specs/`) |
  ```

  The Stack table (`README.md` line ~41, listing OpenF1/Jolpica/ESPN under
  "Data") is out of scope for this edit — it stays accurate for
  FP1-3/schedule/results, which are unaffected by this plan.

- [ ] **Step 5: Update `MEMORY.md`**

  Three edits, all limited to content this plan makes false or
  incomplete; `MEMORY.md`'s Data Sources table and its unrelated
  Remaining Tasks entries are untouched.

  **(a) Architecture section, line 5.** Replace:
  ```markdown
  **Single-file frontend:** `frontend/src/App.tsx` (~1200 lines) — all components, modals, state.  
  ```
  with:
  ```markdown
  **Frontend:** `frontend/src/App.tsx` (1109 lines) — idle-dashboard components, modals, state. Live session lives in `frontend/src/live/` (domain components + `useLiveTimingSocket`/`liveState`/`types`) and `frontend/src/ui/` (shared presentation primitives).  
  ```

  **(b) Component Index — full table replace**, since `CircularGauge`,
  `TrackMap`, and `LiveDashboard` moved out of `App.tsx` and every other
  line number shifted. Replace the entire existing "Component Index
  (App.tsx)" table with (ordered by actual line number, confirmed with
  `grep -n` against the post-Task-12 file):

  ```markdown
  ## Component Index (App.tsx)

  | Component | ~Line | Purpose |
  |---|---|---|
  | `StudioButton` | 22 | Primary/secondary button |
  | `TEAM_COLORS` | 31 | CSS color badge map for all 10 teams |
  | `TeamLogo` | 45 | Renders colored badge with short team code |
  | `StudioModal` | 62 | Full-screen modal — Escape key + backdrop click closes |
  | `CIRCUIT_ID_MAP` | 101 | Jolpica circuitId → bacinger GeoJSON key (24 circuits) |
  | `geoJsonToSvgPath` | 113 | LineString GeoJSON → normalized SVG path 440×310 |
  | `fallbackTrackPath` | 155 | Procedural fallback when circuit not in map |
  | `CircuitTrack3D` | 169 | Real-geometry 3D track + SMIL car animation |
  | `CircuitElevation` | 217 | Recharts area chart — `h-28` fixed height |
  | `CircuitDetailsModal` | 254 | Circuit analysis: stats, elevation, year picker, results |
  | `SectionHeader` | 518 | Section divider with icon + title |
  | `CareerModal` | 532 | Driver/constructor profile modal |
  | Main `App()` | 632 | State, data fetching, layout, all modals; renders `<LiveDashboard />` when `status.is_live` |

  ## Live Session Components (own SignalR feed, not App.tsx)

  Backend connects directly to F1's live timing feed and pushes decoded
  state over `/ws/live` — see
  `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md` and
  `docs/superpowers/plans/2026-08-17-live-timing-signalr.md`.

  | Component / module | File | Purpose |
  |---|---|---|
  | `LiveDashboard` | `frontend/src/live/LiveDashboard.tsx` | Top-level live view — composes everything below, owns `selectedDriver` |
  | `useLiveTimingSocket` | `frontend/src/live/useLiveTimingSocket.ts` | WebSocket hook — connects to `/ws/live`, reconnects with backoff, exposes a `LiveSnapshot` |
  | `liveState` | `frontend/src/live/liveState.ts` | Reducer applying `{key: value}` patches over the snapshot; `deriveWsUrl` |
  | `types` | `frontend/src/live/types.ts` | `LiveSnapshot` and every payload shape, mirroring the backend's derived projections |
  | `TimingTower` | `frontend/src/live/TimingTower.tsx` | Leaderboard — position, gap/interval, sectors, tyres, pit stops |
  | `TrackMap` | `frontend/src/live/TrackMap.tsx` | Live car positions, expand-only bounds |
  | `RaceControlFeed` | `frontend/src/live/RaceControlFeed.tsx` | Flags / SC / VSC / investigation messages, newest first |
  | `DriverTelemetryPanel` | `frontend/src/live/DriverTelemetryPanel.tsx` | Selected driver's gauges + local speed-trace ring buffer |
  | `CircularGauge` | `frontend/src/ui/CircularGauge.tsx` | Shared SVG gauge primitive (extracted from the old `App.tsx`) |
  ```

  **(c) Backend Conventions + Remaining Tasks.** The `/api/status`
  mock-mode bullet and the "useMock dummy data" remaining-task item are
  both about code this task deletes outright (Step 2c) — one describes a
  query param Task 6 already removed, the other describes exactly the
  dead code just deleted, so it's done (by deletion) rather than pending.

  Replace:
  ```markdown
  - `/api/status?mock=true` → mock live session (session_key 9500)

  ## Remaining Tasks

  1. **F1 official logo** — replace "F1D" text in navbar with official F1 SVG marque
  2. **useMock dummy data** — 20 drivers, cycling telemetry, location data
  3. **Race results modal** — FP/Quali/Race/Sprint tabs for completed rounds; needs `GET /api/race-results/{season}/{round}`
  ```
  with:
  ```markdown
  - `/api/status` → `{"is_live": bool}` from `LiveSessionState.is_live()` (own SignalR feed, not OpenF1 — see Live Session Components above)

  ## Remaining Tasks

  1. **F1 official logo** — replace "F1D" text in navbar with official F1 SVG marque
  2. **Race results modal** — FP/Quali/Race/Sprint tabs for completed rounds; needs `GET /api/race-results/{season}/{round}`
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/live/LiveDashboard.tsx frontend/src/App.tsx \
          docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md \
          README.md MEMORY.md
  git commit -m "feat(live): compose LiveDashboard, wire into App.tsx, update docs"
  ```

