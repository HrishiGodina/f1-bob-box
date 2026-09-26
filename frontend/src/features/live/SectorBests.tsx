import type { SectorBest } from "./liveState";

const ACCENTS = ["#b45cff", "#2dd4bf", "#facc15"];

export interface SectorBestsProps {
  sectors: (SectorBest | null)[];
}

// Sits alongside Fastest Lap / Fastest Pace in the same single-line row —
// same card language, one column per sector, so the whole row reads as a
// single "best times" strip rather than two unrelated widgets.
export function SectorBests({ sectors }: SectorBestsProps) {
  return (
    <>
      {sectors.map((best, index) => {
        const accent = best?.teamColour ?? ACCENTS[index];
        return (
          <div key={index} className="mkbhd-card p-3 flex items-stretch gap-2 bg-white/1">
            <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} />
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-mkbhd-gray">
                Best Sector {index + 1}
              </div>
              <div
                className="text-lg font-black italic uppercase tracking-tighter leading-tight mt-0.5 truncate"
                style={{ color: accent }}
              >
                {best?.time ?? "—"}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-mkbhd-gray mt-0.5 truncate">
                {best?.tla ?? "Awaiting data"}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
