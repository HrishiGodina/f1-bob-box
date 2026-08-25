import type { DriverInfo, SectorTime, TimingLine } from "./types";

// Official F1 compound colours, as the broadcast timing tower draws them:
// red soft, yellow medium, white hard, green intermediate, blue wet.
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

// The broadcast tyre marker: a compound-coloured ring with the compound's
// initial (S/M/H/I/W) inside in the same colour — exactly how the world-feed
// timing tower badges a car's current rubber — with its age in laps beside
// it. Ring-and-letter (not a filled disc) keeps even the near-white HARD
// readable on the dark studio background.
function TyreBadge({ compound, age }: { compound: string | null; age: number | null }) {
  const color = tyreColor(compound);
  const letter = compound ? compound[0].toUpperCase() : "?";
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
        style={{ border: `2px solid ${color}`, color }}
        title={compound ? `${compound} · ${age ?? 0} laps` : "Compound unknown"}
      >
        {letter}
      </div>
      <span className="text-[11px] font-mono text-mkbhd-gray tabular-nums">{age ?? 0}L</span>
    </div>
  );
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
  if (!sector || sector.Value === undefined) return "bg-white/[0.03] text-mkbhd-gray/50";
  if (sector.OverallFastest) return "bg-[#b45cff] text-white";
  if (sector.PersonalFastest) return "bg-emerald-500 text-black";
  return "bg-white/10 text-white";
}

// Shared column template so the header labels and every data row align to
// the same grid. Wrapped in a horizontal scroller for narrow viewports.
const ROW_GRID =
  "grid grid-cols-[1.75rem_minmax(5rem,1.2fr)_5.5rem_2.75rem_5rem_5.25rem_8rem_5.25rem] items-center gap-2";

export interface TimingTowerProps {
  drivers: Record<string, DriverInfo>;
  timing: Record<string, TimingLine>;
  selectedDriver: string | null;
  onSelectDriver: (racingNumber: string) => void;
  // Racing numbers of the session's fastest lap / fastest current pace, so
  // those cells can be tinted to match the Session Bests bar above.
  fastestLapDriver: string | null;
  fastestPaceDriver: string | null;
}

export function TimingTower({
  drivers,
  timing,
  selectedDriver,
  onSelectDriver,
  fastestLapDriver,
  fastestPaceDriver,
}: TimingTowerProps) {
  const rows = Object.entries(timing).sort((a, b) => comparePosition(a, b, drivers));

  return (
    <div className="mkbhd-card p-0 overflow-hidden bg-white/[0.01]">
      <div className="px-8 py-6 bg-mkbhd-red flex justify-between items-center">
        <span className="font-black uppercase italic tracking-tighter text-lg">Running Order</span>
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{rows.length} Cars</span>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[40rem]">
          <div className={`${ROW_GRID} px-6 py-3 border-b border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-mkbhd-gray`}>
            <span className="text-right">Pos</span>
            <span>Driver</span>
            <span>Tyre</span>
            <span className="text-center">Stp</span>
            <span>Gap</span>
            <span>Last</span>
            <span>Sectors</span>
            <span>Best</span>
          </div>

          <div className="max-h-[720px] overflow-y-auto custom-scrollbar p-2">
            {rows.length === 0 && (
              <div className="p-8 text-center text-mkbhd-gray text-xs uppercase tracking-widest">
                Waiting for timing data...
              </div>
            )}
            {rows.map(([racingNumber, line]) => {
              const driver = drivers[racingNumber];
              const isSelected = selectedDriver === racingNumber;
              const teamColour = driver?.team_colour ? driver.team_colour : "#444444";
              const isFastestLap = fastestLapDriver === racingNumber;
              const isFastestPace = fastestPaceDriver === racingNumber;
              return (
                <div
                  key={racingNumber}
                  onClick={() => onSelectDriver(racingNumber)}
                  className={`${ROW_GRID} px-4 py-3 rounded-2xl cursor-pointer transition-colors ${
                    isSelected ? "bg-mkbhd-red/15" : "hover:bg-white/[0.03]"
                  } ${line.retired ? "opacity-40" : ""}`}
                >
                  <span className="text-lg font-black text-white/30 text-right tabular-nums">{line.position ?? "-"}</span>

                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: teamColour }} />
                    <div className="min-w-0">
                      <div className="font-black uppercase italic leading-none truncate flex items-center gap-2">
                        {driver?.tla ?? `#${racingNumber}`}
                        {line.in_pit && (
                          <span className="text-[8px] font-black text-mkbhd-red border border-mkbhd-red/50 rounded px-1 py-0.5 not-italic tracking-widest">
                            PIT
                          </span>
                        )}
                        {line.retired && (
                          <span className="text-[8px] font-black text-mkbhd-gray border border-white/20 rounded px-1 py-0.5 not-italic tracking-widest">
                            OUT
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-bold text-mkbhd-gray uppercase truncate tracking-wide mt-1">
                        {driver?.team_name ?? "—"}
                      </div>
                    </div>
                  </div>

                  <TyreBadge compound={line.tyre_compound} age={line.stint_laps} />

                  <span className="text-sm font-black text-white/80 text-center tabular-nums">{line.pit_count ?? 0}</span>

                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-white tabular-nums truncate">{line.gap_to_leader || "LEADER"}</div>
                    {line.interval && (
                      <div className={`text-[9px] font-mono tabular-nums truncate ${line.catching ? "text-emerald-400" : "text-mkbhd-gray"}`}>
                        {line.interval}
                      </div>
                    )}
                  </div>

                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: isFastestPace ? "#2dd4bf" : "#e5e5e5" }}
                  >
                    {line.last_lap?.Value || "—"}
                  </span>

                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 h-6 rounded flex items-center justify-center text-[9px] font-bold tabular-nums ${sectorClass(
                          line.sectors[i]
                        )}`}
                      >
                        {line.sectors[i]?.Value ?? "·"}
                      </div>
                    ))}
                  </div>

                  <span
                    className="text-[11px] font-mono tabular-nums font-black"
                    style={{ color: isFastestLap ? "#b45cff" : "#e5e5e5" }}
                  >
                    {line.best_lap?.Value || line.personal_best_lap?.Value || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
