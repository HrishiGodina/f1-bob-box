import { describe, expect, it } from "vitest";
import { INITIAL_LIVE_STATE, applyLivePatch, deriveWsUrl } from "./liveState";

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
