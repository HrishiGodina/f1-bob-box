import { useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "./types";
import { INITIAL_LIVE_STATE, applyLivePatch } from "./liveState";
import { useLiveTimingSocket } from "./useLiveTimingSocket";
import { DEMO_TIMELINE, frameAt } from "./demo/timeline";

const DEMO_TICK_MS = 500;

export interface LiveSnapshotState {
  snapshot: LiveSnapshot;
  // Whether there's real data behind `snapshot` yet — either demo data
  // (available immediately once demo is on) or at least one message
  // actually received from the backend over /ws/live. False only in the
  // narrow window before either source has produced anything, so callers
  // (e.g. shouldShowNoSessionPanel) don't mistake "haven't heard yet" for
  // a genuine "no session" report.
  hasSnapshot: boolean;
}

// Chooses the snapshot source: the real socket when demo is off, or the
// client-side demo player when it's on — LiveDashboard consumes a single
// snapshot either way (spec §6's "one reducer, one snapshot"). The socket
// is only ever enabled when demo is off, so entering demo mode closes the
// real connection instead of running both at once.
export function useLiveSnapshot(demoActive: boolean): LiveSnapshotState {
  const { snapshot: socketSnapshot, hasReceivedData } = useLiveTimingSocket(!demoActive);
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

  return demoActive
    ? { snapshot: demoSnapshot, hasSnapshot: true }
    : { snapshot: socketSnapshot, hasSnapshot: hasReceivedData };
}
