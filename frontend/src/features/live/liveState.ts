import type {
  DriverInfo,
  LivePatch,
  LiveSnapshot,
  RaceControlMessage,
  SectorTime,
  TelemetryChannels,
  TimingLine,
  TrackStatusInfo,
} from "./types";

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
  starting_grid: {},
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
  teamColour: string | null;
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
        teamColour: drivers[racingNumber]?.team_colour ?? null,
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

export interface TopSpeed {
  racingNumber: string;
  tla: string;
  speed: number;
  teamColour: string | null;
}

// Live top speed across the field right now (telemetry.speed is
// instantaneous, not a lap-scoped record) — this is the "Fastest Pace"
// card's headline metric instead of a lap-time.
export function computeTopSpeed(
  telemetry: Record<string, TelemetryChannels>,
  drivers: Record<string, DriverInfo>
): TopSpeed | null {
  let best: TopSpeed | null = null;
  for (const [racingNumber, channels] of Object.entries(telemetry)) {
    const speed = channels.speed;
    if (speed === null || speed === undefined) continue;
    if (best === null || speed > best.speed) {
      best = {
        racingNumber,
        tla: drivers[racingNumber]?.tla ?? `#${racingNumber}`,
        speed,
        teamColour: drivers[racingNumber]?.team_colour ?? null,
      };
    }
  }
  return best;
}

export interface PositionGain {
  racingNumber: string;
  tla: string;
  gain: number;
  teamColour: string | null;
}

// Driver with the single largest positive change from `positionChanges`
// (LiveDashboard's qualifying-grid-vs-current-position diff) — a car that's
// lost places never wins this, so a field with no gainers yet returns null
// rather than surfacing the "least bad" loser.
export function computeMostPositionsGained(
  positionChanges: Record<string, number>,
  drivers: Record<string, DriverInfo>
): PositionGain | null {
  let best: PositionGain | null = null;
  for (const [racingNumber, gain] of Object.entries(positionChanges)) {
    if (gain <= 0) continue;
    if (best === null || gain > best.gain) {
      best = {
        racingNumber,
        tla: drivers[racingNumber]?.tla ?? `#${racingNumber}`,
        gain,
        teamColour: drivers[racingNumber]?.team_colour ?? null,
      };
    }
  }
  return best;
}

export interface SectorBest {
  tla: string;
  time: string;
  teamColour: string | null;
}

export interface DriverPenaltyState {
  investigating: boolean;
  pendingPenalty: string | null;
}

const CAR_NUMBER_RE = /CAR (\d+)/;

export function computeDriverPenaltyStates(
  race_control: RaceControlMessage[]
): Record<string, DriverPenaltyState> {
  const states: Record<string, DriverPenaltyState> = {};
  const stateFor = (num: string): DriverPenaltyState =>
    states[num] ?? (states[num] = { investigating: false, pendingPenalty: null });
  for (const msg of race_control) {
    const text = String(msg?.Message ?? "").toUpperCase();
    const m = CAR_NUMBER_RE.exec(text);
    if (!m) continue;
    const s = stateFor(m[1]);
    if (/INVESTIGATION CLOSED|NO FURTHER ACTION/.test(text)) {
      s.investigating = false;
    } else if (/UNDER INVESTIGATION|WILL BE INVESTIGATED/.test(text) && !/AFTER THE RACE/.test(text)) {
      s.investigating = true;
    }
    if (/PENALTY SERVED|SERVES \d+ SECOND/.test(text)) {
      s.pendingPenalty = null;
      continue;
    }
    const seconds = /TIME PENALTY\s*-\s*(\d+)\s*SECONDS?/.exec(text) ?? /(\d+)\s*SECOND TIME PENALTY/.exec(text);
    if (seconds) {
      s.pendingPenalty = `${seconds[1]}s`;
    } else if (/STOP (AND|-)GO PENALTY/.test(text)) {
      s.pendingPenalty = "stop-go";
    } else if (/DRIVE-?THROUGH PENALTY/.test(text)) {
      s.pendingPenalty = "drive-through";
    } else if (/DROP \d+ GRID|GRID PENALTY/.test(text)) {
      s.pendingPenalty = "grid";
    }
  }
  return states;
}

// Broadcast convention: each sector index carries its own OverallFastest
// flag (see TimingTower.tsx's sectorClass) — that flag is authoritative
// when present, since it's the backend's own purple-sector designation.
// Only when no driver's sector at that index is flagged do we fall back to
// comparing parsed times ourselves, the same "derive, don't guess" pattern
// as pickBest above.
const SECTOR_COUNT = 3;

export function computeBestSectors(
  timing: Record<string, TimingLine>,
  drivers: Record<string, DriverInfo>
): (SectorBest | null)[] {
  const results: (SectorBest | null)[] = [];

  for (let i = 0; i < SECTOR_COUNT; i++) {
    let flagged: SectorBest | null = null;
    let fallback: SectorBest | null = null;
    let fallbackSeconds = Infinity;

    for (const [racingNumber, line] of Object.entries(timing)) {
      const sector: SectorTime | undefined = line.sectors[i];
      if (!sector?.Value) continue;
      const seconds = parseLapTime(sector.Value);
      if (seconds === null) continue;
      const entry: SectorBest = {
        tla: drivers[racingNumber]?.tla ?? `#${racingNumber}`,
        time: sector.Value.trim(),
        teamColour: drivers[racingNumber]?.team_colour ?? null,
      };
      if (sector.OverallFastest) {
        flagged = entry;
      }
      if (seconds < fallbackSeconds) {
        fallbackSeconds = seconds;
        fallback = entry;
      }
    }

    results.push(flagged ?? fallback);
  }

  return results;
}

// Map F1's TrackStatus into a broadcast flag label + colour. `Status` is a
// numeric code (as a string); we key off it, falling back to the raw
// `Message` text when a code we don't recognise arrives so the panel never
// goes blank on an unmapped state.
export function trackFlag(track: TrackStatusInfo): { label: string; color: string } {
  const status = track.Status ? String(track.Status) : "";
  const map: Record<string, { label: string; color: string }> = {
    "1": { label: "Track Clear", color: "#43b02a" },
    "2": { label: "Yellow Flag", color: "#ffd12e" },
    "4": { label: "Safety Car", color: "#ffd12e" },
    "5": { label: "Red Flag", color: "#da291c" },
    "6": { label: "Virtual SC", color: "#ffd12e" },
    "7": { label: "VSC Ending", color: "#ffd12e" },
  };
  if (map[status]) return map[status];
  if (track.Message) return { label: track.Message, color: "#a3a3a3" };
  return { label: "Standby", color: "#a3a3a3" };
}
