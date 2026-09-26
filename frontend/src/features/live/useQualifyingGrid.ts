import { useEffect, useState } from "react";
import type { DriverInfo } from "./types";
import { resolveCircuitKey } from "../../circuits/track";

import { API_BASE } from "../../shared/api/client";

interface QualifyingResult {
  position: string | null;
  family_name: string | null;
}

// Best-effort match of a Jolpica qualifying result to a live-timing driver:
// the feed's `full_name` (e.g. "Max VERSTAPPEN") always contains the
// family name Jolpica gives us, so a case-insensitive substring check is
// enough — there's no shared id between the two data sources to join on.
function matchRacingNumber(familyName: string, drivers: Record<string, DriverInfo>): string | null {
  const needle = familyName.toLowerCase();
  for (const [racingNumber, driver] of Object.entries(drivers)) {
    if (driver.full_name?.toLowerCase().includes(needle)) return racingNumber;
  }
  return null;
}

// Fetches each driver's qualifying grid position for the current race
// weekend, keyed by racing number — used as the position-change baseline
// instead of "first position observed this session" (which only reflects
// overtakes that happen after the app started watching, not the actual
// start of the race). Resolves the circuit from the session/meeting name
// via the same best-effort matching TrackMap uses. Returns {} when the
// circuit can't be resolved, the fetch fails, or no session is live yet —
// callers should fall back to the first-observed-position heuristic.
export function useQualifyingGrid(
  sessionName: string | null,
  drivers: Record<string, DriverInfo>,
  enabled = true
): Record<string, number> {
  const [grid, setGrid] = useState<Record<string, number>>({});

  useEffect(() => {
    const circuitKey = resolveCircuitKey(sessionName);
    if (!enabled || !circuitKey || Object.keys(drivers).length === 0) return;

    let cancelled = false;
    const year = new Date().getFullYear();

    fetch(`${API_BASE}/race-weekend/${circuitKey}?year=${year}&session=quali`)
      .then((res) => res.json())
      .then((data: { results?: QualifyingResult[]; available?: boolean }) => {
        if (cancelled || !data.available || !data.results) return;
        const next: Record<string, number> = {};
        for (const result of data.results) {
          if (!result.family_name || !result.position) continue;
          const racingNumber = matchRacingNumber(result.family_name, drivers);
          if (racingNumber) next[racingNumber] = Number(result.position);
        }
        if (Object.keys(next).length > 0) setGrid(next);
      })
      .catch(() => {
        // Network/parse failure — callers fall back to first-observed position.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionName, enabled, Object.keys(drivers).length]);

  return grid;
}
