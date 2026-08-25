# Context Transfer — Own F1 SignalR Live Timing Feed

**Date:** 2026-08-17
**Purpose:** Carry the full working context of the live-timing design/planning session across a
context boundary, so a session with zero prior context can resume without re-doing discovery.
**Spec:** `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md` (Status: Approved)
**Plan:** `docs/superpowers/plans/2026-08-17-live-timing-signalr.md` — **NOT YET WRITTEN.** Writing
it is the next action. Everything needed to write it is in this document.

---

## 1. Where things stand

| Item | State |
|---|---|
| Spec | Written, Approved, committed (`45bf9a9`) |
| Protocol verification | **Done** — live probe run 2026-08-17, results in §3 |
| Fixture source | **Solved** — static archive, see §5 |
| Codebase survey | **Done** — exact line numbers in §6 |
| Design decisions | **Locked** — see §7 |
| Task decomposition | **Locked** — 12 tasks, see §8 |
| Plan document | **Not written** |
| Any production code | **Not written.** Zero files created or modified. Working tree is clean apart from pre-existing untracked `.serena/`, `frontend/.gitignore`, `frontend/README.md` |

Branch is `main` (personal repo — the Glance `master`/`gitjoin` conventions do **not** apply here).

### The one thing to read first

**The spec's "Connection lifecycle" section is factually wrong and must be treated as superseded
by §3 of this document.** The spec says the feed uses legacy SignalR 1.x (`/signalr/negotiate`,
`{"H":"Streaming","M":"Subscribe",...}`). It does not — that endpoint returns HTTP 401. The feed is
**ASP.NET Core SignalR**. Building to the spec as written produces a client that cannot connect.
A spec addendum recording this correction is folded into Task 12.

---

## 2. What is being built (one paragraph)

Replace the OpenF1-backed live-session path with the project's own client for F1's internal live
timing feed at `livetiming.formula1.com`. A FastAPI-lifespan background asyncio task holds one
SignalR Core WebSocket to F1, decodes topics, merges them into a single in-process
`LiveSessionState`, and fans the result out to browsers over the project's own `GET /ws/live`
WebSocket. This removes the sponsor-auth / HTTP 402-during-live limitation entirely, because this
feed needs no credentials. Historical/schedule data (results, standings, circuits, upcoming races)
stays on Jolpica/OpenF1, untouched.

---

## 3. Verified protocol facts

Empirically verified on **2026-08-17** by running the probe in §4.1 against the live endpoint.
Anything marked *(assumed)* was not directly observed and should be re-checked during
implementation.

### 3.1 The correction

| | Spec claimed | Actually observed |
|---|---|---|
| Protocol | SignalR 1.x / ASP.NET | **ASP.NET Core SignalR** |
| Negotiate | `GET /signalr/negotiate?clientProtocol=1.5&connectionData=[{"name":"Streaming"}]` | **HTTP 401** |
| Negotiate | — | `POST /signalrcore/negotiate?negotiateVersion=1` → **HTTP 200**, JSON with `connectionToken` |
| Subscribe | `{"H":"Streaming","M":"Subscribe","A":[[topics]],"I":0}` | `{"type":1,"invocationId":"0","target":"Subscribe","arguments":[[topics]]}` |

Corroboration: FastF1 master also targets `signalrcore`, not `signalr`. This is a real upstream
migration, not a probe artifact.

### 3.2 The handshake sequence that works

```
1. OPTIONS https://livetiming.formula1.com/signalrcore/negotiate
   → collect Set-Cookie values (the CDN/WAF in front of the feed sets them)

2. POST https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1
   headers: User-Agent: BestHTTP, Cookie: <from step 1>
   → 200, body contains "connectionToken"

3. WS  wss://livetiming.formula1.com/signalrcore?id=<connectionToken>
   headers: User-Agent: BestHTTP, Accept-Encoding: gzip,identity, Cookie: <carried forward>
   (max_size=None — CarData.z frames exceed the websockets default 1 MiB cap)

4. send: {"protocol":"json","version":1}\x1e
   → server replies with a handshake ack record

5. send: {"type":1,"invocationId":"0","target":"Subscribe","arguments":[[<topics>]]}\x1e
   → server replies type:3 (completion) whose "result" is the full initial snapshot,
     keyed by topic name
   → thereafter type:1 (invocation) records stream deltas
```

