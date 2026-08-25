import { describe, expect, it } from "vitest";
import { INITIAL_LIVE_STATE, applyLivePatch, computeSessionBests, deriveWsUrl, parseLapTime } from "./liveState";
import type { DriverInfo, TimingLine } from "./types";

function mkLine(overrides: Partial<TimingLine> = {}): TimingLine {
  return {
    position: null,
    gap_to_leader: null,
    interval: null,
    catching: false,
    sectors: [],
    last_lap: {},
    best_lap: {},
    tyre_compound: null,
    tyre_is_new: null,
    stint_laps: null,
    pit_count: null,
    in_pit: false,
    retired: false,
    personal_best_lap: null,
    ...overrides,
  };
}

function mkDriver(tla: string): DriverInfo {
  return { racing_number: "0", tla, full_name: null, team_name: null, team_colour: null, line: null };
}

describe("applyLivePatch", () => {
  it("merges a patch key in without disturbing other keys", () => {
    const next = applyLivePatch(INITIAL_LIVE_STATE, { drivers: { "1": { racing_number: "1", tla: "VER", full_name: null, team_name: null, team_colour: null, line: null } } });
    expect(next.drivers["1"].tla).toBe("VER");
    expect(next.is_live).toBe(false);
    expect(next.timing).toBe(INITIAL_LIVE_STATE.timing); // untouched key, same reference
  });

  it("accumulates keys from separate patches applied in sequence", () => {
    const afterDrivers = applyLivePatch(INITIAL_LIVE_STATE, { drivers: { "1": { racing_number: "1", tla: "VER", full_name: null, team_name: null, team_colour: null, line: null } } });
    const afterTiming = applyLivePatch(afterDrivers, { timing: { "1": { position: "1", gap_to_leader: null, interval: null, catching: false, sectors: [], last_lap: {}, best_lap: {}, tyre_compound: null, tyre_is_new: null, stint_laps: null, pit_count: null, in_pit: false, retired: false, personal_best_lap: null } } });
    expect(afterTiming.drivers["1"].tla).toBe("VER");
    expect(afterTiming.timing["1"].position).toBe("1");
  });

  it("lets a later patch fully replace an earlier value for the same key (shallow, not deep-merged)", () => {
    const live = applyLivePatch(INITIAL_LIVE_STATE, { is_live: true });
    const offlineAgain = applyLivePatch(live, { is_live: false });
    expect(offlineAgain.is_live).toBe(false);
  });

  it("never mutates the state object passed in", () => {
    const before = JSON.stringify(INITIAL_LIVE_STATE);
    applyLivePatch(INITIAL_LIVE_STATE, { is_live: true });
    expect(JSON.stringify(INITIAL_LIVE_STATE)).toBe(before);
  });
});

describe("deriveWsUrl", () => {
  it("derives a ws:// url from a plain http API base", () => {
    expect(deriveWsUrl("http://localhost:8000/api")).toBe("ws://localhost:8000/ws/live");
  });

  it("derives a wss:// url from an https API base", () => {
    expect(deriveWsUrl("https://f1-dashboard-backend.up.railway.app/api")).toBe(
      "wss://f1-dashboard-backend.up.railway.app/ws/live"
    );
  });

  it("tolerates a trailing slash on the API base", () => {
    expect(deriveWsUrl("http://localhost:8000/api/")).toBe("ws://localhost:8000/ws/live");
  });
});

describe("parseLapTime", () => {
  it("parses a minutes:seconds lap time to seconds", () => {
    expect(parseLapTime("1:18.223")).toBeCloseTo(78.223, 3);
  });

  it("parses a bare seconds sector time", () => {
    expect(parseLapTime("28.312")).toBeCloseTo(28.312, 3);
  });

  it("returns null for empty, missing, or malformed input", () => {
    expect(parseLapTime("")).toBeNull();
    expect(parseLapTime("   ")).toBeNull();
    expect(parseLapTime(null)).toBeNull();
    expect(parseLapTime(undefined)).toBeNull();
    expect(parseLapTime("abc")).toBeNull();
    expect(parseLapTime("1::23")).toBeNull();
  });
});

describe("computeSessionBests", () => {
  const drivers = { "1": mkDriver("VER"), "44": mkDriver("HAM"), "16": mkDriver("LEC") };

  it("returns nulls when there is no timing data", () => {
    expect(computeSessionBests({}, {})).toEqual({ fastestLap: null, fastestPace: null });
  });

  it("picks the session's fastest lap, falling back to personal best when no BestLapTime", () => {
    const timing = {
      "1": mkLine({ best_lap: { Value: "1:18.500" }, last_lap: { Value: "1:19.000" } }),
      "44": mkLine({ best_lap: { Value: "1:18.200" }, last_lap: { Value: "1:18.900" } }),
      "16": mkLine({ personal_best_lap: { Value: "1:18.100" }, last_lap: { Value: "1:18.800" } }),
    };
    const { fastestLap } = computeSessionBests(timing, drivers);
    expect(fastestLap?.tla).toBe("LEC");
    expect(fastestLap?.time).toBe("1:18.100");
  });

  it("picks fastest pace from the most recent lap and ignores retired cars", () => {
    const timing = {
      "1": mkLine({ last_lap: { Value: "1:19.000" } }),
      "44": mkLine({ last_lap: { Value: "1:18.900" } }),
      "16": mkLine({ last_lap: { Value: "1:18.100" }, retired: true }),
    };
    const { fastestPace } = computeSessionBests(timing, drivers);
    expect(fastestPace?.tla).toBe("HAM");
    expect(fastestPace?.time).toBe("1:18.900");
  });
});
