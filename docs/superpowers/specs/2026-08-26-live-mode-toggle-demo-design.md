# Design — Live/Offline Toggle + Simulated-Live Demo Mode

**Date:** 2026-08-26
**Status:** Approved design, spec pending user review. No code written.
**Scope of this spec:** Phase 1 (live/offline toggle) + Phase 2 (moving demo mode).
Phase 3 (historic race mode) is specified only as a deferred follow-on with its prerequisites.
**Related:** `2026-08-14-live-timing-signalr-design.md` (the live feed this builds on),
`docs/superpowers/handoffs/2026-08-26-live-timing-shipped-context-transfer.md` (current state).

---

## 1. Problem

The `OFFLINE` / `LIVE SESSION` pill in the nav reads as a control but is a read-only
`<motion.div>` with no `onClick`, no `cursor-pointer`, and no button semantics
(`frontend/src/App.tsx:751-757`). Clicking it has never done anything — a false affordance.

Two real needs sit behind that click:

1. **Enter/leave live mode on demand**, instead of waiting for the backend's 30-second
   `is_live` poll to decide for you.
2. **See the live dashboard alive when no race is running** — today the only way is to restart
   the backend with `LIVETIMING_REPLAY` set, and even then the fixture is a single static frame
   that never moves.

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audience | **Both, with a clear line** | Toggle + labelled demo ship publicly; switching the *server's* real feed stays dev-only behind an env flag (deferred to Phase 3). |
| Disagreement between toggle and reality | **Honest empty state** | The toggle controls the connection. LIVE with no session shows an explicit "No live session — start a demo?" panel. Never silently substitute fake data for real. |
| Sequencing | **Phased**: toggle → moving demo → historic | Value at each step; nothing ships that lies. |
| Demo data location | **Client-side** | No server mutation, so it is safe to expose publicly and works with the backend down. |
| Demo persistence | **Session-only** | A persisted demo could silently mislead on a later visit. |
| Override persistence | **Persisted** (`localStorage`) | The nav logo calls `window.location.reload()` (`App.tsx:723`), which would otherwise wipe the choice immediately. |

## 3. Evidence base

Findings from the 2026-08-26 read-only research pass that constrain this design. Each is
load-bearing; do not "simplify" past them without re-checking.

1. **The live path is exactly one API.** Every live component is pure-props; no `axios`/`fetch`
   anywhere in `frontend/src/live/`. The `/ws/live` socket opens *solely* because `LiveDashboard`
   mounts (`useLiveTimingSocket.ts:25-60` — empty dep array, no `enabled` input, 3s auto-reconnect,
   teardown only via effect cleanup). Gating the mount gates the entire live path.
2. **`status` is replaced wholesale every poll** (`App.tsx:656-657`), so any new flag co-located
   in that object would be clobbered every 30 seconds. New state must live outside it.
3. **Only two behavioural uses of `is_live`** exist in the frontend: the render branch
   (`App.tsx:777`) and the pill (`App.tsx:751-756`).
4. **`/ws/live` has no liveness guard** (`backend/main.py:90-99`): it accepts and sends a full
   snapshot unconditionally, so a client that forces live mode receives a valid-but-empty snapshot
   rather than an error. This is what makes the honest-empty-state approach cheap.
5. **The existing demo fixture does not move.** All 10 records share one timestamp;
   `replay_fixture` never reads `timestamp` and never sleeps (`recorder.py:50-53`); the only delay
   is 5s between whole-file loops (`main.py:27`). Its `Position.z` is a synthetic radius-3000
   circle, not a circuit. Looping re-applies identical state.
6. **No production path records a real session** — `record_topic` appears only in `recorder.py`
   and its tests.
7. **Zero client-side persistence exists today** — no `localStorage`/`sessionStorage`/URL params
   anywhere in `frontend/src`. This design introduces the first such pattern.
8. **vitest runs node-env (no jsdom)**, so all new logic must be extracted as pure functions to be
   testable. Components stay pure-props.

## 4. State model

Two pieces of state, both outside the polled `status` object:

```ts
liveOverride: null | 'live' | 'off'   // user intent; null = auto. Persisted (localStorage).
demoActive:   boolean                 // session-only, meaningful only inside live view

effectiveLive = liveOverride ?? backendIsLive
```

