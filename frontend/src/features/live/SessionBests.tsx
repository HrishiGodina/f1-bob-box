import type { PositionGain, SessionBests as SessionBestsData, TopSpeed } from "./liveState";

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}

// One callout in the session-bests bar: a thin coloured spine, a quiet
// eyebrow, the headline value, and an optional subline. The accent is the
// only colour that varies between cards, so each stat reads as its own
// thing at a glance.
function Stat({ label, value, sub, accent }: StatProps) {
  return (
    <div className="mkbhd-card p-3 flex items-stretch gap-2 bg-white/1">
      <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} />
      <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-mkbhd-gray">{label}</div>
        <div className="text-lg font-black italic uppercase tracking-tighter leading-tight mt-0.5 truncate" style={{ color: accent }}>
          {value}
        </div>
        {sub && <div className="text-[9px] font-bold uppercase tracking-widest text-mkbhd-gray mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

export interface SessionBestsProps {
  bests: SessionBestsData;
  topSpeed: TopSpeed | null;
  positionGain: PositionGain | null;
}

export function SessionBests({ bests, topSpeed, positionGain }: SessionBestsProps) {
  return (
    <>
      <Stat
        label="Fastest Lap"
        value={bests.fastestLap?.time ?? "—"}
        sub={bests.fastestLap ? bests.fastestLap.tla : "Awaiting first lap"}
        accent={bests.fastestLap?.teamColour ?? "#b45cff"}
      />
      {topSpeed && (
        <Stat
          label="Fastest Pace"
          value={`${topSpeed.speed} KM/H`}
          sub={topSpeed.tla}
          accent={topSpeed.teamColour ?? "#2dd4bf"}
        />
      )}
      {positionGain && (
        <Stat
          label="Most Gained"
          value={`+${positionGain.gain}`}
          sub={positionGain.tla}
          accent={positionGain.teamColour ?? "#43b02a"}
        />
      )}
    </>
  );
}
