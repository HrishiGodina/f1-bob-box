import type { SessionBests as SessionBestsData } from "./liveState";
import type { TrackStatusInfo } from "./types";

// Map F1's TrackStatus into a broadcast flag label + colour. `Status` is a
// numeric code (as a string); we key off it, falling back to the raw
// `Message` text when a code we don't recognise arrives so the panel never
// goes blank on an unmapped state.
function trackFlag(track: TrackStatusInfo): { label: string; color: string } {
  const status = track.Status ? String(track.Status) : "";
  const map: Record<string, { label: string; color: string }> = {
    "1": { label: "Track Clear", color: "#43b02a" },
    "2": { label: "Yellow Flag", color: "#ffd12e" },
    "4": { label: "Safety Car", color: "#ffd12e" },
    "5": { label: "Red Flag", color: "#da291c" },
    "6": { label: "Virtual SC", color: "#ffd12e" },
    "7": { label: "VSC Ending", color: "#ffd12e" },
  };
  if (map[status]) return map[status];
  if (track.Message) return { label: track.Message, color: "#a3a3a3" };
  return { label: "Standby", color: "#a3a3a3" };
}

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
    <div className="mkbhd-card p-6 flex items-stretch gap-4 bg-white/[0.01]">
      <div className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-mkbhd-gray">{label}</div>
        <div className="text-2xl font-black italic uppercase tracking-tighter leading-tight mt-1 truncate" style={{ color: accent }}>
          {value}
        </div>
        {sub && <div className="text-[10px] font-bold uppercase tracking-widest text-mkbhd-gray mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

export interface SessionBestsProps {
  bests: SessionBestsData;
  leaderTla: string | null;
  trackStatus: TrackStatusInfo;
}

export function SessionBests({ bests, leaderTla, trackStatus }: SessionBestsProps) {
  const flag = trackFlag(trackStatus);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      <Stat label="Leader" value={leaderTla ?? "—"} sub="Position 1" accent="#ffffff" />
      <Stat
        label="Fastest Lap"
        value={bests.fastestLap?.time ?? "—"}
        sub={bests.fastestLap ? bests.fastestLap.tla : "Awaiting first lap"}
        accent="#b45cff"
      />
      <Stat
        label="Fastest Pace"
        value={bests.fastestPace?.time ?? "—"}
        sub={bests.fastestPace ? `${bests.fastestPace.tla} · last lap` : "Awaiting first lap"}
        accent="#2dd4bf"
      />
      <Stat label="Track Status" value={flag.label} accent={flag.color} />
    </div>
  );
}