`null` is the default so today's behaviour is preserved: a real session still auto-appears for a
first-time visitor. The first click pins intent, and the pinned value wins over the backend poll.

When `liveOverride !== null`, a small **AUTO** chip appears beside the pill to un-pin (set back to
`null`), so an override is never a trap the user cannot escape.

`localStorage` access is wrapped in `try/catch` — it throws in private-browsing contexts — and any
failure falls back to `null` (auto) without breaking render.

## 5. Components and files

| File | Change |
|---|---|
| `frontend/src/App.tsx:751-757` | Pill `motion.div` → real `<button>`: `aria-pressed`, visible focus ring, `cursor-pointer`, keyboard-activatable. Add the AUTO reset chip, rendered only when overridden. |
| `frontend/src/App.tsx:777` | Branch on `effectiveLive` rather than `status?.is_live`. |
| `frontend/src/live/liveView.ts` **(new)** | Pure logic: `resolveLiveView(override, backendIsLive)`, `loadOverride()`, `saveOverride(v)`, `shouldShowNoSessionPanel(...)`. |
| `frontend/src/live/useLiveSnapshot.ts` **(new)** | Chooses the snapshot source: socket or demo player. `LiveDashboard` keeps consuming a single snapshot. |
| `frontend/src/live/useLiveTimingSocket.ts` | Accept `enabled: boolean` so the socket can be held closed without unmounting the dashboard. Preserve the existing `stopped` flag semantics so a disabled socket does not reconnect. |
| `frontend/src/live/demo/timeline.ts` + `timeline.json` **(new)** | The demo timeline plus a pure `frameAt(timeline, tMs)` player. |
| `frontend/src/live/LiveDashboard.tsx` | Demo switch in the header, persistent DEMO badge while active, and the no-session panel. |

Naming, theme tokens, and semantic colours follow the existing live components exactly
(mkbhd tokens; purple `#b45cff` session-fastest, emerald personal-best, teal `#2dd4bf` fastest
pace; tyre compound colours as in `TimingTower.tsx`).

## 6. Data flow

Unchanged in shape: **one reducer, one snapshot**. `applyLivePatch` remains the single merge point.
The demo player feeds *that same reducer* rather than a parallel rendering path, so demo and real
modes exercise identical component code — a demo that renders correctly proves the real path
renders correctly.

```
backend /ws/live ──┐
                   ├─► applyLivePatch ─► snapshot ─► LiveDashboard ─► (pure-props components)
demo timeline  ────┘
```

The `enabled` flag on the socket exists for one specific reason: in demo mode `LiveDashboard` stays
**mounted** while the real socket must stay **closed**. Per evidence item 1, mounting alone opens
`/ws/live`, so without an explicit `enabled` the demo would sit on top of a live connection.

The backend stays SSOT for real data. Demo data is viewer-local synthetic data and never touches
the server, which is what makes it safe to ship publicly.

The demo timeline is authored **with motion** — positions advancing, lap times ticking, sectors
flipping purple/green, a pit stop, a compound change — because evidence item 5 shows a static
frame does not read as live.

## 7. UX states

