// Shared types mirroring backend/livetiming/state.py's LiveSessionState
// derived projections (see docs/superpowers/handoffs/2026-08-17-live-timing-
// signalr-context-transfer.md §7). The backend is the source of truth for
// shape; these types describe what it promises to send, not a separate
// contract we invented independently.

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface DriverInfo {
  racing_number: string;
  tla: string | null;
  full_name: string | null;
  team_name: string | null;
  team_colour: string | null;
  line: number | null;
}

export interface SectorTime {
  Value?: string;
  PersonalFastest?: boolean;
  OverallFastest?: boolean;
}

export interface LapTime {
  Value?: string;
}

export interface TimingLine {
  position: string | null;
  gap_to_leader: string | null;
  interval: string | null;
  catching: boolean;
  sectors: SectorTime[];
  last_lap: LapTime;
  best_lap: LapTime;
  tyre_compound: string | null;
  tyre_is_new: boolean | null;
  stint_laps: number | null;
  pit_count: number | null;
  in_pit: boolean;
  retired: boolean;
  personal_best_lap: LapTime | null;
}

export interface PositionEntry {
  x: number | null;
  y: number | null;
  z: number | null;
  status: string | null;
}

export interface TelemetryChannels {
  rpm: number | null;
  speed: number | null;
  gear: number | null;
  throttle: number | null;
  brake: number | null;
  drs: number | null;
}

// RaceControlMessages, SessionInfo, TrackStatus, and WeatherData are passed
// through by the backend largely as F1 sends them (state.py only reshapes
// DriverList/TimingData*/Position.z/CarData.z into the snake_case types
// above). The handoff and Task 4's fixture only confirm the fields below;
// the index signature keeps these forward-compatible with real F1 payloads
// without claiming a completeness this plan can't verify.
export interface RaceControlMessage {
  Category?: string;
  Message?: string;
  [key: string]: unknown;
}

export interface SessionInfo {
  Meeting?: { Name?: string };
  Type?: string;
  [key: string]: unknown;
}

export interface TrackStatusInfo {
  Status?: string;
  Message?: string;
  [key: string]: unknown;
}

export interface WeatherInfo {
  AirTemp?: string;
  TrackTemp?: string;
  Humidity?: string;
  Rainfall?: string;
  [key: string]: unknown;
}

export interface LiveSnapshot {
  connection_status: ConnectionStatus;
  is_live: boolean;
  session_info: SessionInfo;
  drivers: Record<string, DriverInfo>;
  timing: Record<string, TimingLine>;
  positions: Record<string, PositionEntry>;
  telemetry: Record<string, TelemetryChannels>;
  track_status: TrackStatusInfo;
  race_control: RaceControlMessage[];
  weather: WeatherInfo;
}

// What actually arrives over /ws/live: the backend always sends the
// complete new value for every top-level key it's patching (never a raw
// delta) — see LiveSessionState._derive_patch_for_topic. A LivePatch is
// therefore always a subset of LiveSnapshot's keys, each fully resolved.
export type LivePatch = Partial<LiveSnapshot>;
