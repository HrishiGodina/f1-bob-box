import type { LivePatch, LiveSnapshot } from "./types";

// Mirrors LiveSessionState.snapshot()'s empty-state shape exactly (backend/
// livetiming/state.py) — verified against the actual empty-snapshot test in
// backend/test_main_live.py (Task 6, Step 3).
export const INITIAL_LIVE_STATE: LiveSnapshot = {
  connection_status: "disconnected",
  is_live: false,
  session_info: {},
  drivers: {},
  timing: {},
  positions: {},
  telemetry: {},
  track_status: {},
  race_control: [],
  weather: {},
};

// Deliberately a shallow merge, not a recursive one: the backend already
// resolved every delta (Task 2's merge_delta) before broadcasting, so each
// key in a patch is a complete, final value. Recursively merging here would
// re-introduce the exact class of bug Task 2 exists to avoid — stale
// nested fields surviving under a key the backend meant to fully replace.
export function applyLivePatch(state: LiveSnapshot, patch: LivePatch): LiveSnapshot {
  return { ...state, ...patch };
}

// Derives the /ws/live WebSocket URL from the existing VITE_API_BASE
// (App.tsx already defines API_BASE = ".../api"), rather than introducing a
// second env var that could drift out of sync with it across deployments.
// /ws/live is bare, not /api-prefixed (handoff §7 decision 8), so the /api
// suffix is stripped before swapping the scheme.
export function deriveWsUrl(apiBase: string): string {
  const withoutApiSuffix = apiBase.replace(/\/api\/?$/, "");
  const wsBase = withoutApiSuffix.replace(/^http/, "ws"); // http->ws, https->wss
  return `${wsBase}/ws/live`;
}
