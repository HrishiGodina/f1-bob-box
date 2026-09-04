# F1 Dashboard — Project Memory

## Architecture

**Frontend:** `frontend/src/App.tsx` (1109 lines) — idle-dashboard components, modals, state. Live session lives in `frontend/src/live/` (domain components + `useLiveTimingSocket`/`liveState`/`types`) and `frontend/src/ui/` (shared presentation primitives).  
**Backend:** `backend/main.py` (FastAPI, ~400 lines) — proxies OpenF1, Jolpica, ESPN.  
**Backend tests:** `backend/test_circuit_history.py` (4 pytest tests, requires `respx`).  
**Ports:** Frontend 5173 (Vite), Backend 8000 (FastAPI).  
**Start/stop:** `./run-dashboard.sh` — manages both processes.  
**Theme:** `mkbhd-black` #0a0a0a · `mkbhd-studio` #141414 · `mkbhd-red` #cc0000 · `mkbhd-gray` #a3a3a3  
**Bundle:** Vite 8/Rolldown, 4 chunks via `manualChunks` in `vite.config.ts`.

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
| `TrackMap` | `frontend/src/live/TrackMap.tsx` | Live car positions, expand-only bounds; also renders a decorative GeoJSON track outline |
| `RaceControlTicker` | `frontend/src/live/RaceControlTicker.tsx` | Compact single-row Race Control strip — latest message + count badge |
| `DriverTelemetryPanel` | `frontend/src/live/DriverTelemetryPanel.tsx` | Selected driver's gauges + local speed-trace ring buffer |
| `CircularGauge` | `frontend/src/ui/CircularGauge.tsx` | Shared SVG gauge primitive (extracted from the old `App.tsx`) |
| `battles` | `frontend/src/live/battles.ts` | `computeBattles` — derives on-track battles (approaching/live tiers) from timing gaps |
| `useWingBotAlerts` | `frontend/src/live/useWingBotAlerts.ts` | Hook — turns new battles into transient toast alerts (TTL-based) |
| `WingBotAlerts` | `frontend/src/live/WingBotAlerts.tsx` | Renders `useWingBotAlerts` toasts, bottom-right |
| `BattleWatchList` | `frontend/src/live/BattleWatchList.tsx` | Card listing "live" tier battles with driver speeds |
| `track` | `frontend/src/circuits/track.ts` | `resolveCircuitKey`, `geoJsonToSvgPath`, `fallbackTrackPath` — session-name → circuit slug + SVG path helpers |

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
- `/api/status` → `{"is_live": bool}` from `LiveSessionState.is_live()` (own SignalR feed, not OpenF1 — see Live Session Components above)

## Remaining Tasks

1. **F1 official logo** — replace "F1D" text in navbar with official F1 SVG marque
2. **Race results modal** — FP/Quali/Race/Sprint tabs for completed rounds; needs `GET /api/race-results/{season}/{round}`

## Verification

```bash
cd frontend && npm run build
cd backend && source venv/bin/activate && pytest test_circuit_history.py -v
```
