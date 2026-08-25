# Own Live Timing Feed (F1 SignalR) — Design

**Date:** 2026-08-14
**Status:** Approved

## Summary

Replace the OpenF1-backed live-session path with our own client for F1's internal
live timing feed at `livetiming.formula1.com`. The backend connects directly via
SignalR, decodes the stream, keeps an in-memory snapshot of the current session,
and pushes it to the frontend over our own WebSocket. This removes the
sponsor-auth / 402-during-live limitation entirely for live data, since this feed
requires no credentials.

Historical/schedule data (results, standings, circuits, upcoming races) is
unaffected — those stay on Jolpica/OpenF1 as they are today.

---

## Goals

- Live timing tower for every driver: position, gap, interval, sector times
  (with personal/session-best coloring), tyre compound + stint, pit stop count.
- Track map with every car's live position, color-coded by team.
- Race control message feed (flags, SC/VSC, investigations).
- Per-driver live telemetry (speed, throttle, brake, RPM, gear) for whichever
  driver is selected, replacing the current single-driver polling view.
- No credentials, no DB. In-memory state only; resets on process restart.

## Non-goals

- No historical persistence/replay of live sessions (future work, not this spec).
- No multi-instance/horizontal scaling of the backend — single process holds the
  SignalR connection and the in-memory state, matching current single-instance
  Railway deployment.
- No change to schedule/results/standings/circuit endpoints.
- No video/stream features (that scope was dropped along with the MultiViewer
  comparison this design started from).

---

## Backend

### New module: `backend/livetiming/`

```
backend/livetiming/
  __init__.py
  client.py      # SignalR negotiate/connect/subscribe + reconnect loop
  decode.py      # topic decoding (plain JSON vs deflate+base64 ".z" topics)
  state.py       # LiveSessionState — in-memory merge of incoming topics
  recorder.py    # optional raw-frame recording to a fixture file (see Testing)
```

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

### Decoding (`decode.py`)

- Most topics: plain JSON payloads.
- `CarData.z` and `Position.z`: raw-deflate + base64. Decode as
  `zlib.decompress(base64.b64decode(payload), -zlib.MAX_WBITS)` then `json.loads`.
- Each decoded message is a `(topic, data, timestamp)` tuple handed to
  `state.py` for merging.

### State (`state.py`)

`LiveSessionState` is a single process-wide object (asyncio-lock-guarded for
read/merge safety) holding:

- `connection_status`: connecting / connected / disconnected / reconnecting
- `session_info`: current meeting/session name, type, start time
- `drivers`: driver number → { name, team, team color, ... } from `DriverList`
- `timing`: driver number → { position, gap_to_leader, interval, last_lap,
  best_lap, sectors[], tyre_compound, stint_laps, pit_count, in_pit, retired }
  merged from `TimingData` + `TimingAppData` + `TimingStats`
- `positions`: driver number → { x, y, z } latest from `Position.z`
- `telemetry`: driver number → latest `{ speed, throttle, brake, rpm, gear, drs }`
  from `CarData.z`
- `track_status`: current flag/status
- `race_control`: bounded rolling list (e.g. last 100) of race control messages
- `weather`: latest weather sample

`state.snapshot()` returns a plain-dict copy of all of the above, used both to
seed newly-connected WebSocket clients and (optionally) for the recorder.

### Delivery: `GET /ws/live` (WebSocket)

- On client connect: send one `{"type": "snapshot", "data": state.snapshot()}`
  message immediately.
- After that: the decode loop broadcasts
  `{"type": "update", "topic": <topic>, "data": <merged-delta-or-topic-payload>}`
  to every connected socket as messages arrive from F1. Broadcast is a simple
  in-process fan-out over the set of connected `WebSocket` objects — no
  Redis/pubsub needed at single-instance scale.
- Dead/closed sockets are pruned on send failure.

### Removed from `main.py`

- `GET /live-data`, `GET /location` (OpenF1-backed).
- `get_openf1_headers`, `_openf1_token_cache`, `_openf1_token_lock`, and the
  `OPENF1_TOKEN_URL` sponsor-auth flow — no longer used by anything once the two
  routes above are gone. (Confirm no other route depends on
  `get_openf1_headers` before deleting — it should only be those two per current
  code, but re-check at implementation time since `main.py` may have shifted.)
- The `is_live` / `no_api_access` status check can switch from calling OpenF1's
  `sessions?session_key=latest` to reading `LiveSessionState.session_info` /
  `connection_status` directly, since we now have our own live signal.

### Unaffected

Schedule, results, standings, circuit history, FP session lookups — all stay on
Jolpica/OpenF1 exactly as implemented today.

---

## Frontend

`LiveDashboard` (`App.tsx:756-926`) currently polls `/live-data` + `/location`
for one selected driver and renders everything inline. It's replaced by a
WebSocket-driven set of focused components:

```
frontend/src/live/
  useLiveTimingSocket.ts   # WS connection + reconnect + parsed state hook
  TimingTower.tsx          # full grid: all drivers, gaps, sectors, tyres, pits
  TrackMap.tsx             # existing component, extended: all cars, team colors
  RaceControlFeed.tsx      # scrolling flag / SC / VSC / investigation log
  DriverTelemetryPanel.tsx # existing gauges, now driven by selected driver from WS state
  LiveDashboard.tsx        # composes the above, replaces current inline version
```

- `useLiveTimingSocket` owns the single WebSocket connection and exposes the
  latest merged state (mirrors backend's `LiveSessionState` shape) plus a
  `connectionStatus` so components can render "no session live" vs "reconnecting"
  distinctly instead of just going blank.
- Components read via selectors off shared context rather than one blob being
  prop-drilled everywhere (SSOT — one source, derive views per component).
- Track map and timing tower both key off the same `drivers`/`timing`/`positions`
  state so they stay in sync without separate fetches.

---

## Testing

We can't exercise the real SignalR feed on demand (only live during a session).
Strategy:

- `recorder.py` can dump raw `(topic, payload, timestamp)` frames to a JSONL
  fixture file when enabled via an env flag. Run it once during a real session
  to capture a real fixture.
- `decode.py` and `state.py` get unit tests replaying that fixture, asserting
  the merged state shape at various points (e.g. after a pit stop message, after
  a yellow flag) — this is where actual test coverage lives, independent of feed
  availability.
- `client.py`'s negotiate/connect/subscribe plumbing is thin and network-bound;
  it's verified by manually running against the live feed during a session
  rather than unit tested, same as any other third-party-protocol client.

## Observability

- Backend logs every connection state transition and any decode error (topic +
  raw payload prefix, not full payload, to avoid noisy logs).
- `connection_status` is part of the state snapshot so the frontend can show it
  directly rather than us needing separate health-check plumbing.

## Risks / open questions

- **Protocol drift**: F1 has changed this feed's shape before without notice
  (it's unofficial). Decoder should fail soft per-topic (log + skip a malformed
  message) rather than crashing the whole connection.
- **ToS ambiguity**: same unofficial/gray-area status discussed earlier applies
  here as it does to OpenF1, FastF1's `livetiming`, and every other third-party
  consumer of this feed. Not a new risk introduced by this design, just carried
  forward — worth being aware of before treating this as a public-facing product
  rather than a personal broadcast tool.
- **Single point of failure**: one backend process now holds a stateful
  connection; a crash drops all connected viewers until it restarts and
  reconnects. Acceptable at current scale (personal live-broadcast use), called
  out here in case that changes later.
