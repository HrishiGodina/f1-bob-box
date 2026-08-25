# Context Transfer — Live-Session Design Polish + F1 Logo

**Date:** 2026-08-25
**Purpose:** Carry the working context of the live-session redesign + logo work across a context
boundary, so a session with zero prior context can finish cleanly without re-doing discovery.
**Repo:** `~/Developer/Personal/f1-dashboard` — branch **`main`** (personal repo; the Glance
`master`/`gitjoin`/JIRA conventions do **not** apply here).
**Spec:** `docs/superpowers/specs/2026-08-14-live-timing-signalr-design.md`
**Plan:** `docs/superpowers/plans/2026-08-17-live-timing-signalr.md` — **all 12 tasks executed and
committed.**
**Prior handoff:** `docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md`
(protocol facts, delta-merge semantics, task decomposition — still the reference for *backend*
protocol details).

---

## 1. Where things stand

| Item | State |
|---|---|
| 12-task SignalR live-timing plan | **Done** — all tasks committed (backend 1–6, frontend 7–12) |
| F1 logo + browser-tab branding | **Done & committed** (`c5ba827`) |
| Live-session redesign (tyres/sectors/session-bests/track-dots) | **Done & committed** (`e2be711`) |
| Frontend typecheck (`tsc -b tsconfig.app.json`) | **Clean** |
| Frontend tests (`vitest run`) | **13/13 pass** |
| Visual verification in browser | **Done** via preview system (full page captured, all features render, driver-select→telemetry works) |
| Offline demo fixture + preview launch config | **Built, NOT yet committed** — user approved committing (see §7, §9) |
| Throwaway files | **Deleted** (`frontend/public/logo-lab.html`, `backend/_gen_demo.py`) |
| `superpowers:finishing-a-development-branch` | **Not yet run** |
| `run-dashboard.sh` live-browser test (design request 3) | Satisfied via preview; literal script run still open (see §8) |

### The one thing to do first

Make **commit 3** — the offline-preview scaffolding the user explicitly approved:

```bash
git add backend/fixtures/live_demo.jsonl .claude/launch.json
git commit -m "chore: add offline live-timing demo fixture and preview launch config" \
  -m "..." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Stage those two paths explicitly. Do NOT `git add .claude/`** — that directory also holds
`.claude/settings.local.json` and `.claude/.cc-writes`, which must never be committed.

---

## 2. What was built this session (one paragraph)

Two things, on top of the already-complete SignalR live feed. (1) **A trademark-safe F1 logo**: an
original forward-raked "F1" speed-mark (white letterforms + a tapering 3-bar red speed flare),
reused in the nav and the favicon, plus a browser-tab title/description of "F1 Strategy Center".
It is a deliberate *homage*, not a reproduction of the trademarked official logo (the code comment
says so). (2) **A broadcast-style live-session redesign**: every driver row now shows tyre compound
(broadcast marker), tyre age, pit-stop count, gap/interval, last lap, three individual sector times
(purple = session-fastest, green = personal-best), and best lap; a new Session Bests bar calls out
Leader / Fastest Lap / Fastest Pace / Track Status separately; the track map plots every driver as
a team-colour dot; the telemetry panel populates on row-click. Fastest lap/pace are **derived on
read**, not stored.

---

## 3. Git state — exact

Commits made **this session** (both on `main`, not pushed):

| SHA | Subject |
|---|---|
| `e2be711` | feat: redesign live session with tyres, sectors, and session bests |
| `c5ba827` | feat: add trademark-safe F1 speed-mark logo and tab branding |

Preceding plan commits (already present): `9738998`, `433d482`, `07dd937`, `1348f79`, `d7fdd6e`,
`f73339f`, and earlier — the full 12-task feed.

**Working tree right now** (`git status --short`):

```
?? .claude/                                              # commit ONLY launch.json from here
?? .serena/                                              # tool cache — leave untracked
?? backend/fixtures/live_demo.jsonl                      # commit (approved)
?? docs/superpowers/handoffs/                            # this doc + the 08-17 one — optional commit
?? docs/superpowers/plans/2026-08-17-live-timing-signalr.md   # the plan — optional commit
?? frontend/.gitignore                                   # vite scaffolding — optional commit
?? frontend/README.md                                    # vite scaffolding — optional commit
```

There are **no modified tracked files** — the logo and live-session edits are all committed.

---

## 4. The live-session UI contract (5 files, all committed in `e2be711`)

So a future session can reason about the frontend without re-reading everything.

**`frontend/src/live/liveState.ts`** — added, alongside the existing reducer:
- `interface DriverBest { racingNumber; tla; time; seconds }`
- `interface SessionBests { fastestLap: DriverBest|null; fastestPace: DriverBest|null }`
- `parseLapTime(value): number|null` — parses `"1:15.870"` / `"58.123"` → seconds; null on blank/NaN.
- `computeSessionBests(timing, drivers): SessionBests` (pure). **Fastest Lap** = min of
  `best_lap.Value ?? personal_best_lap.Value` across *all* drivers. **Fastest Pace** = min of
  `last_lap.Value` among *non-retired* drivers. First driver wins ties.

**`frontend/src/live/liveState.test.ts`** — 13 tests total (3 `parseLapTime`, 3 `computeSessionBests`
incl. empty→nulls / personal-best fallback / retired-excluded, plus the prior reducer tests).

**`frontend/src/live/SessionBests.tsx`** (new) — `SessionBests({ bests, leaderTla, trackStatus })`.
- `trackFlag(track)` maps `TrackStatus.Status` codes → flag label+colour: `1`→Track Clear (green
  `#43b02a`), `2`→Yellow, `4`→Safety Car, `5`→Red (`#da291c`), `6`→Virtual SC, `7`→VSC Ending;
  falls back to raw `Message` then "Standby" so it never blanks on an unmapped code.
