# F1 Strategy Center

A personal Formula 1 strategy dashboard — a real-time live-timing cockpit during sessions, and a full statistics/analysis workspace when idle.

![Tech Stack](https://img.shields.io/badge/React-Vite-blue) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green) ![Tailwind](https://img.shields.io/badge/Style-Tailwind-teal)

---

## Features

### Live Session
- **Timing tower** — running order with gap/interval, sector times (personal/session-best coloring), tyre compound + stint age, pit stops, places gained/lost vs the starting grid
- **Grid telemetry** — every car plotted on the real circuit layout (GeoJSON for 26 circuits), with the start/finish line drawn on the track
- **Battle watch** — live two-car battles with gap, speed and last-lap comparison; corner alerts when a battle is closing
- **Steward states** — purple timer for the fastest-lap holder, yellow alert for drivers under investigation, red alert for unserved penalties (derived from live race-control messages)
- **Session bests** — fastest lap, session top speed, most positions gained, best sectors
- **Race-control ticker** — flags, safety car/VSC, investigations, penalties
- **Session recording** — every topic update is written to disk (pre-decode) so any session can be replayed later through the real pipeline

### Idle Dashboard
- World championship standings with career profiles
- Season calendar with circuit analysis (elevation, lap record, historical results back to the circuit's redesign year)
- Race-weekend results for any year: race/quali/sprint via Jolpica-F1, practice sessions via OpenF1
- F1 news feed

### Demo Mode
- One click replays a simulated race in the UI — or replay a **real recorded session** end-to-end (see [Recording & Replay](#recording--replay))

---

## How the live feed works

The backend runs its own client for F1's official SignalR live-timing stream (`livetiming.formula1.com`): it negotiates the connection, subscribes to ~11 topics (timing, position, car data, race control, weather…), decodes the delta stream, and broadcasts a merged snapshot + patches to every connected browser over `/ws/live`.

> **F1TV subscription note (2026):** the feed now serves `Position.z` (car coordinates) and `CarData.z` (telemetry) only to authenticated connections. Unauthenticated sessions still get timing, race control and weather. To enable driver tracking and telemetry you need an active F1TV Access/Pro/Premium subscription and a one-time browser sign-in:

```bash
cd backend
python -m livetiming.f1auth            # opens the F1 login in your default browser
python -m livetiming.f1auth --open     # same, auto-opens the URL
```

The resulting subscription token is stored in `backend/.f1auth.json` (gitignored) and lasts 4 days; re-run the command to refresh. `python -m livetiming.f1harvest refresh` re-opens the browser only when the token is actually near expiry.

---

## Getting Started

**Prerequisites:** Node 18+, Python 3.9+

```bash
git clone https://github.com/HrishiGodina/f1-bob-box.git
cd f1-bob-box
./run-dashboard.sh        # starts backend (:8000) + frontend (:5173)
```

Open [http://localhost:5173](http://localhost:5173).

### Manual setup

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py                     # or: uvicorn main:app --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev
```

---

## Recording & Replay

While connected, every raw topic update is appended to `backend/recordings/<UTC-timestamp>.jsonl` (base64 `.z` payloads stored exactly as received).

Replay any recording through the real decode → merge → broadcast pipeline:

```bash
cd backend
LIVETIMING_REPLAY=recordings/<file>.jsonl python main.py
```

The dashboard then behaves as if that session were live. Recordings are gitignored.

---

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_BASE` | frontend | Backend base URL (default `http://localhost:8000/api`) |
| `F1TV_SUBSCRIPTION_TOKEN` | backend | Overrides the stored F1TV token |
| `LIVETIMING_REPLAY` | backend | Path to a recording to replay instead of connecting live |
| `LIVETIMING_AUTOSTART` | backend | Set `0` to disable the feed client on startup |

---

## Testing

```bash
cd backend && venv/bin/python -m pytest -q     # backend: feed protocol, state, endpoints
cd frontend && npx vitest run                  # frontend: logic and demo-timeline shape
npx tsc -b tsconfig.app.json --force           # type check
```

---

## Deployment

`backend/railway.toml` deploys the API to Railway (Nixpacks, uvicorn). The frontend builds to static files (`npm run build`) and can be served from any static host pointing `VITE_API_BASE` at the API.

---

## Project Structure

```
f1-bob-box/
├── backend/
│   ├── main.py                  # FastAPI: REST endpoints, /ws/live, lifespan wiring
│   ├── livetiming/
│   │   ├── client.py            # SignalR client: negotiate, subscribe, decode, record
│   │   ├── state.py             # LiveSessionState: delta merge + derived projections
│   │   ├── decode.py            # SignalR frame/record parsing, .z inflation
│   │   ├── recorder.py          # JSONL recording + replay
│   │   ├── f1auth.py            # F1TV subscription-token login flow
│   │   └── hub.py               # WebSocket broadcaster
│   └── recordings/              # session recordings (gitignored)
├── frontend/
│   └── src/
│       ├── App.tsx              # idle dashboard, circuit analysis
│       └── live/                # live cockpit: tower, track map, battles, demo
│           └── demo/            # demo timeline (real-session replay data)
├── circuits/                    # GeoJSON layouts + start/finish points (via frontend/src/circuits)
└── run-dashboard.sh
```

---

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Live session check |
| GET | `/api/idle-data` | Standings, schedule, next race, news |
| GET | `/api/circuit/{id}` | Circuit info + historical results (`?season=N`) |
| GET | `/api/race-weekend/{id}` | Session results (`?year=N&session=race\|quali\|sprint\|fp1\|fp2\|fp3`) |
| GET | `/api/driver/{id}/stats` | Driver career stats |
| GET | `/api/constructor/{id}/stats` | Constructor career stats |
| GET | `/api/f1auth/status` | F1TV token expiry / needs-refresh |
| POST | `/api/f1auth/refresh/start` | Begin a token-renewal sign-in (returns the login URL) |
| WS | `/ws/live` | Full snapshot on connect, then incremental patches |

---

## Disclaimer

This project is a personal, non-commercial tool and is **not affiliated with, endorsed by, or connected to Formula 1, FIA, or any of their subsidiaries**. Timing data is consumed from Formula 1's publicly accessible live-timing service; historical data comes from community APIs (OpenF1, Jolpica-F1). F1, FORMULA 1 and related marks are trademarks of Formula One Licensing BV. Use responsibly and in accordance with the relevant terms of service.

## License

Not yet decided — a license (MIT/Apache-2.0) will be added before the public release.