`User-Agent: BestHTTP` is what the official F1 app sends; it is the User-Agent the feed expects.
Not sending it was not tested as a failure mode *(assumed to matter — keep it)*.

### 3.3 Framing and record types

- **Record separator is `\x1e` (ASCII 30).** One WebSocket text frame may contain several records,
  so always split on `\x1e` and discard empty fragments. A single record never spans two frames
  *(assumed — SignalR Core's JSON protocol guarantees this, and the probe never observed a split)*.
- `type: 1` — invocation. `arguments` is `[topic, payload, timestamp]`. `target` is the hub method
  name (`feed`).
- `type: 3` — completion. `result` is the initial snapshot dict: `{topic: payload, ...}`.
- `type: 6` — ping. Must be sent by the client periodically as an app-level keepalive
  (`{"type":6}\x1e`) in addition to WebSocket-protocol pings.

### 3.4 Topics subscribed

```
Heartbeat, SessionInfo, DriverList, TimingData, TimingAppData, TimingStats,
TrackStatus, RaceControlMessages, WeatherData, CarData.z, Position.z
```

### 3.5 `.z` topics

`CarData.z` and `Position.z` payloads are **base64 of raw deflate** (no zlib header):

```python
json.loads(zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS))
```

The negative `wbits` is mandatory. `zlib.decompress(data)` without it fails. Verified working
against both the live feed and the static archive.

### 3.6 Observed payload shapes

These are the field names the probe actually returned. Not an exhaustive schema — the feed carries
more fields than are listed, and F1 changes it without notice.

**`SessionInfo`** — meeting/session identity, names, session type, start time.

**`DriverList`** — driver number (string key) → `{ RacingNumber, Tla, FullName, TeamName,
TeamColour, Line, ... }`.
- `Tla` is the 3-letter code (e.g. `VER`).
- `TeamColour` is a **bare hex RGB string with no leading `#`** — prepend `#` for CSS.
- `Line` is the driver's list ordering.

**`TimingData`** → `{ Lines: { "<driverNo>": { ... } } }`, per-driver fields observed:
- `Position`
- `GapToLeader` (string, e.g. `"+1.234"`, `"LAP1"`, `""`)
- `IntervalToPositionAhead: { Value, Catching }` — `Catching` is a bool the UI can use for a
  closing-in indicator
- `Sectors: [ { Value, Segments: [ { Status } ], OverallFastest, PersonalFastest } ]`
- `NumberOfPitStops`, `InPit`, `Retired`
- lap time fields (`LastLapTime`, `BestLapTime`) with `Value` / `OverallFastest` /
  `PersonalFastest` sub-fields

**`TimingAppData`** → `{ Lines: { "<driverNo>": { Stints: [ { Compound, New, TotalLaps } ] } } }`.
`Compound` is `SOFT` / `MEDIUM` / `HARD` / `INTERMEDIATE` / `WET`. Current tyre = last stint.

**`TimingStats`** → `{ Lines: { "<driverNo>": { PersonalBestLapTime, BestSectors, BestSpeeds } } }`.

**`TrackStatus`** → current flag/status code + message.

**`RaceControlMessages`** → `{ Messages: [ ... ] }` in the snapshot; **in deltas `Messages`
arrives as an index-keyed dict**, see §3.7.

**`WeatherData`** → latest sample (air/track temp, humidity, pressure, wind, rainfall).

**`CarData.z`** (inflated) → `{ Entries: [ { Utc, Cars: { "<driverNo>": { Channels: {...} } } } ] }`.
Channel map, verified:

| Channel | Meaning |
|---|---|
| `0` | RPM |
| `2` | Speed (km/h) |
| `3` | Gear |
| `4` | Throttle (%) |
| `5` | Brake |
| `45` | DRS |

**`Position.z`** (inflated) → `{ Position: [ { Timestamp, Entries: { "<driverNo>":
{ Status, X, Y, Z } } } ] }`.

### 3.7 Delta merge semantics — the subtle part

**In delta messages, arrays from the snapshot arrive as index-keyed dictionaries.** A driver's
`Sectors` list becomes `{"1": {...}}` to mean "patch element 1 only". Same for `Stints` and
`RaceControlMessages.Messages`.

So the merge must be recursive, and when the target is a `list` and the incoming key is a
numeric string, that string indexes into the list (extending it if the index is past the end).
This is the single highest-risk piece of logic in the whole feature and is why it gets its own
task with its own tests (Task 2).

Also: `_kf` keys appear in payloads and carry no useful information — strip them.

Failure to handle index-keyed dicts shows up as sector times that never update after the first
lap, and a race control feed stuck on its initial messages. Neither crashes, so it will not be
caught by anything except a test.

---

## 4. The probe scripts

These live in `/tmp` in the original session and **will not survive**. Reproduced verbatim so they
can be re-run. They are throwaway diagnostics, not production code — do not commit them to
`backend/`.

Both require a venv with `httpx` and `websockets`:

```bash
python3 -m venv /tmp/wsprobe && /tmp/wsprobe/bin/pip install httpx websockets==15.0.1
/tmp/wsprobe/bin/python /tmp/probe_f1.py
```

Note: `python3 -m venv <dir> -q` fails on this machine (`venv: error: unrecognized arguments: -q`).
Also `timeout` is not available on macOS — the live probe has its own internal deadline instead.

### 4.1 `/tmp/probe_f1.py` — live feed

```python
"""Probe the F1 SignalR Core live-timing feed: verify negotiate + handshake + subscribe."""
import asyncio, base64, json, sys, zlib
import httpx
from websockets.asyncio.client import connect

NEG = "https://livetiming.formula1.com/signalrcore/negotiate"
WS = "wss://livetiming.formula1.com/signalrcore"
RS = "\x1e"
TOPICS = ["Heartbeat", "SessionInfo", "DriverList", "TimingData", "TimingAppData",
          "TimingStats", "TrackStatus", "RaceControlMessages", "WeatherData",
          "CarData.z", "Position.z"]


def inflate(payload):
    return json.loads(zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS))


async def main():
    async with httpx.AsyncClient(timeout=20.0) as c:
        pre = await c.options(NEG, headers={"User-Agent": "BestHTTP"})
        cookies = "; ".join(f"{k}={v}" for k, v in pre.cookies.items())
        print("OPTIONS:", pre.status_code, "cookies:", list(pre.cookies.keys()))
        r = await c.post(NEG, params={"negotiateVersion": 1},
                         headers={"User-Agent": "BestHTTP", "Cookie": cookies})
        print("POST negotiate:", r.status_code, "keys:", sorted(r.json().keys()))
        token = r.json()["connectionToken"]
        cookies2 = "; ".join(f"{k}={v}" for k, v in r.cookies.items()) or cookies

    hdrs = {"User-Agent": "BestHTTP", "Accept-Encoding": "gzip,identity"}
    if cookies2:
        hdrs["Cookie"] = cookies2
    async with connect(f"{WS}?id={token}", additional_headers=hdrs,
                       max_size=None, open_timeout=20) as ws:
        await ws.send(json.dumps({"protocol": "json", "version": 1}) + RS)
        print("handshake ack:", (await asyncio.wait_for(ws.recv(), 15))[:200])
        await ws.send(json.dumps({"type": 1, "invocationId": "0",
                                  "target": "Subscribe", "arguments": [TOPICS]}) + RS)
        seen, deadline = 0, asyncio.get_event_loop().time() + 45
        while seen < 12 and asyncio.get_event_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), 12)
            except asyncio.TimeoutError:
                print("(recv timeout)")
                break
            for rec in [x for x in raw.split(RS) if x.strip()]:
                seen += 1
                msg = json.loads(rec)
                t = msg.get("type")
                if t == 3:  # completion -> initial snapshot
                    res = msg.get("result", {})
                    print("\n=== COMPLETION type=3 topics ===")
                    print(sorted(res.keys()))
                    for k, v in res.items():
                        if k.endswith(".z") and isinstance(v, str):
                            try:
                                v = inflate(v)
                                print(f"\n-- {k} (inflated) --\n" + json.dumps(v)[:600])
                                continue
                            except Exception as e:
                                print(f"-- {k} inflate failed: {e}")
                        print(f"\n-- {k} --\n" + json.dumps(v)[:900])
                elif t == 1:
                    args = msg.get("arguments", [])
                    topic = args[0] if args else "?"
                    body = args[1] if len(args) > 1 else None
                    if isinstance(topic, str) and topic.endswith(".z") and isinstance(body, str):
                        try:
                            body = inflate(body)
                        except Exception as e:
                            body = f"<inflate failed {e}>"
                    print(f"\n>>> FEED target={msg.get('target')} topic={topic} "
                          f"ts={args[2] if len(args) > 2 else None}\n"
                          + json.dumps(body)[:500])
                else:
                    print(f"\n(type={t}) {rec[:160]}")
        print("\nrecords seen:", seen)

asyncio.run(main())
```

### 4.2 `/tmp/probe_static.py` — static archive

```python
import base64, json, re, zlib, httpx

BASE = "https://livetiming.formula1.com/static/2026/2026-07-26_Hungarian_Grand_Prix/2026-07-26_Race/"
LINE = re.compile(r"^(\d{2}:\d{2}:\d{2}\.\d{3})(.*)$")


def head(name, nbytes=4000):
    r = httpx.get(BASE + name, headers={"User-Agent": "BestHTTP", "Range": f"bytes=0-{nbytes}"},
                  timeout=30.0, follow_redirects=True)
    txt = r.content.decode("utf-8-sig", errors="ignore")
    print(f"\n===== {name} -> HTTP {r.status_code} ({len(r.content)} bytes) =====")
    return txt


for name in ["CarData.z.jsonStream", "Position.z.jsonStream"]:
    txt = head(name, 6000)
    first = txt.splitlines()[0]
    m = LINE.match(first)
    ts, payload = m.group(1), m.group(2).strip().strip('"')
    data = json.loads(zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS))
    print("ts:", ts, "| inflated keys:", list(data.keys()) if isinstance(data, dict) else type(data))
    print(json.dumps(data)[:1100])

for name in ["TimingData.jsonStream", "TimingAppData.jsonStream", "TrackStatus.jsonStream",
             "RaceControlMessages.jsonStream", "SessionInfo.jsonStream"]:
    txt = head(name, 2500)
    for line in txt.splitlines()[:4]:
        m = LINE.match(line)
        if m:
            print(f"[{m.group(1)}] {m.group(2)[:520]}")
```

---

## 5. Fixture source — the "can't test without a live session" problem, solved

The spec says testing requires recording a fixture during a real session, which would block all
test-writing until the next Grand Prix. **That blocker is removed.** F1 publishes the same feed as
static archive files, verified reachable:

```
https://livetiming.formula1.com/static/<SessionPath>/<Topic>.jsonStream
e.g. https://livetiming.formula1.com/static/2026/2026-07-26_Hungarian_Grand_Prix/2026-07-26_Race/TimingData.jsonStream
```

Verified properties:

- Honors HTTP `Range` requests (returns **206**), so a fixture can be built from the first few KB
  instead of downloading a whole race.
- Files are encoded with a **UTF-8 BOM** — decode with `utf-8-sig`, not `utf-8`.
- Each line is `HH:MM:SS.mmm` followed immediately by the payload, no delimiter between them.
- For `.z` topics the payload is a **quoted** base64 string — strip the surrounding `"` before
  decoding.
- The payloads are the real thing: real `.z` inflation and real index-keyed delta shapes were both
  confirmed from archive data, so tests built on this fixture exercise the actual merge logic.

Two consequences, both locked in:

1. `recorder.py` gets an archive-fetch CLI mode, so a fixture can be generated on demand right now.
2. A `LIVETIMING_REPLAY` env var replays a fixture through the normal pipeline, so the frontend
   tasks are visually verifiable offline with no live session.

---

## 6. Codebase facts

Verified 2026-08-17. Line numbers are current as of commit `45bf9a9`.

### 6.1 Backend

`backend/main.py` — **656 lines**. Every HTTP route is `/api/`-prefixed. Note the spec refers to
`/live-data` and `/location`; the real paths are `/api/live-data` and `/api/location`.

| What | Lines |
|---|---|
| `OPENF1_BASE_URL` | 26 |
| `OPENF1_TOKEN_URL` | 27 |
| `OPENF1_USERNAME` / `OPENF1_PASSWORD` from env | 35-36 |
| `get_openf1_headers()` | 42 |
| `GET /api/status` | 140-212 |
| `GET /api/idle-data` | 214 |
| `GET /api/live-data` | 283 — **delete** |
| `GET /api/location` | 322 — **delete** |
| `GET /api/milestones` | 340 |
| `GET /api/driver/{driver_id}/stats` | 377 |
| `GET /api/constructor/{constructor_id}/stats` | 423 |
| `GET /api/circuit/{circuit_id}` | 460 |
| `GET /api/race-weekend/{circuit_id}` | 513 |

**Sponsor-auth deletion is safe.** `get_openf1_headers()` is called from exactly three places:
line 157 (`/api/status`), line 289 (`/api/live-data`), line 328 (`/api/location`). Once the two
routes are deleted and `/api/status` is rewritten to read `LiveSessionState`, nothing references
it — so `OPENF1_TOKEN_URL`, `OPENF1_USERNAME`, `OPENF1_PASSWORD`, `_openf1_token_cache`,
`_openf1_token_lock`, and `get_openf1_headers` all go. The spec asked for this to be re-checked at
implementation time; this is that check, and it passed. `OPENF1_BASE_URL` (line 26) **stays** —
`/api/race-weekend` still uses it at lines 533/545/551.

`backend/requirements.txt` — currently:

```
fastapi==0.104.1
uvicorn==0.24.0
httpx==0.25.1
python-dotenv==1.0.0
pydantic==2.5.1
pydantic-settings==2.1.0
```

**No `websockets` dependency.** Serving `/ws/live` would fail today: uvicorn 0.24 has no WebSocket
implementation installed. Adding `websockets==15.0.1` fixes both sides at once — see §7.

`backend/railway.toml` — `startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"`,
healthcheck `/docs`. No change needed; the lifespan task starts with the app.

`backend/test_circuit_history.py` — 4 tests, the pattern to follow: module-level
`client = TestClient(app)` plus `respx` for HTTP mocking. Important: constructing `TestClient` at
module level like this does **not** trigger the lifespan handler, which is precisely why the new
tests need `LIVETIMING_AUTOSTART=0` — see §7.

Python is **3.9.6**. This is a real constraint: no `X | Y` runtime annotations, no `match`
statements. Use `Optional[X]` / `Dict[str, Any]` from `typing`.

### 6.2 Frontend

`frontend/src/App.tsx` — **1426 lines**, single-file. Nothing else in `src/` except `main.tsx`,
`index.css`, `App.css`, `assets/`, and `circuits/` (24 GeoJSON files + `index.ts`).

| Symbol | Line | Disposition |
|---|---|---|
| `API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000/api"` | 17 | keep; WS URL must be derived from it |
| `TEAM_COLORS` | 30 | keep — but the feed's `TeamColour` supersedes it for live views |
| `CircularGauge` | 98 | **not exported** — extract to `src/ui/CircularGauge.tsx` |
| `TrackMap` | 127 | replaced by `src/live/TrackMap.tsx`; delete old one |
| `MOCK_DRIVERS` | 701 | **delete** |
| `_buildMockLiveData` | 724 | **delete** |
| `_buildMockLocations` | 740 | **delete** |
| `export const __mockHelpers` | 752 | **delete** |
| `LiveDashboard` | 756-926 | replaced by `src/live/LiveDashboard.tsx` |
| ↳ 2s polling of `/live-data` + `/location` | 762-776 | delete |
| ↳ `status.no_api_access` branch | 780 | delete |
| ↳ `CircularGauge` usage | 864-865 | moves into `DriverTelemetryPanel` |
| ↳ `TrackMap` usage | 874 | moves into new `TrackMap` |
| `App()` | 949 | modify |
| ↳ `axios.get(${API_BASE}/status)` poll | 967 | keep (30s) |
| ↳ `<LiveDashboard status={status} />` | 1090 | swap to new component |

Why `CircularGauge` must be extracted: `App.tsx` will import `LiveDashboard` from `src/live/`, and
`DriverTelemetryPanel` needs `CircularGauge`. Importing it back out of `App.tsx` would create a
circular import. Extracting to `src/ui/CircularGauge.tsx` breaks the cycle.

Stack: React 19.2.6, Vite 8.0.12 (rolldown), TypeScript ~6.0.2, Tailwind 3.4.19, framer-motion
12.40, recharts 3.8.1, lucide-react 1.17, axios 1.16.
**There is no `test` script and no test runner installed.** Frontend tests need vitest added —
pin `^4.1.10`, which is the line whose peer range accepts `vite ^8`.

Design tokens (`tailwind.config.js` + `src/index.css`): `mkbhd-black` `#0a0a0a`, `mkbhd-studio`
`#141414`, `mkbhd-red` `#cc0000`, `mkbhd-gray` `#a3a3a3`, radius `rounded-mkbhd`; utility classes
`.mkbhd-card`, `.mkbhd-btn-primary`, `.studio-header`. New components must use these, not bespoke
colors.

### 6.3 Docs that must be updated when this ships

- `README.md` — live section currently describes the OpenF1 polling path.
- `MEMORY.md` — its Component Index line numbers are **already stale** (it lists `LiveDashboard`
  at 565, actual 756; `CircularGauge` at 100, actual 98). Refresh the whole table, don't just
  append.
- `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md` — needs the §3 protocol
  addendum.

Existing plan to copy formatting from: `docs/superpowers/plans/2026-05-30-circuit-history-year-picker.md`.

---

## 7. Locked design decisions

Each of these was decided deliberately; the rationale matters more than the choice, so it is
recorded alongside.

**1. `websockets==15.0.1`, pinned exactly.**
It is the last release supporting Python 3.9, and a cp39 wheel exists. Critically, that wheel ships
*both* `websockets/asyncio/` (the modern client the F1 client code uses) and `websockets/legacy/`
(the server implementation uvicorn 0.24 looks for). One pin solves both the outbound connection to
F1 and the inbound `/ws/live` server. Upgrading past it breaks Python 3.9.

**2. Broadcast patches carry the complete new value for each top-level key, not the raw delta.**
The frontend never re-implements merge logic. The backend is the single source of truth for merged
state; the browser only replaces keys. Tradeoff accepted: larger payloads than forwarding raw
deltas. Justified because the index-keyed-dict merge (§3.7) is the most error-prone logic in the
system and having two independent implementations of it — one in Python, one in TypeScript — is a
guaranteed drift bug.

**3. Raw topics are the SSOT; the snake_case shape the frontend sees is derived.**
`LiveSessionState` stores each topic's merged raw payload, and projections compute the friendly
view. Storing both merged raw state and a hand-maintained parallel derived copy would be the
"syncing two states" anti-pattern.

**4. Sector coloring keys off `PersonalFastest` / `OverallFastest` booleans, not segment codes.**
Those booleans were directly observed in `TimingData.Sectors`. The per-segment `Status` integers
are undocumented and were not decoded. A best-effort segment→color map is fine, but it must fall
back to grey for unknown codes, and the primary coloring must not depend on it. Stated plainly:
the segment codes are a guess; the booleans are not.

**5. Per-topic fail-soft decoding.**
A malformed or unrecognised payload logs `topic` plus a truncated prefix and is skipped. It never
propagates far enough to drop the connection. This is the spec's protocol-drift mitigation, and it
is the difference between "one widget goes stale" and "live timing is down".

**6. `is_live` is derived, three conditions:**
```
is_live = connected
          and session_status not in {"Finalised", "Ends"}
          and seconds_since_last_message() < 120
```
The staleness term is the important one — without it a hung-but-open socket reads as live forever.

**7. Env flags:**
- `LIVETIMING_AUTOSTART` — default on; set `0` to stop the lifespan task from dialling F1. Set in
  `backend/conftest.py` so the test suite never touches the network.
- `LIVETIMING_REPLAY` — path to a fixture; replays it through the real pipeline for offline
  frontend work.

**8. Route naming:** HTTP stays `/api/`-prefixed; the WebSocket is bare **`/ws/live`** per the
spec. Worth stating explicitly because it is the one endpoint that breaks the `/api` convention,
and `API_BASE` on the frontend ends in `/api`, so the WS URL has to be derived from its origin
rather than by appending to it.

**9. Constants, fixed:**
```python
RECORD_SEPARATOR = "\x1e"
NEGOTIATE_URL = "https://livetiming.formula1.com/signalrcore/negotiate"
WS_URL         = "wss://livetiming.formula1.com/signalrcore"
BACKOFF_SCHEDULE = (1, 2, 5, 10)          # seconds, last value repeats
CLIENT_HEADERS = {"User-Agent": "BestHTTP", "Accept-Encoding": "gzip,identity"}
RACE_CONTROL_MAX = 100                     # bounded rolling buffer
CAR_DATA_CHANNELS = {0: "rpm", 2: "speed", 3: "gear", 4: "throttle", 5: "brake", 45: "drs"}
```
WebSocket keepalive: `ping_interval=20`, `ping_timeout=20`, **no read timeout** — between sessions
the feed legitimately goes quiet for long stretches, and a read timeout would cause a reconnect
storm during exactly the period when nothing is wrong.

**10. Test infrastructure to add:**
- `backend/pytest.ini` with `asyncio_mode = auto`
- `backend/conftest.py` setting `LIVETIMING_AUTOSTART=0`
- `backend/requirements-dev.txt` (`pytest`, `pytest-asyncio`, `respx`)
- frontend `vitest@^4.1.10` + a `test` script, for pure helpers only — no component rendering

`client.py`'s negotiate step is testable with `respx` (it is plain HTTP). The WebSocket leg stays
manually verified, as the spec allows.

---

## 8. Task decomposition (12 tasks, in order)

This is the sequence the plan document should encode. Dependencies run strictly downward; each
task ends with something independently testable.

| # | Deliverable | Notes |
|---|---|---|
| 1 | `backend/livetiming/decode.py` | `RECORD_SEPARATOR`, `TopicMessage(NamedTuple)`, `inflate_z()`, `parse_frame()`. Pure functions, trivially unit-tested. |
| 2 | `merge_delta()` in `backend/livetiming/state.py` | The index-keyed-dict→list merge. `_kf` stripped. **Most test coverage of any task.** |
| 3 | `LiveSessionState` | Raw-topic SSOT + derived snake_case projections, `apply(msg) -> patch`, `snapshot()`, `seconds_since_last_message()`, `RACE_CONTROL_MAX`, `CAR_DATA_CHANNELS`. |
| 4 | `backend/livetiming/recorder.py` | Archive-fixture CLI + JSONL records `{"topic","payload","timestamp"}` storing `.z` payloads as raw base64. Plus the replay test that proves the fixture drives 1-3. |
| 5 | `backend/livetiming/client.py` | Negotiate/connect/subscribe/reconnect. App-level `{"type":6}` pings. `respx`-tested negotiate. |
| 6 | Delivery | `backend/livetiming/hub.py` `Broadcaster`; `GET /ws/live`; `lifespan` wiring with `LIVETIMING_AUTOSTART`/`LIVETIMING_REPLAY`; `/api/status` rewrite; **delete** `/api/live-data`, `/api/location`, and the whole OpenF1 sponsor-auth block; add `websockets==15.0.1`. |
| 7 | `frontend/src/live/types.ts`, `liveState.ts`, `useLiveTimingSocket.ts` | Reducer + hook. vitest covers `liveState.ts` as a pure function. |
| 8 | `frontend/src/live/TimingTower.tsx` | Position, gap, interval, sectors, tyre/stint, pits. |
| 9 | `frontend/src/live/TrackMap.tsx` | All cars, feed team colors. **Bounds must be an expand-only ref** — the old `TrackMap` re-normalised min/max every frame, which makes the map visibly jitter as cars move. |
| 10 | `frontend/src/live/RaceControlFeed.tsx` | Newest-first, flag-colored. |
| 11 | `frontend/src/live/DriverTelemetryPanel.tsx` + `frontend/src/ui/CircularGauge.tsx` | The extraction from §6.2. |
| 12 | `frontend/src/live/LiveDashboard.tsx` + integration | Compose 8-11; swap into `App.tsx:1090`; delete mocks (`App.tsx:701-752`), old `TrackMap` (127), `no_api_access` branch (780); update `README.md`, `MEMORY.md`, and add the spec protocol addendum. |

Task 6 is the widest and the only one that deletes public API surface. Tasks 1-5 are additive and
land with zero behavioral change, which is what makes this safe to execute incrementally.

---

## 9. Risks carried forward

From the spec, still live:

- **Protocol drift.** This feed is unofficial and F1 has reshaped it before without notice — as §3
  demonstrates, since the spec was written two days earlier and its protocol section was already
  wrong. Mitigation is decision 5 (per-topic fail-soft).
- **ToS ambiguity.** Same unofficial/gray-area status as OpenF1 and FastF1's `livetiming`. Not new,
  but worth being deliberate about before treating this as public-facing rather than a personal
  tool.
- **Single point of failure.** One process holds the stateful connection; a crash drops all
  viewers until restart. Accepted at current scale, called out in case that changes.

Added during verification:

- **Undecoded segment `Status` codes** — see decision 4. The honest position: sector-segment
  micro-coloring is best-effort and unverified.
- **Cookie/WAF dependency.** The negotiate flow needs the cookies from the preflight `OPTIONS`. If
  F1 changes its edge configuration, this is the first thing that breaks, and it will present as a
  401 on negotiate.
- **Frontend has no test runner at all today.** Task 7 is the first task that needs one, so adding
  vitest is on that task's critical path, not a nice-to-have.

---

## 10. How to resume

1. Read `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md`, then read §3 of this
   document to correct it.
2. Write `docs/superpowers/plans/2026-08-17-live-timing-signalr.md` following
   `superpowers:writing-plans`: agentic-worker header, Global Constraints (Python 3.9.6 /
   `websockets==15.0.1` / `/api` prefix vs bare `/ws/live` / `LIVETIMING_AUTOSTART` / mkbhd tokens),
   a Files table, per-task Interfaces blocks, and bite-sized checkbox TDD steps with real code and
   no placeholders. §8 is the task list; §7 supplies the exact constants and signatures.
3. Run the writing-plans self-review: spec coverage, placeholder scan, type consistency.
4. Offer the execution handoff: Subagent-Driven (`superpowers:subagent-driven-development`,
   recommended) or Inline (`superpowers:executing-plans`).

Session constraints that were in force and should be assumed to continue: do not spawn subagents
and do not use workflows or deep-research unless explicitly asked.
