# F1 Dashboard — Project Memory

## Architecture

**Single-file frontend:** `frontend/src/App.tsx` (~1200 lines) — all components, modals, state.  
**Backend:** `backend/main.py` (FastAPI, ~400 lines) — proxies OpenF1, Jolpica, ESPN.  
**Backend tests:** `backend/test_circuit_history.py` (4 pytest tests, requires `respx`).  
**Ports:** Frontend 5173 (Vite), Backend 8000 (FastAPI).  
**Start/stop:** `./run-dashboard.sh` — manages both processes.  
**Theme:** `mkbhd-black` #0a0a0a · `mkbhd-studio` #141414 · `mkbhd-red` #cc0000 · `mkbhd-gray` #a3a3a3  
**Bundle:** Vite 8/Rolldown, 4 chunks via `manualChunks` in `vite.config.ts`.

## Component Index (App.tsx)

| Component | ~Line | Purpose |
|---|---|---|
| `TEAM_COLORS` | 18 | CSS color badge map for all 10 teams |
| `TeamLogo` | 34 | Renders colored badge with short team code |
| `StudioButton` | 50 | Primary/secondary button |
| `StudioModal` | 61 | Full-screen modal — Escape key + backdrop click closes |
| `CircularGauge` | 100 | SVG circular progress gauge (live telemetry) |
| `TrackMap` | 135 | Live driver positions on SVG grid |
| `CIRCUIT_ID_MAP` | 195 | Jolpica circuitId → bacinger GeoJSON key (24 circuits) |
| `geoJsonToSvgPath` | 210 | LineString GeoJSON → normalized SVG path 440×310 |
| `fallbackTrackPath` | 235 | Procedural fallback when circuit not in map |
| `CircuitTrack3D` | 255 | Real-geometry 3D track + SMIL car animation |
| `CircuitElevation` | 305 | Recharts area chart — `h-28` fixed height |
| `CircuitDetailsModal` | 332 | Circuit analysis: stats, elevation, year picker, results |
| `SectionHeader` | 475 | Section divider with icon + title |
| `CareerModal` | 488 | Driver/constructor profile modal |
| `LiveDashboard` | 565 | Live session: leaderboard + gauges + track map |
| Main `App()` | 720 | State, data fetching, layout, all modals |

## Page Layout (idle, top → bottom)

1. **Hero** — next race headline + CircuitTrack3D card (right)
2. **Standings** — drivers/teams toggle, "SEASON STANDINGS" → standings modal
3. **This Season** — completed rounds, click → CircuitDetailsModal
4. **Upcoming Races** — next 4
5. **Global Dispatch** — 4 news cards
6. **THE ARCHIVE** — "Full Season Timeline" → schedule modal

## Modal Render Order (important — later = higher z-index)
1. Standings StudioModal
2. Schedule StudioModal
3. Next Race StudioModal
4. CircuitDetailsModal
5. **CareerModal** ← always last, renders above all others

## CircuitDetailsModal — Year Picker

- Right-side card has `<select>` showing years since circuit redesign (descending)
- `CIRCUIT_REDESIGN_YEAR` dict (24 circuits) in `backend/main.py`; unknown circuits: `current_season - DEFAULT_HISTORY_WINDOW (10)`
- `available_years = range(start_year, current_season + 1)` — includes 2026
- Every year change always fetches fresh data (no skip condition)
- Year change sends `?season={selectedYear+1}` — backend returns `season-1` results
- `prev_results` returned in full (no backend slice)
- Top 5 by default; "SHOW ALL N RESULTS" expands full grid including DNFs
- DNF: `r.status` not starting with "Finished" and not matching `+N Lap` pattern
- Each row clickable → opens CareerModal

## Standings Modal

- `<colgroup>` with explicit widths: w-20 (POS), auto (entity), w-32 (points)
- `<th>` elements: `text-left`; data cells: `align-middle`
- Clicking a row opens CareerModal **on top of** standings (does not close standings)

## Data Sources

| Source | Used for |
|---|---|
| OpenF1 `api.openf1.org/v1` | Live telemetry, driver positions, session status |
| Jolpica-F1 `api.jolpi.ca/ergast/f1` | Standings, schedule, circuit info, career stats |
| ESPN hidden API | F1 news articles |

## Backend Conventions

- `GET /api/circuit/{id}?season=N` → fetches `N-1` results (e.g. season=2027 → 2026 results)
- `available_years` fixed to `range(start, 2027)` regardless of `season` param
- `/api/status?mock=true` → mock live session (session_key 9500)

## Remaining Tasks

1. **F1 official logo** — replace "F1D" text in navbar with official F1 SVG marque
2. **useMock dummy data** — 20 drivers, cycling telemetry, location data
3. **Race results modal** — FP/Quali/Race/Sprint tabs for completed rounds; needs `GET /api/race-results/{season}/{round}`

## Verification

```bash
cd frontend && npm run build
cd backend && source venv/bin/activate && pytest test_circuit_history.py -v
```
