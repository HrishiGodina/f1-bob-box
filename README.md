# F1 Strategy Dashboard

A personal Formula 1 strategy dashboard — live telemetry during race sessions, standings, circuit analysis, and race weekend results when idle.

![Tech Stack](https://img.shields.io/badge/React-Vite-blue) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green) ![Tailwind](https://img.shields.io/badge/Style-Tailwind-teal)

---

## Features

### Live Session
- Real-time leaderboard pulled from OpenF1
- Telemetry gauges — speed, RPM, gear
- Throttle / brake bar traces
- Driver position dot map on SVG grid
- Mock simulation mode (⚡ toggle in navbar) — 20-driver fixture with cycling telemetry, no backend required

### Idle Dashboard
- **World Championship** — driver and constructor standings with career profile modal
- **This Season** — completed rounds grid, click any card to open circuit analysis
- **Upcoming Races** — all remaining rounds in horizontal scroll, click to open circuit layout
- **Global Dispatch** — F1 news feed (ESPN) in horizontal scroll
- **THE ARCHIVE** — full season timeline modal

### Circuit Analysis Modal
Two tabs per circuit:

**CIRCUIT** — stats (corners, laps, lap record), elevation profile, team tactical upgrades, historical race results with year picker (back to circuit redesign year)

**RACE WEEKEND** — per-session results for any year:
- Race, Qualifying, Sprint → Jolpica-F1 API
- FP1 / FP2 / FP3 → OpenF1 (2023+ only; tabs hidden for earlier years or when no data)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite 8 (Rolldown), Tailwind CSS, Framer Motion, Recharts |
| Backend | Python 3.11+, FastAPI, httpx |
| Data | OpenF1 (`api.openf1.org/v1`), Jolpica-F1 (`api.jolpi.ca/ergast/f1`), ESPN news API |
| Circuit geometry | Real GeoJSON for 24 circuits (bacinger dataset) |

---

## Getting Started

### Prerequisites
- Node 18+
- Python 3.11+

### Run

```bash
# Clone
git clone https://github.com/HrishiGodina/f1-bob-box.git
cd f1-bob-box

# Start everything (frontend + backend)
./run-dashboard.sh
```

Open [http://localhost:5173](http://localhost:5173).

The script manages both processes. Frontend on `:5173`, backend API on `:8000`.

### Manual setup

**Backend**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Project Structure

```
f1-dashboard/
├── backend/
│   ├── main.py                  # FastAPI — all endpoints
│   └── test_circuit_history.py  # pytest tests (requires respx)
├── frontend/
│   └── src/
│       ├── App.tsx              # All components in one file (~1400 lines)
│       └── circuits/            # GeoJSON for 24 circuits
├── run-dashboard.sh             # Start/stop script
└── docs/superpowers/            # Design specs and implementation plans
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Live session check. `?mock=true` for simulation |
| GET | `/api/idle-data` | Standings, schedule, next race, news |
| GET | `/api/circuit/{id}` | Circuit info + historical results. `?season=N` |
| GET | `/api/race-weekend/{id}` | Session results. `?year=N&session=race\|quali\|sprint\|fp1\|fp2\|fp3` |
| GET | `/api/driver/{id}/stats` | Driver career stats |
| GET | `/api/constructor/{id}/stats` | Constructor career stats |
| GET | `/api/live-data` | Live telemetry + intervals. `?session_key=N` |
| GET | `/api/location` | Latest driver positions. `?session_key=N` |

---

## Deployment

### Frontend → Vercel (recommended, free)

1. Import `https://github.com/HrishiGodina/f1-bob-box` in [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `frontend`
3. Framework preset: **Vite** (auto-detected)
4. Add environment variable: `VITE_API_BASE=https://your-backend.railway.app/api`
5. Deploy — Vercel handles the rest

### Backend → Railway (free tier)

1. New project → **Deploy from GitHub repo**
2. Set **Root Directory** to `backend`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Copy the generated domain, paste it as `VITE_API_BASE` in Vercel

> The frontend currently hardcodes `http://localhost:8000/api`. To use the env var, change the `API_BASE` constant in `frontend/src/App.tsx` line 17 to:
> ```ts
> const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";
> ```

---

## Tests

```bash
cd backend
source venv/bin/activate
pip install respx pytest-asyncio
pytest test_circuit_history.py -v
```
