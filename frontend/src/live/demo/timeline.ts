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