- Renders 4 `Stat` cards in `grid grid-cols-2 lg:grid-cols-4`: **Leader** (white), **Fastest Lap**
  (purple `#b45cff`, sub = TLA), **Fastest Pace** (teal `#2dd4bf`, sub = `${tla} · last lap`),
  **Track Status** (flag colour). Each card = coloured spine + eyebrow + value + subline.

**`frontend/src/live/TimingTower.tsx`** (rewritten) — new props `fastestLapDriver`,
`fastestPaceDriver` (racing numbers, so those cells tint to match the Session Bests bar).
- `TYRE_COLORS`: SOFT `#da291c`, MEDIUM `#ffd12e`, HARD `#f0f0f0`, INTERMEDIATE `#43b02a`, WET
  `#0067ad`.
- `TyreBadge({ compound, age })` — broadcast marker: a compound-coloured **ring** with the compound
  initial (S/M/H/I/W) in the same colour + `{age}L` beside it. Ring-not-disc keeps near-white HARD
  legible on the dark background. (This satisfies "mention the tyre type in their logo as the
  timing tower shows while broadcasting.")
- `sectorClass(sector)` — `OverallFastest`→`bg-[#b45cff]` (purple), `PersonalFastest`→emerald, else
  white. **Keys off the booleans only**, never the undecoded per-segment Status codes (locked
  decision #4 in the prior handoff).
- `ROW_GRID` shared column template. Columns: **POS / DRIVER** (team-colour bar + TLA + PIT/OUT
  badges + team name) **/ TYRE / STP** (`pit_count`) **/ GAP** (`gap_to_leader` + interval, teal if
  catching) **/ LAST** (teal if fastest pace) **/ SECTORS** (3 pills) **/ BEST** (purple if fastest
  lap). Retired rows are dimmed (`opacity-40`) and get an "OUT" badge; in-pit rows get a "PIT" badge.
- Wrapped `overflow-x-auto` + `min-w-[40rem]`; inner scroller `max-h-[720px] overflow-y-auto`.

**`frontend/src/live/LiveDashboard.tsx`** (rewritten) —
- `bests = useMemo(() => computeSessionBests(snapshot.timing, snapshot.drivers), …)`.
- `leaderTla` = TLA of the driver whose `position === "1"` (derived, not tracked).
- Layout: hero header → `<SessionBests>` → `grid lg:grid-cols-12` with `<TimingTower>` in
  `col-span-8` (passed `fastestLapDriver`/`fastestPaceDriver`) and a `col-span-4` right rail
  (`<TrackMap>` + `<RaceControlFeed>`) → full-width `<div id="telemetry"><DriverTelemetryPanel/></div>`.

**Unchanged, already committed earlier in the plan** (do not rewrite):
`TrackMap.tsx` (team-colour dots, **expand-only bounds ref** so the map doesn't jitter),
`RaceControlFeed.tsx`, `DriverTelemetryPanel.tsx`, `ui/CircularGauge.tsx`, `useLiveTimingSocket.ts`,
`types.ts`.

**Logo files** (committed in `c5ba827`): `frontend/src/App.tsx` (`F1Logo` SVG, ~line 611),
`frontend/index.html` (title/description), `frontend/public/favicon.svg` (same mark).

---

## 5. Backend already provides every live field (no backend change was needed)

Confirmed by reading `backend/livetiming/state.py` `_derive_timing` / snapshot projections. The UI
consumes these snake_case fields; all are present:

| UI element | Backend field(s) |
|---|---|
| Tyre compound / new / age | `tyre_compound`, `tyre_is_new`, `stint_laps` (from `TimingAppData` `Stints[last]` `Compound`/`New`/`TotalLaps`) |
| Pit-stop count | `pit_count` (`NumberOfPitStops`) |
| Gap / interval / catching | `gap_to_leader`, `interval`, `catching` |
| Sectors (purple/green) | `sectors: [{ Value, OverallFastest, PersonalFastest }]` |
| Last / best lap | `last_lap.Value`, `best_lap.Value` |
| Personal best (fallback) | `personal_best_lap.Value` (from `TimingStats`) |
| Pit / retired state | `in_pit`, `retired` |
| Track-map dots | `positions[num] {X,Y}` + `drivers[num].team_colour` (bare hex, no `#` from feed) |
| Telemetry | `telemetry` channels `rpm/speed/gear/throttle/brake/drs` (`CarData.z`) |
| Track status flag | `track_status {Status, Message}` |

Fastest Lap and Fastest Pace are **view-layer aggregations** (`computeSessionBests`), consistent
with the SSOT principle "derive, don't store" — the backend deliberately does not compute them.

---

## 6. Design system in play (mkbhd theme)

Tokens (`tailwind.config.js` + `src/index.css`): `mkbhd-black` `#0a0a0a`, `mkbhd-studio` `#141414`,
`mkbhd-red` `#cc0000`, `mkbhd-gray` `#a3a3a3`, `rounded-mkbhd`; utility classes `.mkbhd-card`,
`.mkbhd-btn-primary`, `.studio-header`, `.custom-scrollbar`. Type is Inter; headings are
`font-black italic uppercase tracking-tighter`. New live components use these — no bespoke colours
except the semantic accents below.

Semantic colours (must stay consistent across the timing tower and the Session Bests bar):
- Tyre compounds — the `TYRE_COLORS` map in §4.
- **Purple `#b45cff`** = overall/session fastest (sectors + fastest-lap cell + Fastest Lap card).
- **Emerald** (`emerald-500`) = personal best sector.
- **Teal `#2dd4bf`** = fastest current pace (last-lap cell + Fastest Pace card).

---

## 7. Offline-preview setup (why the demo fixture exists)

The real feed at `livetiming.formula1.com/signalrcore` only carries data **during a race weekend**.
To verify the live UI offline, this session built a rich demo fixture and wired a replay path.

- **`backend/fixtures/live_demo.jsonl`** (10 records, ~10 drivers: VER NOR PIA LEC HAM RUS SAI ALO
  GAS TSU) — real teams/colours, varied compounds (S/M/H/I), tyre ages, pit counts, last/best laps.
  VER holds an OverallFastest S1; NOR has the session-fastest best (`1:15.870`) and fastest pace;
  ALO is in-pit; TSU is retired. `CarData.z`/`Position.z` are base64 raw-deflate (`zlib.compressobj
  (9, DEFLATED, -MAX_WBITS)`). This is the format `recorder.py`/`replay_fixture` consume:
  `{"topic","payload","timestamp"}` per line, `.z` payloads stored as raw base64.
- The throwaway generator (`backend/_gen_demo.py`) has been **deleted** per the user's choice; the
  fixture is now a self-contained committed artifact.
- **`.claude/launch.json`** has two preview configs:
  - `frontend` → `npm --prefix frontend run dev`, port 5173
  - `backend` → `bash -c 'cd backend && LIVETIMING_REPLAY=fixtures/live_demo.jsonl venv/bin/python main.py'`, port 8000
- Env flags (from the plan): `LIVETIMING_AUTOSTART` (default on; `0` to stop dialling F1 — set in
  `conftest.py`), `LIVETIMING_REPLAY` (fixture path → replays through the real pipeline).

---

## 8. How to run & verify — sandbox constraints (important)

**The sandboxed `Bash` tool CANNOT bind listening sockets** ("operation not permitted") and cannot
reach `localhost` (network allowlist = `agentrouter.org` + `api.anthropic.com` only). So:

- **Do NOT run `./run-dashboard.sh` from the Bash tool** — it backgrounds `main.py` + `vite` on
  ports 8000/5173, which the sandbox blocks. Either the **user** runs it in a real terminal, or use
  the **preview system**, which *can* bind ports:
  - `preview_start` with name `backend`, then name `frontend` (from `.claude/launch.json`).
  - Verify backend via `preview_eval` fetch of `/api/status` (`is_live:true`) or `preview_logs`.
- **`run-dashboard.sh` does NOT set `LIVETIMING_REPLAY`** — it dials the *live* feed, which is empty
  outside a race weekend. For a populated offline view, export
  `LIVETIMING_REPLAY=fixtures/live_demo.jsonl` before starting the backend, or use the preview
  `backend` config (which already bakes it in). Usage: `./run-dashboard.sh {start|stop|restart}`;
  logs to `backend.log` / `frontend.log`.

**Screenshot quirk (known, harmless):** `preview_screenshot` after a *programmatic* scroll can
render lower page regions solid black — a compositor limitation, not a UI bug. The DOM is
authoritative (`preview_eval` / `preview_snapshot` / `preview_inspect`). **Workaround that works:**
set a tall viewport (`preview_resize 1440×2300`) and screenshot at scroll 0 — the whole page
captures cleanly. This is how the full-page verification was done.

Verification commands (run from `frontend/`, both green as of this session):

```bash
npx tsc -b tsconfig.app.json --force   # clean
npx vitest run                          # 13 passed
```

---

## 9. How to resume (ordered)

1. **Commit 3 — scaffolding** (approved): stage exactly
   `backend/fixtures/live_demo.jsonl` and `.claude/launch.json` (never the whole `.claude/`), commit
   as `chore: …`. See §1 for the exact command.
2. **Optional doc/scaffolding commits** — reasonable to commit (confirm with user if unsure):
   `docs/superpowers/plans/2026-08-17-live-timing-signalr.md`, `docs/superpowers/handoffs/*`,
   `frontend/.gitignore`, `frontend/README.md`. **Leave `.serena/` untracked** (tool cache).
3. **`superpowers:finishing-a-development-branch`** — verify tests, then present the finish options.
   Work-on-`main` was consented, so "stay on main" is the likely path (no PR expected for a personal
   repo) — but let the skill drive and let the user choose.
4. **Design request 3 (final)** — start the app for the user to click through: either they run
   `./run-dashboard.sh start` in their terminal, or use the preview system. For a populated live
   view offline, use `LIVETIMING_REPLAY=fixtures/live_demo.jsonl`.

---

## 10. Session constraints currently in force

- **Ultracode is ON** for this session — workflows/subagents are *encouraged* for substantive tasks.
  (This **supersedes** the prior 08-17 handoff's "do not spawn subagents / no workflows" note.)
  Exception: pure synthesis-of-own-context tasks like *writing this doc* are correctly done solo —
  subagents don't share the session's conversation context.
- **Work directly on `main`** — consent already given; per-task commits.
- **Commit hygiene:** explicit-path staging only, **never `git add -A`**; never commit
  `.claude/settings.local.json`, secrets, PII, or throwaways; commit messages end with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Personal repo, branch `main`. Glance `CLAUDE.md` conventions (master/gitjoin/JIRA) do **not** apply.

### Original design requests (verbatim) — all satisfied except the literal run-dashboard test
- "Make sure the design is smooth and sophisticated, don't hesitate to inspire from other places but
  follow the design theme."
- "Replace the logo with actual f1 logo (with a touch of this application's context) and use the
  same for browser tab logo." / "Make the logo almost similar to f1's actual logo but be aware of
  copy write strike."
- Live session per driver: current tyre, #pitstops, tyre age, team-colour dot on track, lap timings
  with individual sectors, **fastest lap separately**, **fastest pace separately**, "check with
  backend if these values are provided."
- "Mention the tyre type in their respective logo as actual timetower shows while broadcasting."
- "After all the tasks are done, use @run-dashboard.sh to start both front-end and back-end and use
  the output to launch the front-end in the local browser to test it."

---

## 11. Risks / gotchas carried forward

- **Demo fixture positions are a simple ellipse**, not a real circuit — the track map looks sparse
  with the fixture. Real `Position.z` traces the actual track; this is a fixture artifact, not a bug.
- **`.claude/launch.json` backend config hardcodes `venv/bin/python`** — fine on this machine; a
  fresh clone without `backend/venv` would need it created first (the prior handoff notes
  `python3 -m venv <dir>` works but `-q` fails on this Mac).
- **Live feed is unofficial / ToS gray-area** and F1 reshapes it without notice (per-topic
  fail-soft decoding is the mitigation). Sector per-segment Status codes remain undecoded — coloring
  intentionally uses only the `OverallFastest`/`PersonalFastest` booleans.
- Backend protocol details (negotiate handshake, `\x1e` framing, index-keyed-dict delta merge, `.z`
  raw-deflate) live in the **08-17 handoff** — consult it, not this doc, for feed internals.
