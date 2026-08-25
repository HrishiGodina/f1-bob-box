# Context Transfer — Live-Timing Shipped; Offline-Toggle Investigation Open

**Date:** 2026-08-26
**Supersedes:** `2026-08-25-live-session-design-polish-context-transfer.md` (that doc predates the
push and is stale on git/test state — read this one).
**Backend protocol reference:** `2026-08-17-live-timing-signalr-context-transfer.md` (SignalR
handshake, `\x1e` framing, delta-merge, `.z` raw-deflate). Still authoritative for feed internals.
**Repo:** `~/Developer/Personal/f1-dashboard` — branch `main`, personal repo (Glance
`master`/`gitjoin`/JIRA conventions do NOT apply).

---

## 1. Status: the plan is DONE and PUSHED

The 12-task SignalR live-timing plan, the logo work, and the live-session redesign are all
complete, committed, and pushed to `origin/main` by the user. Nothing from the plan is outstanding.

| Gate | State |
|---|---|
| 12-task live-timing plan | Complete, committed, pushed |
| Frontend typecheck (`npx tsc -b tsconfig.app.json --force`) | Clean |
| Frontend tests (`npx vitest run`) | 13/13 pass |
| Backend tests (`venv/bin/python -m pytest -q`) | 57/57 pass |
| Push to `origin/main` | Done (by the user, from their own terminal) |
| Working tree | Clean except `.serena/` (tool cache — leave untracked) |

Commits from the design-polish session, oldest first:

| SHA | Subject |
|---|---|
| `c5ba827` | feat: add trademark-safe F1 speed-mark logo and tab branding |
| `e2be711` | feat: redesign live session with tyres, sectors, and session bests |
| `b866771` | chore: add offline live-timing demo fixture and preview launch config |
| `6f6fe75` | chore: track frontend gitignore and readme scaffolding |
| `1be200d` | docs: add live-timing plan and session handoff notes |
| `ac847f9` | test: align circuit available_years assertions with current 2026 season |

---

## 2. OPEN ITEM: the "offline toggle" is not a toggle (root cause found, fix NOT started)

User report: "the offline toggle button is not working."

**Root cause (confirmed by reading the code, not inferred):** there is no toggle. The
`OFFLINE` / `LIVE SESSION` pill at `frontend/src/App.tsx:751-757` is a **read-only status
indicator** — a `<motion.div>` with no `onClick`, no `cursor-pointer`, and no button semantics.
Clicking it has never done anything.

Evidence chain:
- `grep -rn -i "toggle" frontend/src/` returns **nothing** — no toggle exists anywhere.
- The pill's label is purely derived: `status?.is_live ? 'LIVE SESSION' : 'OFFLINE'`.
- `status` comes from polling `GET /api/status` every 30s (`App.tsx:654-679`).
- Backend owns `is_live` entirely — `backend/livetiming/state.py:138-143`: connection
  `== "connected"` AND session status not in `("Finalised","Ends")` AND
  `seconds_since_last_message() < 120`.
- **No route can change the mode.** All 8 backend routes are read-only data endpoints; live-vs-
  replay is fixed at process start by the `LIVETIMING_REPLAY` env var (`backend/main.py:55-58`).

Why it reads as a control: it's a rounded pill with a status dot, it pulses when live, and it sits
in the nav directly beside a real `<button>` (the mobile-menu trigger). Classic false affordance.

**Decision still needed before any code** — what should the toggle actually do?
- **A. Backend mode-control endpoint** (recommended): e.g. `POST /api/live/replay` to start/stop
  the replay loop at runtime. Keeps the backend as SSOT, exercises the real `/ws/live` pipeline,
  no fixture duplication. Must be gated to dev-only (a production mode-switch endpoint is a
  control-plane risk). Cost: new endpoint + background-task lifecycle management.
- **B. Frontend-only demo mode**: bundle a demo snapshot in the frontend and let the toggle render
  it with no backend. Good for offline design review; cost is a duplicated fixture that can drift.
- **C. Remove the false affordance**: make it explicitly a status indicator (no pointer cursor,
  `aria-live` for announcements) and leave mode env-driven. Cheapest and most honest, but no toggle.

Nothing has been implemented — the brainstorming approval gate has not been passed.

### Secondary finding (minor, not fixed)
Nav items `Telemetry` and `Standings` both scroll to `#standings` (`App.tsx:735-738`); `Analytics`
→ `#archive`. All three ids exist (lines 842/915/938) so the nav works, but those ids live **only
in the idle branch**, so nav clicks silently no-op while a live session is rendering.

---

## 3. Credentials — action item for the user

`origin` had a GitHub PAT embedded in cleartext in `.git/config`
(`https://USER:ghp_…@github.com/...`). Two different `ghp_…` tokens were exposed in session chat
and must be treated as **compromised**.

