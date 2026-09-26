import { parseLapTime } from "./liveState";
import type { Battle } from "./battles";
import type { TelemetryChannels, TimingLine } from "./types";

export interface BattleWatchListProps {
  battles: Battle[];
  telemetry: Record<string, TelemetryChannels>;
  timing: Record<string, TimingLine>;
}

export function BattleWatchList({ battles, telemetry, timing }: BattleWatchListProps) {
  const live = battles.filter((b) => b.tier === "live");
  if (live.length === 0) return null;

  return (
    <div className="panel p-6 space-y-4">
      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Battle Watch</div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {live.map((battle) => {
          const behindSpeed = telemetry[battle.behindNumber]?.speed;
          const aheadSpeed = telemetry[battle.aheadNumber]?.speed;
          const behindLap = timing[battle.behindNumber]?.last_lap?.Value || null;
          const aheadLap = timing[battle.aheadNumber]?.last_lap?.Value || null;
          const behindSecs = parseLapTime(behindLap);
          const aheadSecs = parseLapTime(aheadLap);
          const behindFaster = behindSecs !== null && (aheadSecs === null || behindSecs < aheadSecs);
          const aheadFaster = aheadSecs !== null && (behindSecs === null || aheadSecs < behindSecs);
          return (
            <div key={battle.key} className="flex items-center justify-between gap-3 text-xs bg-white/5 rounded-lg px-3 py-2">
              <span className="font-black">
                P{battle.behindPosition} {battle.behindTla}
              </span>
              <span className={`font-mono tabular-nums ${behindFaster ? "text-emerald-400 font-black" : "text-muted"}`}>
                {behindLap ?? "—"}
              </span>
              <span className="text-muted">{behindSpeed ?? "--"} KM/H</span>
              <span className="text-accent font-black">{battle.gapSeconds.toFixed(1)}s</span>
              <span className="text-muted">{aheadSpeed ?? "--"} KM/H</span>
              <span className={`font-mono tabular-nums ${aheadFaster ? "text-emerald-400 font-black" : "text-muted"}`}>
                {aheadLap ?? "—"}
              </span>
              <span className="font-black">
                P{battle.aheadPosition} {battle.aheadTla}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
