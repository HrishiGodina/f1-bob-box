import type { Battle } from "./battles";
import type { TelemetryChannels } from "./types";

export interface BattleWatchListProps {
  battles: Battle[];
  telemetry: Record<string, TelemetryChannels>;
}

export function BattleWatchList({ battles, telemetry }: BattleWatchListProps) {
  const live = battles.filter((b) => b.tier === "live");
  if (live.length === 0) return null;

  return (
    <div className="mkbhd-card p-6 space-y-4">
      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-mkbhd-red">Battle Watch</div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {live.map((battle) => {
          const behindSpeed = telemetry[battle.behindNumber]?.speed;
          const aheadSpeed = telemetry[battle.aheadNumber]?.speed;
          return (
            <div key={battle.key} className="flex items-center justify-between gap-3 text-xs bg-white/5 rounded-lg px-3 py-2">
              <span className="font-black">{battle.behindTla}</span>
              <span className="text-mkbhd-gray">{behindSpeed ?? "--"} KM/H</span>
              <span className="text-mkbhd-red font-black">{battle.gapSeconds.toFixed(1)}s</span>
              <span className="text-mkbhd-gray">{aheadSpeed ?? "--"} KM/H</span>
              <span className="font-black">{battle.aheadTla}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
