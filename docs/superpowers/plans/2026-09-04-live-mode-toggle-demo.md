# Live/Offline Toggle + Simulated-Live Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the nav's `OFFLINE`/`LIVE SESSION` pill into a real, persisted live/offline toggle with an honest empty state, add a client-side moving demo mode so the live dashboard can be previewed without a real session, and fix three separately-diagnosed latent bugs found during the design research for this feature.

**Architecture:** All new logic is pure, dependency-injected functions (`liveView.ts`, `demo/timeline.ts`) so it is testable under vitest's node environment (no jsdom in this repo). Components stay pure-props. The demo player feeds the *same* `applyLivePatch` reducer the real socket uses, so demo and real data exercise identical rendering code — nothing new to visually re-verify beyond "does demo data flow through."

**Tech Stack:** React 19 + TypeScript (frontend), FastAPI + `websockets`/`httpx` (backend), vitest (frontend tests, node environment), pytest + `respx` (backend tests, `asyncio_mode = auto`).

**Spec:** `docs/superpowers/specs/2026-08-26-live-mode-toggle-demo-design.md`

## Global Constraints

- `liveOverride` is `null | 'live' | 'off'`; `null` (auto) must remain the default so a real session still auto-appears for a first-time visitor (spec §4).
- `effectiveLive = liveOverride ?? backendIsLive`, computed via `resolveLiveView`, not inlined (spec §4).
- `liveOverride` is persisted to `localStorage`; `demoActive` is session-only, in-memory (spec §2).
- All `localStorage` access is wrapped in `try/catch` and falls back to `null` (auto) on any throw — never crashes render (spec §4, §10).
- Demo data is 100% client-side; it must never call the backend or mutate server state (spec §2, §6).
- The demo player must feed the existing `applyLivePatch` reducer — no parallel rendering path (spec §6).
- `LiveDashboard` must stay **mounted** in demo mode while the real socket stays **closed**; this is exactly what `useLiveTimingSocket`'s new `enabled` flag is for (spec §6).
- LIVE + real + backend not live → explicit "No live session" panel, never silent fake data (spec §2, §7).
- Demo active → a persistent **DEMO — SIMULATED DATA** badge, always visible while demo runs (spec §7).
- The pill becomes a real `<button>` with `aria-pressed`, a visible focus ring, and keyboard activation; the AUTO chip and demo switch are likewise real, labelled controls (spec §7).
- vitest runs node-env (no jsdom) — all new logic must be pure/testable without `window`/DOM; anything touching `localStorage` must take the storage as an injected parameter (spec §3 evidence item 8).
- Verification gates: `npx tsc -b tsconfig.app.json --force` clean, `npx vitest run` green (13 existing + new tests), `backend/venv/bin/python -m pytest -q` green (57 existing + 1 new test).
- Explicitly **out of scope**: Phase 3 (historic mode) and the dev-only backend feed-switch endpoint (spec §9) — do not touch `backend/main.py`'s lifespan-local `client`/`background_task` handles, and do not change `frontend/src/live/types.ts`'s `| null` semantics.

---

## File Structure

| File | Change |
|---|---|
| `backend/livetiming/client.py` | Fix: emit `"disconnected"` status before re-raising `CancelledError` (Task 1). |
| `backend/test_livetiming_client.py` | New regression test for Task 1. |
| `frontend/src/App.tsx` | Fix stale-closure idle-data refetch (Task 2); fix Telemetry nav anchor (Task 3); wire toggle button + AUTO chip + `effectiveLive` (Task 5). |
| `frontend/src/live/liveView.ts` **(new)** | Pure logic: `resolveLiveView`, `loadOverride`/`saveOverride` (storage-injected), `shouldShowNoSessionPanel` (Task 4). |
| `frontend/src/live/liveView.test.ts` **(new)** | Tests for the above (Task 4). |
| `frontend/src/live/useLiveTimingSocket.ts` | Add `enabled: boolean` param; socket stays closed when disabled (Task 6). |
| `frontend/src/live/demo/timeline.json` **(new)** | Authored demo data: 4 drivers, 4 frames, 20s loop, with motion (Task 7). |
| `frontend/src/live/demo/timeline.ts` **(new)** | Types + `frameAt(timeline, tMs)` pure player (Task 7). |
| `frontend/src/live/demo/timeline.test.ts` **(new)** | Shape assertion + `frameAt` frame/advance/loop tests (Task 7). |
| `frontend/tsconfig.app.json` | Add `resolveJsonModule: true` so `timeline.json` type-checks (Task 7). |
| `frontend/src/live/useLiveSnapshot.ts` **(new)** | Chooses socket vs. demo player as the snapshot source (Task 8). |
| `frontend/src/live/LiveDashboard.tsx` | Demo switch, DEMO badge, no-session panel, swap to `useLiveSnapshot` (Task 9). |

---

### Task 1: Backend — fix `CancelledError` status-emit ordering

