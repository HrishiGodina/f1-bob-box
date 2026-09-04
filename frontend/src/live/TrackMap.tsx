import { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import type { DriverInfo, PositionEntry } from "./types";
import { resolveCircuitKey, geoJsonToSvgPath, fallbackTrackPath } from "../circuits/track";
import { CIRCUIT_GEOJSON } from "../circuits";

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Expand-only: once a bound has seen a wider extent, it never shrinks
// back, even if every car currently on track happens to be clustered
// tighter this frame (e.g. bunched up behind a Safety Car). The old
// TrackMap (frontend/src/App.tsx:127, deleted in Task 12) recomputed
// min/max from only the current frame's points, which rescaled — and
// therefore visibly jittered — the whole map every time the on-track
// spread changed. A ref (not state) is deliberate too: updating the
// bounds must never itself trigger a re-render, only new position data
// should.
function expandBounds(prev: Bounds | null, xs: number[], ys: number[]): Bounds {
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (!prev) return { minX, maxX, minY, maxY };
  return {
    minX: Math.min(prev.minX, minX),
    maxX: Math.max(prev.maxX, maxX),
    minY: Math.min(prev.minY, minY),
    maxY: Math.max(prev.maxY, maxY),
  };
}

export interface TrackMapProps {
  drivers: Record<string, DriverInfo>;
  positions: Record<string, PositionEntry>;
  selectedDriver: string | null;
  sessionName: string | null;
}

export function TrackMap({ drivers, positions, selectedDriver, sessionName }: TrackMapProps) {
  const boundsRef = useRef<Bounds | null>(null);

  // Rendered in the same 400x400 viewBox as the dots below, as a decorative
  // backdrop — the GeoJSON projection (aspect-ratio-preserving, centered)
  // and the dots' per-axis stretch-to-fit don't produce pixel-exact
  // registration, and none is attempted here.
  const circuitKey = useMemo(() => resolveCircuitKey(sessionName), [sessionName]);
  const trackPath = useMemo(() => {
    if (circuitKey && CIRCUIT_GEOJSON[circuitKey]) {
      const d = geoJsonToSvgPath(CIRCUIT_GEOJSON[circuitKey], 400, 400, 20);
      return d || fallbackTrackPath(circuitKey);
    }
    return circuitKey ? fallbackTrackPath(circuitKey) : null;
  }, [circuitKey]);

  const points = useMemo(() => {
    const withCoords = Object.entries(positions).filter(
      (entry): entry is [string, PositionEntry & { x: number; y: number }] =>
        typeof entry[1].x === "number" && typeof entry[1].y === "number"
    );
    if (withCoords.length === 0) return [];

    boundsRef.current = expandBounds(
      boundsRef.current,
      withCoords.map(([, p]) => p.x),
      withCoords.map(([, p]) => p.y)
    );
    const bounds = boundsRef.current;
    const rangeX = bounds.maxX - bounds.minX || 1;
    const rangeY = bounds.maxY - bounds.minY || 1;

    return withCoords.map(([racingNumber, p]) => ({
      racingNumber,
      normX: ((p.x - bounds.minX) / rangeX) * 360 + 20,
      normY: ((p.y - bounds.minY) / rangeY) * 360 + 20,
    }));
  }, [positions]);

  return (
    <div className="mkbhd-card relative w-full aspect-square bg-mkbhd-black p-10 overflow-hidden border-white/5">
      <div className="flex items-center gap-3 mb-10">
        <h2 className="text-xs font-black uppercase tracking-[0.3em]">Grid Telemetry</h2>
      </div>
      <div className="relative w-full h-full border border-white/5 rounded-[2rem] bg-mkbhd-studio/50 backdrop-blur-sm">
        <svg className="w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
          {trackPath && (
            <path d={trackPath} stroke="white" strokeOpacity={0.12} strokeWidth={2} fill="none" />
          )}
          {points.map((p) => {
            const driver = drivers[p.racingNumber];
            const isSelected = selectedDriver === p.racingNumber;
            // team_colour already includes the leading '#' (the backend
            // prepends it), so it is used as-is; fall back to white when null.
            const colour = driver?.team_colour ? driver.team_colour : "#ffffff";
            return (
              <motion.g key={p.racingNumber} animate={{ x: p.normX, y: p.normY }} transition={{ duration: 0.8, ease: "linear" }}>
                <circle
                  r={isSelected ? 8 : 5}
                  fill={colour}
                  stroke={isSelected ? "#ffffff" : "none"}
                  strokeWidth={isSelected ? 2 : 0}
                />
                {isSelected && (
                  <circle r="16" stroke={colour} strokeWidth="1" fill="transparent" className="animate-ping opacity-40" />
                )}
                <text y="-12" textAnchor="middle" className="text-[10px] font-black fill-white/60 pointer-events-none uppercase italic">
                  {driver?.tla ?? p.racingNumber}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-mkbhd-gray text-xs uppercase tracking-widest">
          No position data yet
        </div>
      )}
    </div>
  );
}