- The token was never in a tracked/committed file (`git grep ghp_` finds nothing).
- This sandbox **cannot** write `.git/config` or `~/.gitconfig` (`Operation not permitted`), so the
  remote could not be scrubbed nor a credential helper set from here. The user pushed themselves.
- **Still to do (user, in their own terminal):** revoke both tokens on GitHub, issue one fresh PAT,
  then de-token the remote and use the Keychain:
  ```bash
  git remote set-url origin https://github.com/HrishiGodina/f1-bob-box.git
  git config --global credential.helper osxkeychain
  ```
  Avoid `credential.helper store` — it writes the token to `~/.git-credentials` in plaintext.
- Verify with `git remote -v` that no `ghp_` remains before sharing terminal output again.

---

## 4. Environment constraints (these bite every session)

- **Bash cannot bind listening sockets** and **cannot reach the network** beyond
  `agentrouter.org` + `api.anthropic.com`. A `git push` from the tool fails with
  `CONNECT tunnel failed, response 403`; `github.com` is unreachable. Pushes are the user's job.
- **Do NOT run `./run-dashboard.sh` from the Bash tool** — it backgrounds uvicorn + vite on
  8000/5173, which the sandbox blocks. Use the **preview system**, which can bind ports:
  `.claude/launch.json` defines `frontend` (5173) and `backend` (8000, with
  `LIVETIMING_REPLAY=fixtures/live_demo.jsonl` baked in).
- `run-dashboard.sh` does **not** set `LIVETIMING_REPLAY`, so it dials the real F1 feed, which is
  empty outside a race weekend. Export the fixture path for a populated offline view.
- **Preview screenshot quirk:** after a programmatic scroll, `preview_screenshot` can return solid
  black for lower page regions (compositor timing, not a UI bug). Workaround: resize the viewport
  tall (e.g. 1440x2300) and capture at scroll 0; treat DOM inspection (`preview_eval`) as
  authoritative.
- Backend venv is at `backend/venv` (`venv/bin/python`); tests run from `backend/`.

---

## 5. Test-suite gotcha worth knowing

`backend/test_circuit_history.py` is **date-sensitive**. `GET /api/circuit/{id}` spans
`available_years` through the current season (`main.py:449`, `range(start, current_season + 1)`),
and `current_season` is hardcoded to `2026`. When the calendar rolled into 2026 the integration
test's `assert 2026 not in available_years` began failing; per the user's decision the *test* was
updated (`ac847f9`) to expect 2026 present and last.

**Residual inconsistency, deliberately left:** the two sibling *unit* tests
(`test_available_years_known_circuit`, `test_available_years_unknown_circuit`) still model
completed-seasons-only (`range(start, CURRENT_SEASON)` with `assert CURRENT_SEASON not in years`).
All 57 tests pass, but the suite now documents two opposite intents about whether an in-progress
season belongs in a circuit's history. Reconcile if that product question is ever settled.

---

## 6. How to resume

1. **Get the toggle decision** (§2, options A/B/C), then implement behind the brainstorming
   approval gate. TDD applies — `frontend/src/live/liveState.test.ts` is the existing test bed.
2. **Optional visual pass** — the `run-dashboard.sh` / preview launch to click through the live
   session. Every live feature was already verified rendering (tyre badges with compound colours,
   tyre age, pit counts, 3 sector pills with purple/green coding, team-colour track dots, Fastest
   Lap + Fastest Pace called out separately, telemetry on row click, PIT/OUT badges).
3. **Nudge the user on credential rotation** (§3) if not yet done.
4. A "new live feature" brainstorm was requested and then pre-empted by this bug report — it was
   at the classification step (leaning *bounded*; anything trend-over-time is *architectural*
   because the backend keeps only the latest snapshot, no history).

## 7. Design constraints that must hold

- mkbhd theme tokens: `mkbhd-black #0a0a0a`, `mkbhd-studio #141414`, `mkbhd-red #cc0000`,
  `mkbhd-gray #a3a3a3`; Inter; headings `font-black italic uppercase tracking-tighter`.
- Semantic colours, consistent across timing tower and Session Bests: tyres SOFT `#da291c` /
  MEDIUM `#ffd12e` / HARD `#f0f0f0` / INTER `#43b02a` / WET `#0067ad`; **purple `#b45cff`** =
  session fastest; emerald = personal best; **teal `#2dd4bf`** = fastest pace.
- Sector colouring keys off the `OverallFastest` / `PersonalFastest` booleans only — never the
  undecoded per-segment Status codes.
- Fastest lap/pace are **derived on read** (`computeSessionBests`), never stored — backend stays SSOT.
- The logo is a deliberate non-reproduction of the trademarked F1 mark; keep the disclaiming
  comment in `App.tsx` if the logo is touched.