| Condition | Behaviour |
|---|---|
| LIVE + real + backend live | Normal live dashboard (today's behaviour) |
| OFFLINE pinned while a real session **is** live | Idle dashboard, socket closed. A real session does not yank you back — that is the point of pinning. The AUTO chip stays visible to rejoin. |
| LIVE + real + backend **not** live | Explicit panel: "No live session" + *Start demo* button. No silent fake data. |
| LIVE + real + socket dropped | Existing 3s reconnect plus the visible reconnecting notice |
| Demo active | Persistent **DEMO — SIMULATED DATA** badge so no viewer mistakes it for real racing |
| Demo timeline fails to load | Error message inside the panel — never a blank dashboard |
| `localStorage` unavailable/throws | Fall back to auto silently; render must not crash |
| Override pinned | AUTO chip visible next to the pill to return to auto |

Accessibility: the pill becomes a real `<button>` with `aria-pressed` reflecting live state, a
visible focus ring, and keyboard activation. The demo switch and AUTO chip are likewise real,
labelled controls.

## 8. Testing strategy

vitest is node-env, so logic is tested directly and components stay pure-props (evidence item 8).
New tests join the existing bed in `frontend/src/live/` (13 tests today, all must stay green):

- `resolveLiveView` truth table: every combination of `override` × `backendIsLive`.
- Override persistence round-trip, **including the throwing-storage path** (private mode) which
  must yield auto rather than an exception.
- `frameAt(timeline, tMs)`: frame selection, advancement, and loop wraparound.
- `shouldShowNoSessionPanel`: true only when live+real with no session; false in demo.
- A demo-timeline shape assertion so the fixture cannot drift from `LivePatch`/snapshot types.

Verification gates for the implementation: `npx tsc -b tsconfig.app.json --force` clean and
`npx vitest run` green; `backend/venv/bin/python -m pytest -q` unaffected (57 tests, no backend
change in this phase).

## 9. Scope boundary

**In scope:** Phase 1 (toggle, override state, accessible button, AUTO chip, honest empty state)
and Phase 2 (client-side moving demo timeline, demo switch, DEMO badge). One implementation plan.

**Explicitly out of scope here — Phase 3, deferred to its own spec.** It is blocked on
prerequisites rather than effort:

- **Type change:** distinguish *unknown* from *absent*. `frontend/src/live/types.ts` currently uses
  `| null` for both, so a value with no source renders as a confident, authoritative cell.
- **Two honesty fixes the UI needs first:** `DriverTelemetryPanel` defaults every channel `?? 0`,
  rendering an authoritative "0 KM/H" and a 10rem "0" gear; and `{line.gap_to_leader || "LEADER"}`
  in `TimingTower.tsx` prints the literal word LEADER on **every** row when gaps are absent.
- **Data reality:** sector times and tyre compound/age have **no available source** — never
  fetched, absent from the entire git history, obtainable only from SignalR `TimingData` /
  `TimingAppData`. Telemetry and track X/Y *are* recoverable via OpenF1 `/car_data` and `/location`
  (session-key addressed, and `backend/main.py:116-118` documents that free/historical data works
  unauthenticated), but only for **2023+** and only the **24 circuits** in
  `CIRCUIT_OPENF1_SHORT_NAME`. A historic mode must therefore label partial data as partial.
- **Dev-only server feed switch**, deferred with Phase 3. It is not safely buildable today: the
  `client` and `background_task` handles are **lifespan locals** (`backend/main.py:52-53`),
  unreachable from any route; and cancellation leaves `is_live()` **stale-true** because
  `backend/livetiming/client.py:143-147` re-raises on `CancelledError` before
  `_emit_status("disconnected")`, while `_run_replay_loop` has no `try/finally`. Prerequisites:
  hoist the handles to `app.state`, add `try/finally`, add a `LiveSessionState` reset, fix the
  status leak — then add an env-gated endpoint.

**Non-goals:** recording real sessions; changing the SignalR protocol handling; touching the idle
dashboard's content; any change to backend behaviour in Phases 1-2.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A viewer mistakes demo data for real racing | Persistent DEMO badge; demo is session-only; never auto-entered without an explicit click |
| Demo timeline drifts from the real snapshot shape | Timeline is typed against `LivePatch`/snapshot types and asserted in a test |
| Socket left open or double-connecting when toggling | `enabled` flag threaded through the existing `stopped` semantics; teardown asserted by test |
| Override traps the user in the wrong view | AUTO chip always available to un-pin |
| `localStorage` throws (private mode) | `try/catch` with auto fallback, covered by a test |
| First client-persistence pattern in the codebase | Confined to `liveView.ts` behind `loadOverride`/`saveOverride` so the pattern has one home |

## 11. Latent bugs found during research (separate from this work)

Neither is caught by the currently-green suites. Not fixed in this spec; recorded so they are not lost:

1. `backend/livetiming/client.py:143-147` — `except asyncio.CancelledError: raise` runs *before*
   `await self._emit_status("disconnected")`, so a cancelled client leaves `connection_status`
   stale at `"connected"` and `is_live()` reporting true.
2. `frontend/src/App.tsx:660` — the `idleData.driver_standings.length === 0` guard reads a stale
   closure, so `/api/idle-data` refetches every 30 seconds forever instead of once. `/api/status`
   and `/api/idle-data` also keep polling during live mode, ungated.