**Files:**
- Modify: `backend/livetiming/client.py:143-144` (the `run()` method's `except asyncio.CancelledError:` branch)
- Test: `backend/test_livetiming_client.py`

**Interfaces:**
- Consumes: `LiveTimingClient(state, on_patch, ws_connect_fn=...)` (existing constructor, unchanged), `client.run()` (existing method, unchanged signature).
- Produces: no new public interface — this is a pure bug fix to existing behaviour. `LiveTimingClient._emit_status("disconnected")` is now guaranteed to fire before a `CancelledError` propagates out of `run()`.

- [ ] **Step 1: Write the failing test**

Add to `backend/test_livetiming_client.py` (also add `import asyncio` at the top of the file, alongside the existing `import os`/`import sys`):

```python
import asyncio
import os
import sys
```

Then append this test at the end of the file:

```python
@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_run_emits_disconnected_status_before_reraising_cancelled_error():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )

        class _CancellingConnect:
            def __call__(self, url, **kwargs):
                return self

            async def __aenter__(self):
                raise asyncio.CancelledError()

            async def __aexit__(self, *exc_info):
                return False

        statuses = []

        async def on_patch(patch):
            if "connection_status" in patch:
                statuses.append(patch["connection_status"])

        client = LiveTimingClient(LiveSessionState(), on_patch, ws_connect_fn=_CancellingConnect())

        with pytest.raises(asyncio.CancelledError):
            await client.run()

        assert statuses == ["connecting", "disconnected"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/bin/python -m pytest test_livetiming_client.py::test_run_emits_disconnected_status_before_reraising_cancelled_error -v`
Expected: FAIL — `assert statuses == ["connecting", "disconnected"]` fails because `statuses == ["connecting"]` (the `"disconnected"` emit never happens before the `CancelledError` propagates out of `run()`).

- [ ] **Step 3: Write minimal implementation**

In `backend/livetiming/client.py`, change the `run()` method's exception handling from:

```python
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - intentional: decision 5
                logger.warning("live-timing connection dropped: %s", exc)
            await self._emit_status("disconnected")
```

to:

```python
            except asyncio.CancelledError:
                await self._emit_status("disconnected")
                raise
            except Exception as exc:  # noqa: BLE001 - intentional: decision 5
                logger.warning("live-timing connection dropped: %s", exc)
            await self._emit_status("disconnected")
```

The final `await self._emit_status("disconnected")` line (previously line 147, now shifted by one) is unchanged and still fires for the `Exception` branch and the normal-return path — this only adds the missing emit to the `CancelledError` branch, before it re-raises and exits the function.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/bin/python -m pytest test_livetiming_client.py -v`
Expected: PASS — all tests in the file green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add backend/livetiming/client.py backend/test_livetiming_client.py
git commit -m "fix: emit disconnected status before re-raising CancelledError in live client" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — fix stale-closure idle-data refetch bug

**Files:**
- Modify: `frontend/src/App.tsx:1` (React import), `frontend/src/App.tsx:654-675` (`fetchStatus`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — internal `App` component behaviour only. No other task depends on this change.

No automated test: this fix lives inside the `App` component's closure and this repo's vitest suite is node-env with no jsdom (spec §3 evidence item 8) — `App.tsx` has zero existing test coverage and this plan does not introduce component testing infra. Verified manually in Task 10's browser check (Network tab: `/api/idle-data` should fire exactly once, not every 30s).

- [ ] **Step 1: Add `useRef` to the React import**

Change line 1 of `frontend/src/App.tsx` from:

```ts
import { useState, useEffect, useMemo } from 'react';
```

to:

```ts
import { useState, useEffect, useMemo, useRef } from 'react';
```

- [ ] **Step 2: Add the ref and fix the guard in `fetchStatus`**

Add a ref declaration immediately after the existing `useState` declarations (after the `mobileMenuOpen` line):

```ts
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const idleFetchedRef = useRef(false);
```

Then change `fetchStatus` from:

```ts
  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`);
      if (res.data) setStatus(res.data);
      
      // Always fetch idle data if it's empty or hasn't been fetched
      if (idleData.driver_standings.length === 0) {
        try {
          const [idleRes] = await Promise.all([ 
            axios.get(`${API_BASE}/idle-data`)
          ]);
          if (idleRes.data) setIdleData(idleRes.data);
        } catch (innerError) {
          console.error("Error fetching dashboard data:", innerError);
        }
      }
    } catch (e) { 
      console.error("Error fetching status:", e); 
    } finally { 
      setLoading(false); 
    }
  };
```

to:

```ts
  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`);
      if (res.data) setStatus(res.data);

      // Fetch idle data exactly once per page load, not on every 30s poll.
      if (!idleFetchedRef.current) {
        try {
          const [idleRes] = await Promise.all([ 
            axios.get(`${API_BASE}/idle-data`)
          ]);
          if (idleRes.data) {
            setIdleData(idleRes.data);
            idleFetchedRef.current = true;
          }
        } catch (innerError) {
          console.error("Error fetching dashboard data:", innerError);
        }
      }
    } catch (e) { 
      console.error("Error fetching status:", e); 
    } finally { 
      setLoading(false); 
    }
  };
```

The old guard read `idleData.driver_standings.length === 0` inside a closure captured once by the empty-dep-array `useEffect` — `idleData` there is always the *initial* empty array, so the guard never sees a later, populated `idleData` and refetches forever. `idleFetchedRef` is a mutable ref, so the closure always reads its current value.

- [ ] **Step 3: Verify no type errors**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean (no new errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "fix: stop idle-data endpoint refetching every 30s due to a stale closure" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — fix Telemetry nav anchor

**Files:**
- Modify: `frontend/src/App.tsx:734-739` (the nav items array)

**Interfaces:**
- Consumes: `id="telemetry"`, which already exists in `frontend/src/live/LiveDashboard.tsx:68` (`<div id="telemetry">`).
- Produces: nothing new.

No automated test: one-line JSX data fix, same no-jsdom rationale as Task 2. `scrollToSection` (`App.tsx:631-634`) already no-ops gracefully when `document.getElementById(id)` returns null, so no additional guard logic is needed for the idle-dashboard case where `#telemetry` doesn't exist. Verified manually in Task 10.

- [ ] **Step 1: Fix the nav item's id**

Change:

```ts
             {[
               { name: 'Broadcast', id: 'news' },
               { name: 'Telemetry', id: 'standings' },
               { name: 'Analytics', id: 'archive' },
               { name: 'Standings', id: 'standings' }
             ].map(item => (
```

to:

```ts
             {[
               { name: 'Broadcast', id: 'news' },
               { name: 'Telemetry', id: 'telemetry' },
               { name: 'Analytics', id: 'archive' },
               { name: 'Standings', id: 'standings' }
             ].map(item => (
```

- [ ] **Step 2: Verify no type errors**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "fix: point the Telemetry nav item at its own anchor instead of Standings'" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — `liveView.ts` pure logic module

**Files:**
- Create: `frontend/src/live/liveView.ts`
- Create: `frontend/src/live/liveView.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no dependencies on other new files).
- Produces (used by Task 5 and Task 9):
  - `export type LiveOverride = "live" | "off" | null;`
  - `export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }`
  - `export function resolveLiveView(override: LiveOverride, backendIsLive: boolean): boolean`
  - `export function loadOverride(storage: StorageLike): LiveOverride`
  - `export function saveOverride(storage: StorageLike, value: LiveOverride): void`
  - `export function shouldShowNoSessionPanel(isLive: boolean, demoActive: boolean): boolean`

`loadOverride`/`saveOverride` take the storage object as a parameter (rather than reading `window.localStorage` internally) specifically so they stay testable under vitest's node environment, which has no `window` global (spec §3 evidence item 8). Callers (`App.tsx`) pass `window.localStorage` explicitly.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/live/liveView.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveLiveView,
  loadOverride,
  saveOverride,
  shouldShowNoSessionPanel,
  type StorageLike,
} from "./liveView";

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
}

describe("resolveLiveView", () => {
  it("follows the backend when override is null (auto)", () => {
    expect(resolveLiveView(null, true)).toBe(true);
    expect(resolveLiveView(null, false)).toBe(false);
  });

  it("pins live regardless of the backend", () => {
    expect(resolveLiveView("live", false)).toBe(true);
    expect(resolveLiveView("live", true)).toBe(true);
  });

  it("pins off regardless of the backend", () => {
    expect(resolveLiveView("off", true)).toBe(false);
    expect(resolveLiveView("off", false)).toBe(false);
  });
});

describe("loadOverride / saveOverride", () => {
  it("returns null when nothing is stored", () => {
    expect(loadOverride(fakeStorage())).toBeNull();
  });

  it("round-trips a saved value", () => {
    const storage = fakeStorage();
    saveOverride(storage, "live");
    expect(loadOverride(storage)).toBe("live");
    saveOverride(storage, "off");
    expect(loadOverride(storage)).toBe("off");
  });

  it("clears the stored value when saving null", () => {
    const storage = fakeStorage({ "f1.liveOverride": "live" });
    saveOverride(storage, null);
    expect(loadOverride(storage)).toBeNull();
  });

  it("ignores a garbage stored value", () => {
    const storage = fakeStorage({ "f1.liveOverride": "garbage" });
    expect(loadOverride(storage)).toBeNull();
  });

  it("falls back to null when storage throws on read", () => {
    expect(loadOverride(throwingStorage())).toBeNull();
  });

  it("does not throw when storage throws on write", () => {
    expect(() => saveOverride(throwingStorage(), "live")).not.toThrow();
  });
});

describe("shouldShowNoSessionPanel", () => {
  it("shows the panel when live and real but the backend has no session", () => {
    expect(shouldShowNoSessionPanel(false, false)).toBe(true);
  });

  it("never shows the panel while demo is active", () => {
    expect(shouldShowNoSessionPanel(false, true)).toBe(false);
    expect(shouldShowNoSessionPanel(true, true)).toBe(false);
  });

  it("does not show the panel when a real session is live", () => {
    expect(shouldShowNoSessionPanel(true, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/live/liveView.test.ts`
