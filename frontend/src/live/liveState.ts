import type { DriverInfo, LivePatch, LiveSnapshot, TimingLine } from "./types";

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

// A single driver's best/quickest time, resolved down to seconds so it can
// be compared across drivers, plus the original display string (e.g.
// "1:18.223") the broadcast graphics show verbatim.
export interface DriverBest {
  racingNumber: string;
  tla: string;
  time: string;
  seconds: number;
}

export interface SessionBests {
  // Quickest single lap of the whole session (broadcast "purple" time).
  fastestLap: DriverBest | null;
  // Quickest *most-recent* lap among cars still running — i.e. who is
  // lapping fastest right now, which is a different question from the
  // session record above.
  fastestPace: DriverBest | null;
}

// Parse an F1 lap/sector time string into total seconds. Accepts
// "M:SS.mmm" (e.g. "1:18.223"), a plain "SS.mmm" (e.g. "28.312"), and
// defensively "H:MM:SS.mmm". Returns null for empty or malformed input so
// callers skip a driver who has no representative time yet — treating a
// blank as 0 would make it win every "fastest" comparison.
export function parseLapTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let seconds = 0;
  for (const part of trimmed.split(":")) {
    const n = Number(part);
    if (part === "" || Number.isNaN(n)) return null;
    seconds = seconds * 60 + n;
  }
  return seconds;
}

// Pure projection over the timing map (never stored on the backend — see
// "derive, don't store"): the smallest `getValue` time among the drivers
// `include` accepts. Ties keep the first driver encountered.
function pickBest(
  timing: Record<string, TimingLine>,
  drivers: Record<string, DriverInfo>,
  getValue: (line: TimingLine) => string | null | undefined,
  include: (line: TimingLine) => boolean
): DriverBest | null {
  let best: DriverBest | null = null;
  for (const [racingNumber, line] of Object.entries(timing)) {
    if (!include(line)) continue;
    const raw = getValue(line);
    const seconds = parseLapTime(raw);
    if (seconds === null) continue;
    if (best === null || seconds < best.seconds) {
      best = {
        racingNumber,
        tla: drivers[racingNumber]?.tla ?? `#${racingNumber}`,
        time: (raw as string).trim(),
        seconds,
      };
    }
  }
  return best;
}

// Fastest lap uses each driver's BestLapTime, falling back to the
// TimingStats PersonalBestLapTime the backend exposes separately (the
// committed fixture, for instance, only carries the latter). Fastest pace
// uses the most recent LastLapTime and excludes retired cars — a car that's
// out isn't setting a current pace. Cars in the pit lane are kept: their
// last completed lap is still real pace data.
export function computeSessionBests(
  timing: Record<string, TimingLine>,
  drivers: Record<string, DriverInfo>
): SessionBests {
  return {
    fastestLap: pickBest(
      timing,
      drivers,
      (line) => line.best_lap?.Value ?? line.personal_best_lap?.Value,
      () => true
    ),
    fastestPace: pickBest(
      timing,
      drivers,
      (line) => line.last_lap?.Value,
      (line) => !line.retired
    ),
  };
}
