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

  it("every driver's team_colour is a CSS-valid #RRGGBB (leading # required)", () => {
    for (const frame of DEMO_TIMELINE.frames) {
      for (const driver of Object.values(frame.snapshot.drivers)) {
        expect(driver.team_colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
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
