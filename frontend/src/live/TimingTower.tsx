import type { DriverInfo, SectorTime, TimingLine } from "./types";

const TYRE_COLORS: Record<string, string> = {
  SOFT: "#da291c",
  MEDIUM: "#ffd12e",
  HARD: "#f0f0f0",
  INTERMEDIATE: "#43b02a",
  WET: "#0067ad",
};

function tyreColor(compound: string | null): string {
  if (!compound) return "#666666";
  return TYRE_COLORS[compound.toUpperCase()] ?? "#666666";
}

function tyreTextColor(compound: string | null): string {
  const upper = (compound ?? "").toUpperCase();
  return upper === "HARD" || upper === "MEDIUM" ? "#000000" : "#ffffff";
}

// Position sorts numerically. Drivers with no position yet (session hasn't
// gone green, or a non-numeric value) sort after every ranked driver, in
// stable DriverList order (Line) rather than jumping around randomly frame
// to frame.
function comparePosition(
  a: [string, TimingLine],
  b: [string, TimingLine],
  drivers: Record<string, DriverInfo>
): number {
  const posA = a[1].position ? parseInt(a[1].position, 10) : null;
  const posB = b[1].position ? parseInt(b[1].position, 10) : null;
  if (posA !== null && !Number.isNaN(posA) && posB !== null && !Number.isNaN(posB)) return posA - posB;
  if (posA !== null && !Number.isNaN(posA)) return -1;
  if (posB !== null && !Number.isNaN(posB)) return 1;
  const lineA = drivers[a[0]]?.line ?? Number.MAX_SAFE_INTEGER;
  const lineB = drivers[b[0]]?.line ?? Number.MAX_SAFE_INTEGER;
  return lineA - lineB;
}

// Broadcast convention: purple = overall (session) fastest, green =
// personal best, plain white = a normal sector time. This keys off the
// booleans only (handoff §7 decision 4) — the per-segment Status codes are
// an unverified guess and deliberately not used for the primary coloring.
function sectorClass(sector: SectorTime | undefined): string {
  if (!sector || sector.Value === undefined) return "bg-white/10 text-mkbhd-gray";
  if (sector.OverallFastest) return "bg-purple-500 text-white";
  if (sector.PersonalFastest) return "bg-emerald-500 text-black";
  return "bg-white/10 text-white";
}

export interface TimingTowerProps {
  drivers: Record<string, DriverInfo>;
  timing: Record<string, TimingLine>;
  selectedDriver: string | null;
  onSelectDriver: (racingNumber: string) => void;
}

export function TimingTower({ drivers, timing, selectedDriver, onSelectDriver }: TimingTowerProps) {
  const rows = Object.entries(timing).sort((a, b) => comparePosition(a, b, drivers));

  return (
    <div className="mkbhd-card p-0 overflow-hidden bg-white/[0.01]">
      <div className="p-8 border-b border-white/5 bg-mkbhd-red flex justify-between items-center">
        <span className="font-black uppercase italic tracking-tighter text-lg">Running Order</span>
      </div>
      <div className="p-2 max-h-[700px] overflow-y-auto custom-scrollbar">
        {rows.length === 0 && (
          <div className="p-8 text-center text-mkbhd-gray text-xs uppercase tracking-widest">
            Waiting for timing data...
          </div>
        )}
        {rows.map(([racingNumber, line]) => {
          const driver = drivers[racingNumber];
          const isSelected = selectedDriver === racingNumber;
          const teamColour = driver?.team_colour ? driver.team_colour : "#444444";
          return (
            <div
              key={racingNumber}
              onClick={() => onSelectDriver(racingNumber)}
              className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-4 ${
                isSelected ? "bg-mkbhd-red/20 border-l-4 border-mkbhd-red" : "hover:bg-white/[0.03]"
              } ${line.retired ? "opacity-40" : ""}`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-xl font-black text-white/20 w-8 text-right">{line.position ?? "-"}</span>
                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: teamColour }} />
                <div className="min-w-0">
                  <div className="font-black uppercase italic leading-none truncate">
                    {driver?.tla ?? driver?.full_name ?? `#${racingNumber}`}
                  </div>
                  <div className="text-[9px] font-bold text-mkbhd-gray uppercase mt-1 tracking-widest flex items-center gap-2">
                    <span>{line.gap_to_leader || "LEADER"}</span>
                    {line.interval && (
                      <span className={line.catching ? "text-emerald-400" : ""}>INT {line.interval}</span>
                    )}
                    {line.in_pit && <span className="text-mkbhd-red">PIT</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`w-8 h-5 rounded flex items-center justify-center text-[9px] font-bold ${sectorClass(
                        line.sectors[i]
                      )}`}
                    >
                      {line.sectors[i]?.Value ?? "-"}
                    </div>
                  ))}
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black border border-white/20"
                  style={{ backgroundColor: tyreColor(line.tyre_compound), color: tyreTextColor(line.tyre_compound) }}
                  title={line.tyre_compound ?? "unknown"}
                >
                  {line.tyre_compound?.[0] ?? "?"}
                </div>
                <div className="text-[9px] font-mono text-mkbhd-gray w-12 text-right">
                  L{line.stint_laps ?? 0}/{line.pit_count ?? 0}P
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
