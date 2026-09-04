import type { TimingLine, DriverInfo } from "./types";

export type BattleTier = "approaching" | "live";

export interface Battle {
  key: string; // stable pair id, e.g. "44-1" (behindNumber-aheadNumber)
  aheadNumber: string;
  behindNumber: string;
  aheadTla: string;
  behindTla: string;
  gapSeconds: number;
  tier: BattleTier;
}

const APPROACH_MAX_SECONDS = 5.0;
const LIVE_MAX_SECONDS = 1.5;
const GAP_PATTERN = /^\+?(\d+(?:\.\d+)?)$/;

function parseIntervalSeconds(interval: string | null): number | null {
  if (!interval) return null;
  const match = GAP_PATTERN.exec(interval.trim());
  if (!match) return null; // rejects "+1 LAP", "LAP 3", etc.
  return Number.parseFloat(match[1]);
}

/**
 * All battles within APPROACH_MAX_SECONDS of the car directly ahead,
 * tiered into "approaching" (WingBot alert) vs "live" (Battle Watch list).
 * `interval` is the gap-to-car-ahead field already computed upstream —
 * this only filters, tiers, and labels it. Sorted closest-gap first.
 */
export function computeBattles(
  timing: Record<string, TimingLine>,
  drivers: Record<string, DriverInfo>
): Battle[] {
  const byPosition = Object.entries(timing)
    .filter(([, line]) => line.position != null)
    .sort((a, b) => Number(a[1].position) - Number(b[1].position));

  const battles: Battle[] = [];
  for (let i = 1; i < byPosition.length; i++) {
    const [behindNumber, behindLine] = byPosition[i];
    const gapSeconds = parseIntervalSeconds(behindLine.interval);
    if (gapSeconds === null || gapSeconds > APPROACH_MAX_SECONDS) continue;

    const [aheadNumber] = byPosition[i - 1];
    const aheadTla = drivers[aheadNumber]?.tla ?? `#${aheadNumber}`;
    const behindTla = drivers[behindNumber]?.tla ?? `#${behindNumber}`;
    const tier: BattleTier = gapSeconds <= LIVE_MAX_SECONDS ? "live" : "approaching";
    battles.push({
      key: `${behindNumber}-${aheadNumber}`,
      aheadNumber,
      behindNumber,
      aheadTla,
      behindTla,
      gapSeconds,
      tier,
    });
  }

  return battles.sort((a, b) => a.gapSeconds - b.gapSeconds);
}