Expected: FAIL — `Cannot find module './liveView'` (the module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/live/liveView.ts`:

```ts
export type LiveOverride = "live" | "off" | null;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = "f1.liveOverride";

// null (auto) preserves today's behaviour: effectiveLive tracks the
// backend's own is_live poll until the user pins an explicit choice.
export function resolveLiveView(override: LiveOverride, backendIsLive: boolean): boolean {
  return override === null ? backendIsLive : override === "live";
}

// localStorage throws in private-browsing contexts (spec §4) — any
// failure here must fall back to auto, never crash the render. Storage is
// injected rather than read from `window` so this stays testable under
// vitest's node environment, which has no `window` global.
export function loadOverride(storage: StorageLike): LiveOverride {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === "live" || raw === "off" ? raw : null;
  } catch {
    return null;
  }
}

export function saveOverride(storage: StorageLike, value: LiveOverride): void {
  try {
    if (value === null) {
      storage.removeItem(STORAGE_KEY);
    } else {
      storage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Private-browsing / storage disabled: silently no-op. The next
    // loadOverride() call still resolves to auto, so render never breaks.
  }
}

// True only when the live view is showing, it isn't demo data, and the
// backend genuinely has no session running (spec §7's honest empty
// state) — always false while demo is filling the screen instead.
export function shouldShowNoSessionPanel(isLive: boolean, demoActive: boolean): boolean {
  return !demoActive && !isLive;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/live/liveView.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/live/liveView.ts frontend/src/live/liveView.test.ts
git commit -m "feat: add pure liveView logic for the live/offline override and empty state" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — wire the toggle button, AUTO chip, and `effectiveLive` into `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx` (imports, state, the nav pill, the render branch)

**Interfaces:**
- Consumes: `resolveLiveView`, `loadOverride`, `saveOverride`, `LiveOverride` from `./live/liveView` (Task 4).
- Produces: nothing new — `App`'s internal `effectiveLive` boolean is not exported, matching the existing pattern where `status`/`is_live` are also internal to `App`.

No automated test: same no-jsdom rationale as Tasks 2/3 — this is component wiring in `App.tsx`. Verified manually in Task 10 (click the pill, confirm it pins the state, reload the page, confirm it persists, confirm the AUTO chip un-pins it).

- [ ] **Step 1: Add the import**

Add after the existing `import { LiveDashboard } from './live/LiveDashboard';` line:

```ts
import { loadOverride, saveOverride, resolveLiveView } from './live/liveView';
import type { LiveOverride } from './live/liveView';
```

- [ ] **Step 2: Add override state and derived `effectiveLive`**

Add a new `useState` next to the existing ones (after `mobileMenuOpen`, and after the `idleFetchedRef` line from Task 2):

```ts
  const [liveOverride, setLiveOverride] = useState<LiveOverride>(() => loadOverride(window.localStorage));
```

Then, immediately after the existing `useEffect` that calls `fetchStatus()` (i.e. right after the closing `}, []);` of that effect, before the splash-phase `useState`), add:

```ts
  const effectiveLive = resolveLiveView(liveOverride, status?.is_live ?? false);

  const toggleLiveOverride = () => {
    const next: LiveOverride = effectiveLive ? 'off' : 'live';
    setLiveOverride(next);
    saveOverride(window.localStorage, next);
  };

  const resetLiveOverrideToAuto = () => {
    setLiveOverride(null);
    saveOverride(window.localStorage, null);
  };
```

- [ ] **Step 3: Replace the pill with a real button + AUTO chip**

Change:

```tsx
          <div className="flex items-center gap-6 pl-10 border-l border-white/10">
            <motion.div 
              animate={status?.is_live ? { opacity: [1, 0.6, 1] } : {}}
              className={`flex items-center gap-3 px-6 py-2.5 rounded-full border text-[10px] font-black tracking-widest transition-all ${status?.is_live ? 'bg-mkbhd-red border-mkbhd-red shadow-xl shadow-mkbhd-red/20' : 'bg-white/5 border-white/10 text-mkbhd-gray'}`}
            >
              <div className={`w-2 h-2 rounded-full ${status?.is_live ? 'bg-white shadow-[0_0_10px_white]' : 'bg-mkbhd-gray'}`} />
              {status?.is_live ? 'LIVE SESSION' : 'OFFLINE'}
            </motion.div>
            <button className="lg:hidden p-3 bg-white/5 rounded-xl text-white" onClick={() => setMobileMenuOpen(true)}><Menu size={24} /></button>
          </div>
```

to:

```tsx
          <div className="flex items-center gap-6 pl-10 border-l border-white/10">
            {liveOverride !== null && (
              <button
                type="button"
                onClick={resetLiveOverrideToAuto}
                className="text-[9px] font-black uppercase tracking-widest text-mkbhd-gray hover:text-white transition-colors px-3 py-1 rounded-full border border-white/10 cursor-pointer"
              >
                AUTO
              </button>
            )}
            <motion.button
              type="button"
              onClick={toggleLiveOverride}
              aria-pressed={effectiveLive}
              animate={effectiveLive ? { opacity: [1, 0.6, 1] } : {}}
              className={`flex items-center gap-3 px-6 py-2.5 rounded-full border text-[10px] font-black tracking-widest transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mkbhd-red ${effectiveLive ? 'bg-mkbhd-red border-mkbhd-red shadow-xl shadow-mkbhd-red/20' : 'bg-white/5 border-white/10 text-mkbhd-gray'}`}
            >
              <div className={`w-2 h-2 rounded-full ${effectiveLive ? 'bg-white shadow-[0_0_10px_white]' : 'bg-mkbhd-gray'}`} />
              {effectiveLive ? 'LIVE SESSION' : 'OFFLINE'}
            </motion.button>
            <button className="lg:hidden p-3 bg-white/5 rounded-xl text-white" onClick={() => setMobileMenuOpen(true)}><Menu size={24} /></button>
          </div>
```

- [ ] **Step 4: Branch on `effectiveLive` instead of `status?.is_live`**

Change:

```tsx
          {status?.is_live ? (
```

to:

```tsx
          {effectiveLive ? (
```

- [ ] **Step 5: Verify no type errors**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: make the live/offline pill a real persisted toggle with an AUTO reset chip" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — `enabled` flag on `useLiveTimingSocket`

**Files:**
- Modify: `frontend/src/live/useLiveTimingSocket.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 8): `useLiveTimingSocket(enabled?: boolean): LiveSnapshot` — when `enabled` is `false`, no `WebSocket` is ever constructed and the returned snapshot stays at `INITIAL_LIVE_STATE`; when it flips back to `true`, a fresh connection opens (mirrors mount/unmount teardown, without actually unmounting `LiveDashboard`).

No automated test: this hook has zero existing tests (it requires a live `WebSocket`/DOM environment this repo's vitest config doesn't provide — same no-jsdom rationale as the rest of `frontend/src/live/`'s components/hooks). Verified manually in Task 10 (confirm the browser's Network/WS panel shows no `/ws/live` connection while demo mode is active).

- [ ] **Step 1: Change the signature and effect**

Change:

```ts
export function useLiveTimingSocket(): LiveSnapshot {
  const [state, setState] = useState<LiveSnapshot>(INITIAL_LIVE_STATE);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
```

to:

```ts
export function useLiveTimingSocket(enabled: boolean = true): LiveSnapshot {
  const [state, setState] = useState<LiveSnapshot>(INITIAL_LIVE_STATE);

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
```

Then change the effect's dependency array from `[]` to `[enabled]`:

```ts
  }, [enabled]);
```

The rest of the effect body (`connect`, `onmessage`, `onclose`, `onerror`, and the cleanup function) is unchanged — the existing `stopped` flag and cleanup already correctly tear down the socket whenever the effect re-runs, which now also happens whenever `enabled` flips.

- [ ] **Step 2: Verify no type errors**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/live/useLiveTimingSocket.ts
git commit -m "feat: let useLiveTimingSocket be disabled without unmounting the dashboard" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — demo timeline data + `frameAt` player

**Files:**
- Create: `frontend/src/live/demo/timeline.json`
- Create: `frontend/src/live/demo/timeline.ts`
- Create: `frontend/src/live/demo/timeline.test.ts`
- Modify: `frontend/tsconfig.app.json` (add `resolveJsonModule`)

**Interfaces:**
- Consumes: `LiveSnapshot` from `../types` (existing).
- Produces (used by Task 8):
  - `export interface DemoFrame { atMs: number; snapshot: LiveSnapshot }`
  - `export interface DemoTimeline { durationMs: number; frames: DemoFrame[] }`
  - `export const DEMO_TIMELINE: DemoTimeline`
  - `export function frameAt(timeline: DemoTimeline, tMs: number): LiveSnapshot`

- [ ] **Step 1: Enable JSON imports in the TypeScript config**

In `frontend/tsconfig.app.json`, add `"resolveJsonModule": true` inside `compilerOptions` (next to `"skipLibCheck"`):

```json
    "skipLibCheck": true,
    "resolveJsonModule": true,
```

- [ ] **Step 2: Author the demo data**

Create `frontend/src/live/demo/timeline.json`:

```json
{
  "durationMs": 20000,
  "frames": [
    {
      "atMs": 0,
      "snapshot": {
        "connection_status": "connected",
        "is_live": true,
        "session_info": { "Meeting": { "Name": "Demo Grand Prix" }, "Type": "Race" },
        "drivers": {
          "1": { "racing_number": "1", "tla": "VER", "full_name": "Max Verstappen", "team_name": "Red Bull Racing", "team_colour": "3671C6", "line": 1 },
          "4": { "racing_number": "4", "tla": "NOR", "full_name": "Lando Norris", "team_name": "McLaren", "team_colour": "FF8000", "line": 2 },
          "16": { "racing_number": "16", "tla": "LEC", "full_name": "Charles Leclerc", "team_name": "Ferrari", "team_colour": "E80020", "line": 3 },
          "44": { "racing_number": "44", "tla": "HAM", "full_name": "Lewis Hamilton", "team_name": "Mercedes", "team_colour": "27F4D2", "line": 4 }
        },
        "timing": {
          "1": { "position": "1", "gap_to_leader": null, "interval": null, "catching": false, "sectors": [{ "Value": "28.112", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.884", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.205", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.201" }, "best_lap": { "Value": "1:15.870" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 12, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "4": { "position": "2", "gap_to_leader": "+1.203", "interval": "+1.203", "catching": true, "sectors": [{ "Value": "28.201", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.920", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.311", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.432" }, "best_lap": { "Value": "1:16.010" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 12, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "16": { "position": "3", "gap_to_leader": "+4.556", "interval": "+3.353", "catching": false, "sectors": [{ "Value": "28.340", "OverallFastest": false, "PersonalFastest": false }, { "Value": "32.011", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.402", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.753" }, "best_lap": { "Value": "1:16.301" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 12, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "44": { "position": "4", "gap_to_leader": "+8.912", "interval": "+4.356", "catching": false, "sectors": [{ "Value": "28.501", "OverallFastest": false, "PersonalFastest": false }, { "Value": "32.204", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.512", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:17.109" }, "best_lap": { "Value": "1:16.688" }, "tyre_compound": "HARD", "tyre_is_new": false, "stint_laps": 5, "pit_count": 1, "in_pit": false, "retired": false, "personal_best_lap": null }
        },
        "positions": {
          "1": { "x": 3200, "y": 400, "z": 0, "status": "OnTrack" },
          "4": { "x": 3000, "y": 900, "z": 0, "status": "OnTrack" },
          "16": { "x": 2700, "y": 1400, "z": 0, "status": "OnTrack" },
          "44": { "x": 2300, "y": 1800, "z": 0, "status": "OnTrack" }
        },
        "telemetry": {
          "1": { "rpm": 11200, "speed": 298, "gear": 7, "throttle": 92, "brake": 0, "drs": 1 },
          "4": { "rpm": 11050, "speed": 291, "gear": 7, "throttle": 88, "brake": 0, "drs": 0 },
          "16": { "rpm": 10800, "speed": 285, "gear": 6, "throttle": 85, "brake": 0, "drs": 0 },
          "44": { "rpm": 10600, "speed": 279, "gear": 6, "throttle": 80, "brake": 5, "drs": 0 }
        },
        "track_status": { "Status": "1", "Message": "AllClear" },
        "race_control": [{ "Category": "Flag", "Message": "GREEN LIGHT - TRACK CLEAR" }],
        "weather": { "AirTemp": "24.5", "TrackTemp": "31.2", "Humidity": "48", "Rainfall": "0" }
      }
    },
    {
      "atMs": 6000,
      "snapshot": {
        "connection_status": "connected",
        "is_live": true,
        "session_info": { "Meeting": { "Name": "Demo Grand Prix" }, "Type": "Race" },
        "drivers": {
          "1": { "racing_number": "1", "tla": "VER", "full_name": "Max Verstappen", "team_name": "Red Bull Racing", "team_colour": "3671C6", "line": 1 },
          "4": { "racing_number": "4", "tla": "NOR", "full_name": "Lando Norris", "team_name": "McLaren", "team_colour": "FF8000", "line": 2 },
          "16": { "racing_number": "16", "tla": "LEC", "full_name": "Charles Leclerc", "team_name": "Ferrari", "team_colour": "E80020", "line": 3 },
          "44": { "racing_number": "44", "tla": "HAM", "full_name": "Lewis Hamilton", "team_name": "Mercedes", "team_colour": "27F4D2", "line": 4 }
        },
        "timing": {
          "1": { "position": "1", "gap_to_leader": null, "interval": null, "catching": false, "sectors": [{ "Value": "28.098", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.870", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.190", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.158" }, "best_lap": { "Value": "1:15.870" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 13, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "4": { "position": "2", "gap_to_leader": "+0.842", "interval": "+0.842", "catching": true, "sectors": [{ "Value": "27.950", "OverallFastest": true, "PersonalFastest": false }, { "Value": "31.605", "OverallFastest": false, "PersonalFastest": true }, { "Value": "16.087", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:15.642" }, "best_lap": { "Value": "1:15.642" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 13, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "16": { "position": "3", "gap_to_leader": "+4.201", "interval": "+3.359", "catching": false, "sectors": [{ "Value": "28.310", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.990", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.380", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.680" }, "best_lap": { "Value": "1:16.301" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 13, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "44": { "position": "4", "gap_to_leader": "+8.512", "interval": "+4.311", "catching": false, "sectors": [{ "Value": "28.470", "OverallFastest": false, "PersonalFastest": false }, { "Value": "32.150", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.480", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:17.020" }, "best_lap": { "Value": "1:16.688" }, "tyre_compound": "HARD", "tyre_is_new": false, "stint_laps": 6, "pit_count": 1, "in_pit": false, "retired": false, "personal_best_lap": null }
        },
        "positions": {
          "1": { "x": 3400, "y": 700, "z": 0, "status": "OnTrack" },
          "4": { "x": 3300, "y": 1150, "z": 0, "status": "OnTrack" },
          "16": { "x": 2950, "y": 1700, "z": 0, "status": "OnTrack" },
          "44": { "x": 2500, "y": 2050, "z": 0, "status": "OnTrack" }
        },
        "telemetry": {
          "1": { "rpm": 11300, "speed": 302, "gear": 8, "throttle": 95, "brake": 0, "drs": 1 },
          "4": { "rpm": 11400, "speed": 306, "gear": 8, "throttle": 97, "brake": 0, "drs": 1 },
          "16": { "rpm": 10900, "speed": 288, "gear": 6, "throttle": 86, "brake": 0, "drs": 0 },
          "44": { "rpm": 10700, "speed": 282, "gear": 6, "throttle": 82, "brake": 3, "drs": 0 }
        },
        "track_status": { "Status": "1", "Message": "AllClear" },
        "race_control": [{ "Category": "Flag", "Message": "GREEN LIGHT - TRACK CLEAR" }],
        "weather": { "AirTemp": "24.6", "TrackTemp": "31.4", "Humidity": "48", "Rainfall": "0" }
      }
    },
    {
      "atMs": 12000,
      "snapshot": {
        "connection_status": "connected",
        "is_live": true,
        "session_info": { "Meeting": { "Name": "Demo Grand Prix" }, "Type": "Race" },
        "drivers": {
          "1": { "racing_number": "1", "tla": "VER", "full_name": "Max Verstappen", "team_name": "Red Bull Racing", "team_colour": "3671C6", "line": 1 },
          "4": { "racing_number": "4", "tla": "NOR", "full_name": "Lando Norris", "team_name": "McLaren", "team_colour": "FF8000", "line": 2 },
          "16": { "racing_number": "16", "tla": "LEC", "full_name": "Charles Leclerc", "team_name": "Ferrari", "team_colour": "E80020", "line": 3 },
          "44": { "racing_number": "44", "tla": "HAM", "full_name": "Lewis Hamilton", "team_name": "Mercedes", "team_colour": "27F4D2", "line": 4 }
        },
        "timing": {
          "1": { "position": "1", "gap_to_leader": null, "interval": null, "catching": false, "sectors": [{ "Value": "28.050", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.780", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.150", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:15.980" }, "best_lap": { "Value": "1:15.870" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 14, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "4": { "position": "2", "gap_to_leader": "+2.401", "interval": "+2.401", "catching": false, "sectors": [{ "Value": "28.020", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.650", "OverallFastest": false, "PersonalFastest": true }, { "Value": "16.100", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:15.770" }, "best_lap": { "Value": "1:15.642" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 14, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "16": { "position": "3", "gap_to_leader": "+38.401", "interval": "+36.000", "catching": false, "sectors": [{ "Value": "0", "OverallFastest": false, "PersonalFastest": false }, { "Value": "0", "OverallFastest": false, "PersonalFastest": false }, { "Value": "0", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.680" }, "best_lap": { "Value": "1:16.301" }, "tyre_compound": "HARD", "tyre_is_new": true, "stint_laps": 0, "pit_count": 1, "in_pit": true, "retired": false, "personal_best_lap": null },
          "44": { "position": "4", "gap_to_leader": "+9.812", "interval": "+7.411", "catching": false, "sectors": [{ "Value": "28.320", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.980", "OverallFastest": false, "PersonalFastest": true }, { "Value": "16.320", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.620" }, "best_lap": { "Value": "1:16.620" }, "tyre_compound": "HARD", "tyre_is_new": false, "stint_laps": 7, "pit_count": 1, "in_pit": false, "retired": false, "personal_best_lap": null }
        },
        "positions": {
          "1": { "x": 3550, "y": 1100, "z": 0, "status": "OnTrack" },
          "4": { "x": 3480, "y": 1500, "z": 0, "status": "OnTrack" },
          "16": { "x": 2000, "y": 2200, "z": 0, "status": "InPit" },
          "44": { "x": 2700, "y": 2350, "z": 0, "status": "OnTrack" }
        },
        "telemetry": {
          "1": { "rpm": 11250, "speed": 300, "gear": 7, "throttle": 93, "brake": 0, "drs": 0 },
          "4": { "rpm": 11150, "speed": 294, "gear": 7, "throttle": 90, "brake": 0, "drs": 1 },
          "16": { "rpm": 3200, "speed": 40, "gear": 2, "throttle": 20, "brake": 60, "drs": 0 },
          "44": { "rpm": 10850, "speed": 284, "gear": 6, "throttle": 84, "brake": 2, "drs": 0 }
        },
        "track_status": { "Status": "1", "Message": "AllClear" },
        "race_control": [
          { "Category": "Flag", "Message": "GREEN LIGHT - TRACK CLEAR" },
          { "Category": "Other", "Message": "CAR 16 (LEC) PIT LANE ENTRY" }
        ],
        "weather": { "AirTemp": "24.7", "TrackTemp": "31.6", "Humidity": "47", "Rainfall": "0" }
      }
    },
    {
      "atMs": 18000,
      "snapshot": {
        "connection_status": "connected",
        "is_live": true,
        "session_info": { "Meeting": { "Name": "Demo Grand Prix" }, "Type": "Race" },
        "drivers": {
          "1": { "racing_number": "1", "tla": "VER", "full_name": "Max Verstappen", "team_name": "Red Bull Racing", "team_colour": "3671C6", "line": 1 },
          "4": { "racing_number": "4", "tla": "NOR", "full_name": "Lando Norris", "team_name": "McLaren", "team_colour": "FF8000", "line": 2 },
          "16": { "racing_number": "16", "tla": "LEC", "full_name": "Charles Leclerc", "team_name": "Ferrari", "team_colour": "E80020", "line": 3 },
          "44": { "racing_number": "44", "tla": "HAM", "full_name": "Lewis Hamilton", "team_name": "Mercedes", "team_colour": "27F4D2", "line": 4 }
        },
        "timing": {
          "1": { "position": "1", "gap_to_leader": null, "interval": null, "catching": false, "sectors": [{ "Value": "27.980", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.700", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.100", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:15.780" }, "best_lap": { "Value": "1:15.780" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 15, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "4": { "position": "2", "gap_to_leader": "+2.912", "interval": "+2.912", "catching": false, "sectors": [{ "Value": "27.870", "OverallFastest": true, "PersonalFastest": false }, { "Value": "31.542", "OverallFastest": true, "PersonalFastest": false }, { "Value": "16.055", "OverallFastest": true, "PersonalFastest": false }], "last_lap": { "Value": "1:15.512" }, "best_lap": { "Value": "1:15.512" }, "tyre_compound": "MEDIUM", "tyre_is_new": false, "stint_laps": 15, "pit_count": 0, "in_pit": false, "retired": false, "personal_best_lap": null },
          "16": { "position": "3", "gap_to_leader": "+40.812", "interval": "+37.900", "catching": false, "sectors": [{ "Value": "29.410", "OverallFastest": false, "PersonalFastest": false }, { "Value": "33.200", "OverallFastest": false, "PersonalFastest": false }, { "Value": "17.010", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:19.620" }, "best_lap": { "Value": "1:16.301" }, "tyre_compound": "HARD", "tyre_is_new": true, "stint_laps": 1, "pit_count": 1, "in_pit": false, "retired": false, "personal_best_lap": null },
          "44": { "position": "4", "gap_to_leader": "+11.102", "interval": "+8.311", "catching": false, "sectors": [{ "Value": "28.210", "OverallFastest": false, "PersonalFastest": false }, { "Value": "31.890", "OverallFastest": false, "PersonalFastest": false }, { "Value": "16.280", "OverallFastest": false, "PersonalFastest": false }], "last_lap": { "Value": "1:16.380" }, "best_lap": { "Value": "1:16.380" }, "tyre_compound": "HARD", "tyre_is_new": false, "stint_laps": 8, "pit_count": 1, "in_pit": false, "retired": false, "personal_best_lap": null }
        },
        "positions": {
          "1": { "x": 3300, "y": 1650, "z": 0, "status": "OnTrack" },
          "4": { "x": 3150, "y": 2050, "z": 0, "status": "OnTrack" },
          "16": { "x": 2350, "y": 2450, "z": 0, "status": "OnTrack" },
          "44": { "x": 2900, "y": 2650, "z": 0, "status": "OnTrack" }
        },
        "telemetry": {
          "1": { "rpm": 11280, "speed": 301, "gear": 7, "throttle": 94, "brake": 0, "drs": 1 },
          "4": { "rpm": 11380, "speed": 305, "gear": 8, "throttle": 96, "brake": 0, "drs": 1 },
          "16": { "rpm": 10600, "speed": 270, "gear": 5, "throttle": 78, "brake": 4, "drs": 0 },
          "44": { "rpm": 10900, "speed": 287, "gear": 6, "throttle": 85, "brake": 0, "drs": 0 }
        },
        "track_status": { "Status": "1", "Message": "AllClear" },
        "race_control": [
          { "Category": "Flag", "Message": "GREEN LIGHT - TRACK CLEAR" },
          { "Category": "Other", "Message": "CAR 16 (LEC) PIT LANE EXIT" }
        ],
        "weather": { "AirTemp": "24.8", "TrackTemp": "31.9", "Humidity": "47", "Rainfall": "0" }
      }
    }
  ]
}
```

- [ ] **Step 3: Write the failing tests**

Create `frontend/src/live/demo/timeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEMO_TIMELINE, frameAt } from "./timeline";

describe("DEMO_TIMELINE shape", () => {
  it("starts at zero and stays within its own duration", () => {
    expect(DEMO_TIMELINE.frames.length).toBeGreaterThan(1);
    expect(DEMO_TIMELINE.frames[0].atMs).toBe(0);
    for (const frame of DEMO_TIMELINE.frames) {
      expect(frame.atMs).toBeGreaterThanOrEqual(0);
      expect(frame.atMs).toBeLessThan(DEMO_TIMELINE.durationMs);
    }
  });

  it("every frame is a fully-shaped LiveSnapshot", () => {
    for (const frame of DEMO_TIMELINE.frames) {
      const snapshot = frame.snapshot;
      expect(snapshot.is_live).toBe(true);
      expect(Object.keys(snapshot.drivers).length).toBeGreaterThan(0);
      for (const line of Object.values(snapshot.timing)) {
        expect(Array.isArray(line.sectors)).toBe(true);
        expect(typeof line.catching).toBe("boolean");
        expect(typeof line.in_pit).toBe("boolean");
        expect(typeof line.retired).toBe("boolean");
      }
      for (const position of Object.values(snapshot.positions)) {
        expect("x" in position && "y" in position).toBe(true);
      }
    }
  });

  it("shows motion across frames (positions actually change)", () => {
    const first = DEMO_TIMELINE.frames[0].snapshot.positions["1"];
    const last = DEMO_TIMELINE.frames[DEMO_TIMELINE.frames.length - 1].snapshot.positions["1"];
    expect(first).not.toEqual(last);
  });

  it("contains a pit stop and a tyre compound change", () => {
    const hasInPit = DEMO_TIMELINE.frames.some((f) => f.snapshot.timing["16"].in_pit);
    const compounds = new Set(DEMO_TIMELINE.frames.map((f) => f.snapshot.timing["16"].tyre_compound));
    expect(hasInPit).toBe(true);
    expect(compounds.size).toBeGreaterThan(1);
  });
});

describe("frameAt", () => {
  it("returns the first frame at t=0", () => {
    expect(frameAt(DEMO_TIMELINE, 0)).toBe(DEMO_TIMELINE.frames[0].snapshot);
  });

  it("advances to the next frame once its atMs is reached", () => {
    const second = DEMO_TIMELINE.frames[1];
    expect(frameAt(DEMO_TIMELINE, second.atMs)).toBe(second.snapshot);
    expect(frameAt(DEMO_TIMELINE, second.atMs - 1)).toBe(DEMO_TIMELINE.frames[0].snapshot);
  });

  it("loops back to the start once the timeline's duration elapses", () => {
    expect(frameAt(DEMO_TIMELINE, DEMO_TIMELINE.durationMs)).toBe(DEMO_TIMELINE.frames[0].snapshot);
    const second = DEMO_TIMELINE.frames[1];
    expect(frameAt(DEMO_TIMELINE, DEMO_TIMELINE.durationMs + second.atMs)).toBe(second.snapshot);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/live/demo/timeline.test.ts`
Expected: FAIL — `Cannot find module './timeline'`.

- [ ] **Step 5: Write minimal implementation**

Create `frontend/src/live/demo/timeline.ts`:

```ts
import type { LiveSnapshot } from "../types";
import rawTimeline from "./timeline.json";

export interface DemoFrame {
  atMs: number;
  snapshot: LiveSnapshot;
}

export interface DemoTimeline {
  durationMs: number;
  frames: DemoFrame[];
}

// timeline.json is authored as plain JSON (no TS types at the data layer)
// so it can be inspected/edited without touching this module; the cast
// here is the one place that ties it to LiveSnapshot — the shape
// assertion test in timeline.test.ts is what actually enforces it.
export const DEMO_TIMELINE = rawTimeline as DemoTimeline;

// Loops the timeline forever: tMs wraps into [0, durationMs) and resolves
// to the last frame at or before that point. frames[0].atMs is always 0
// (asserted in timeline.test.ts), so every wrapped value resolves to a
// frame — there is no "before the first frame" case to fall back from.
export function frameAt(timeline: DemoTimeline, tMs: number): LiveSnapshot {
  const wrapped = ((tMs % timeline.durationMs) + timeline.durationMs) % timeline.durationMs;
  let current = timeline.frames[0];
  for (const frame of timeline.frames) {
    if (frame.atMs > wrapped) break;
    current = frame;
  }
  return current.snapshot;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/live/demo/timeline.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 7: Run the full type-check (the JSON import needs the Step 1 config change)**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/tsconfig.app.json frontend/src/live/demo/timeline.json frontend/src/live/demo/timeline.ts frontend/src/live/demo/timeline.test.ts
git commit -m "feat: add a moving client-side demo timeline with a pure frameAt player" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — `useLiveSnapshot` hook

**Files:**
- Create: `frontend/src/live/useLiveSnapshot.ts`

**Interfaces:**
- Consumes: `useLiveTimingSocket(enabled)` (Task 6), `DEMO_TIMELINE`/`frameAt` (Task 7), `INITIAL_LIVE_STATE`/`applyLivePatch` (existing, `liveState.ts`).
- Produces (used by Task 9): `export function useLiveSnapshot(demoActive: boolean): LiveSnapshot`.

No automated test: this hook composes two other untested hooks and has no DOM-independent pure logic of its own to extract (its only logic, `frameAt`, is already tested in Task 7). Verified manually in Task 10.

- [ ] **Step 1: Write the implementation**

Create `frontend/src/live/useLiveSnapshot.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "./types";
import { INITIAL_LIVE_STATE, applyLivePatch } from "./liveState";
import { useLiveTimingSocket } from "./useLiveTimingSocket";
import { DEMO_TIMELINE, frameAt } from "./demo/timeline";

const DEMO_TICK_MS = 500;

// Chooses the snapshot source: the real socket when demo is off, or the
// client-side demo player when it's on — LiveDashboard consumes a single
// snapshot either way (spec §6's "one reducer, one snapshot"). The socket
// is only ever enabled when demo is off, so entering demo mode closes the
// real connection instead of running both at once.
export function useLiveSnapshot(demoActive: boolean): LiveSnapshot {
  const socketSnapshot = useLiveTimingSocket(!demoActive);
  const [demoSnapshot, setDemoSnapshot] = useState<LiveSnapshot>(INITIAL_LIVE_STATE);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!demoActive) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - (startRef.current ?? Date.now());
      setDemoSnapshot((prev) => applyLivePatch(prev, frameAt(DEMO_TIMELINE, elapsed)));
    };
    tick();
    const interval = setInterval(tick, DEMO_TICK_MS);
    return () => clearInterval(interval);
  }, [demoActive]);

  return demoActive ? demoSnapshot : socketSnapshot;
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/live/useLiveSnapshot.ts
git commit -m "feat: add useLiveSnapshot to choose between the real socket and demo playback" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Frontend — wire demo switch, DEMO badge, and no-session panel into `LiveDashboard`

**Files:**
- Modify: `frontend/src/live/LiveDashboard.tsx`

**Interfaces:**
- Consumes: `useLiveSnapshot` (Task 8), `shouldShowNoSessionPanel` (Task 4).
- Produces: nothing new — `LiveDashboard` remains a zero-prop component (`App.tsx` renders `<LiveDashboard />` unchanged).

No automated test: same no-jsdom rationale as the rest of this component tree. Verified manually in Task 10.

- [ ] **Step 1: Replace the file's imports and header logic**

Change the top of `frontend/src/live/LiveDashboard.tsx` from:

```tsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLiveTimingSocket } from "./useLiveTimingSocket";
import { computeSessionBests } from "./liveState";
import { SessionBests } from "./SessionBests";
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
```

to:

```tsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { computeSessionBests } from "./liveState";
import { shouldShowNoSessionPanel } from "./liveView";
import { SessionBests } from "./SessionBests";
import { TimingTower } from "./TimingTower";
import { TrackMap } from "./TrackMap";
import { RaceControlFeed } from "./RaceControlFeed";
import { DriverTelemetryPanel } from "./DriverTelemetryPanel";

export function LiveDashboard() {
  const [demoActive, setDemoActive] = useState(false);
  const snapshot = useLiveSnapshot(demoActive);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const sessionName = snapshot.session_info.Meeting?.Name ?? "ON AIR";
  const isReconnecting = snapshot.connection_status === "reconnecting";
  const showFeedNotice = snapshot.connection_status !== "connected" && !demoActive;
  const showNoSessionPanel = shouldShowNoSessionPanel(snapshot.is_live, demoActive);
```

- [ ] **Step 2: Add the demo switch and DEMO badge to the header, and gate the body on `showNoSessionPanel`**

Change:

```tsx
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

      <SessionBests bests={bests} leaderTla={leaderTla} trackStatus={snapshot.track_status} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8">
          <TimingTower
            drivers={snapshot.drivers}
            timing={snapshot.timing}
            selectedDriver={selectedDriver}
            onSelectDriver={setSelectedDriver}
            fastestLapDriver={bests.fastestLap?.racingNumber ?? null}
            fastestPaceDriver={bests.fastestPace?.racingNumber ?? null}
          />
        </div>

        <div className="lg:col-span-4 space-y-10">
          <TrackMap drivers={snapshot.drivers} positions={snapshot.positions} selectedDriver={selectedDriver} />
          <RaceControlFeed messages={snapshot.race_control} />
        </div>
      </div>

      <div id="telemetry">
        <DriverTelemetryPanel drivers={snapshot.drivers} telemetry={snapshot.telemetry} selectedDriver={selectedDriver} />
      </div>
    </div>
  );
}
```

to:

```tsx
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-12 pb-12 border-b border-white/5">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ opacity: 1, x: 0 }}>
          <div className="text-mkbhd-red font-black uppercase tracking-[0.5em] mb-4 text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-mkbhd-red animate-pulse" /> Live Satellite Feed
          </div>
          <h1 className="text-7xl md:text-[10rem] tracking-tight leading-none">{sessionName}</h1>
        </motion.div>
        <div className="flex flex-col items-end gap-4">
          {demoActive && (
            <div className="px-6 py-3 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest text-white">
              DEMO — SIMULATED DATA
            </div>
          )}
          {showFeedNotice && (
            <div className="px-6 py-3 bg-mkbhd-red/10 border border-mkbhd-red/40 rounded-full text-[10px] font-black uppercase tracking-widest text-mkbhd-red">
              {isReconnecting ? "Reconnecting to live feed..." : "Connecting to live feed..."}
            </div>
          )}
          <button
            type="button"
            onClick={() => setDemoActive((prev) => !prev)}
            className="px-6 py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-mkbhd-gray hover:text-white transition-all cursor-pointer"
          >
            {demoActive ? "Stop Demo" : "Start Demo"}
          </button>
        </div>
      </header>

      {showNoSessionPanel ? (
        <div className="flex flex-col items-center justify-center gap-8 py-32 border border-white/10 rounded-mkbhd bg-white/[0.02] text-center">
          <div className="text-3xl font-black italic uppercase tracking-tight">No Live Session</div>
          <p className="text-mkbhd-gray max-w-md">
            The live feed has nothing to show right now — no session is running. Start a simulated
            demo to preview the dashboard with moving data.
          </p>
          <button
            type="button"
            onClick={() => setDemoActive(true)}
            className="mkbhd-btn-primary px-10 py-4 text-[11px] font-black uppercase tracking-widest"
          >
            Start Demo
          </button>
        </div>
      ) : (
        <>
          <SessionBests bests={bests} leaderTla={leaderTla} trackStatus={snapshot.track_status} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8">
              <TimingTower
                drivers={snapshot.drivers}
                timing={snapshot.timing}
                selectedDriver={selectedDriver}
                onSelectDriver={setSelectedDriver}
                fastestLapDriver={bests.fastestLap?.racingNumber ?? null}
                fastestPaceDriver={bests.fastestPace?.racingNumber ?? null}
              />
            </div>

            <div className="lg:col-span-4 space-y-10">
              <TrackMap drivers={snapshot.drivers} positions={snapshot.positions} selectedDriver={selectedDriver} />
              <RaceControlFeed messages={snapshot.race_control} />
            </div>
          </div>

          <div id="telemetry">
            <DriverTelemetryPanel drivers={snapshot.drivers} telemetry={snapshot.telemetry} selectedDriver={selectedDriver} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify no type errors**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/live/LiveDashboard.tsx
git commit -m "feat: add demo switch, DEMO badge, and honest no-session panel to LiveDashboard" \
  -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Backend suite**

Run: `cd backend && venv/bin/python -m pytest -q`
Expected: 58 passed (57 existing + Task 1's new test).

- [ ] **Step 2: Frontend type-check**

Run: `cd frontend && npx tsc -b tsconfig.app.json --force`
Expected: clean, no errors.

- [ ] **Step 3: Frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all green — 13 existing tests + Task 4's `liveView.test.ts` (10 tests) + Task 7's `timeline.test.ts` (7 tests) = 30 passed.

- [ ] **Step 4: Manual browser verification**

The sandbox cannot bind listening sockets, so this step must be run by the user in their own terminal (or via the preview system, which can bind ports — see `.claude/launch.json`'s `backend`/`frontend` configs). Start the backend with `LIVETIMING_REPLAY=fixtures/live_demo.jsonl` (or use the preview `backend` config, which already sets it) so there's a populated real session to toggle against, then in the browser:

1. With a real session live: confirm the pill reads `LIVE SESSION` and the dashboard renders. Click the pill — it should flip to `OFFLINE`, the idle dashboard should render instead, and an `AUTO` chip should appear next to the pill. Reload the page — `OFFLINE` and the idle dashboard should persist (override survived the reload).
2. Click `AUTO` — the `AUTO` chip disappears and the pill returns to tracking the backend (`LIVE SESSION`, since the real session is still live).
3. Stop the backend (or point it at a source with no session) and force `LIVE SESSION` via the pill: confirm the "No Live Session" panel appears with a "Start Demo" button, not a blank or fake-data dashboard.
4. Click "Start Demo" (from the panel or the header switch): confirm the `DEMO — SIMULATED DATA` badge appears, the timing tower/track map/telemetry all populate and visibly move over ~20 seconds (positions change, lap times tick, a pit stop happens for car 16), and the browser's Network/WS panel shows no `/ws/live` connection while demo is active.
5. Click "Stop Demo": confirm it correctly returns to either the live dashboard (if a real session is available) or the no-session panel.
6. Confirm the `Telemetry` nav link scrolls to the telemetry panel while a live/demo session is showing.
7. Confirm `/api/idle-data` (Network tab) fires exactly once on initial idle-dashboard load, not every 30 seconds.

- [ ] **Step 5: Report results**

If all four automated checks pass and manual verification (run by the user, or via preview) confirms the six behaviours above, the plan is complete.
