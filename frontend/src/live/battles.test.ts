import { describe, expect, it } from "vitest";
import { computeBattles } from "./battles";
import type { TimingLine, DriverInfo } from "./types";

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

describe("computeBattles", () => {
  it("tiers a sub-1.5s gap as live with correct gapSeconds/TLA ordering", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
      "44": mkLine({ position: "2", interval: "+0.8" }),
    };
    const drivers = { "1": mkDriver("VER"), "44": mkDriver("HAM") };

    const battles = computeBattles(timing, drivers);

    expect(battles).toHaveLength(1);
    expect(battles[0]).toMatchObject({
      key: "44-1",
      aheadNumber: "1",
      behindNumber: "44",
      aheadTla: "VER",
      behindTla: "HAM",
      gapSeconds: 0.8,
      tier: "live",
    });
  });

  it("tiers a gap between 1.5s and 5s as approaching", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
      "44": mkLine({ position: "2", interval: "+3.2" }),
    };
    const drivers = { "1": mkDriver("VER"), "44": mkDriver("HAM") };

    const battles = computeBattles(timing, drivers);

    expect(battles).toHaveLength(1);
    expect(battles[0].tier).toBe("approaching");
    expect(battles[0].gapSeconds).toBe(3.2);
  });

  it("excludes gaps beyond the approach band", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
      "44": mkLine({ position: "2", interval: "+6.0" }),
    };
    const drivers = { "1": mkDriver("VER"), "44": mkDriver("HAM") };

    expect(computeBattles(timing, drivers)).toHaveLength(0);
  });

  it("does not throw on a lapped-car interval like '+1 LAP' and excludes it", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
      "44": mkLine({ position: "2", interval: "+1 LAP" }),
    };
    const drivers = { "1": mkDriver("VER"), "44": mkDriver("HAM") };

    expect(() => computeBattles(timing, drivers)).not.toThrow();
    expect(computeBattles(timing, drivers)).toHaveLength(0);
  });

  it("excludes the leader row (null interval)", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
    };
    const drivers = { "1": mkDriver("VER") };

    expect(computeBattles(timing, drivers)).toHaveLength(0);
  });

  it("falls back to '#<number>' label when a driver entry is missing", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
      "44": mkLine({ position: "2", interval: "+0.5" }),
    };
    const drivers = { "1": mkDriver("VER") }; // no entry for "44"

    const battles = computeBattles(timing, drivers);

    expect(battles).toHaveLength(1);
    expect(battles[0].behindTla).toBe("#44");
    expect(battles[0].aheadTla).toBe("VER");
  });

  it("returns multiple simultaneous battles across both tiers, sorted ascending by gapSeconds", () => {
    const timing = {
      "1": mkLine({ position: "1", interval: null }),
      "44": mkLine({ position: "2", interval: "+3.2" }),
      "16": mkLine({ position: "3", interval: "+0.8" }),
      "63": mkLine({ position: "4", interval: "+6.0" }), // excluded, beyond band
      "4": mkLine({ position: "5", interval: "+1.5" }),
    };
    const drivers = {
      "1": mkDriver("VER"),
      "44": mkDriver("HAM"),
      "16": mkDriver("LEC"),
      "63": mkDriver("RUS"),
      "4": mkDriver("NOR"),
    };

    const battles = computeBattles(timing, drivers);

    expect(battles).toHaveLength(3);
    expect(battles.map((b) => b.gapSeconds)).toEqual([0.8, 1.5, 3.2]);
    expect(battles.map((b) => b.tier)).toEqual(["live", "live", "approaching"]);
    expect(battles.map((b) => b.key)).toEqual(["16-44", "4-63", "44-1"]);
  });
});
