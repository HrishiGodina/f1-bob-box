import type { DriverInfo, TelemetryChannels } from "./types";

export interface CompactTelemetryProps {
  drivers: Record<string, DriverInfo>;
  telemetry: Record<string, TelemetryChannels>;
  selectedDriver: string | null;
}

// A condensed readout for the sidebar column (right of the timing tower,
// just below the track layout) — same channels as DriverTelemetryPanel's
// full view, sized to sit under TrackMap without pushing BattleWatchList
// or the page height around.
export function CompactTelemetry({ drivers, telemetry, selectedDriver }: CompactTelemetryProps) {
  const channels = selectedDriver ? telemetry[selectedDriver] : undefined;
  const driver = selectedDriver ? drivers[selectedDriver] : undefined;

  if (!selectedDriver) {
    return (
      <div className="panel p-4 text-center text-[10px] font-black uppercase tracking-widest text-muted">
        Select a driver to view telemetry
      </div>
    );
  }

  const speed = channels?.speed ?? 0;
  const rpm = channels?.rpm ?? 0;
  const gear = channels?.gear ?? 0;
  const throttle = channels?.throttle ?? 0;
  const brake = channels?.brake ?? 0;

  return (
    <div className="panel p-4 space-y-4">
      <div className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
        Tracking: <span className="text-white italic">{driver?.tla ?? `#${selectedDriver}`}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-lg py-3">
          <div className="text-xl font-black italic leading-none">{speed}</div>
          <div className="text-[9px] font-bold text-muted uppercase tracking-widest mt-1">Km/h</div>
        </div>
        <div className="bg-white/5 rounded-lg py-3">
          <div className="text-xl font-black italic leading-none text-accent">{rpm}</div>
          <div className="text-[9px] font-bold text-muted uppercase tracking-widest mt-1">RPM</div>
        </div>
        <div className="bg-white/5 rounded-lg py-3">
          <div className="text-xl font-black italic leading-none">{gear}</div>
          <div className="text-[9px] font-bold text-muted uppercase tracking-widest mt-1">Gear</div>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-[9px] font-black text-muted uppercase mb-1 flex justify-between tracking-widest">
            <span>Throttle</span>
            <span className="text-white italic">{throttle}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div style={{ width: `${throttle}%` }} className="h-full bg-white rounded-full transition-all duration-300" />
          </div>
        </div>
        <div>
          <div className="text-[9px] font-black text-muted uppercase mb-1 flex justify-between tracking-widest">
            <span>Brake</span>
            <span className="text-accent italic">{brake}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div style={{ width: `${brake}%` }} className="h-full bg-accent rounded-full transition-all duration-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
