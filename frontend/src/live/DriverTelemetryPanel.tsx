import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { AreaChart, Area, YAxis, ResponsiveContainer } from "recharts";
import type { DriverInfo, TelemetryChannels } from "./types";
import { CircularGauge } from "../ui/CircularGauge";

const SPEED_TRACE_LENGTH = 50;

export interface DriverTelemetryPanelProps {
  drivers: Record<string, DriverInfo>;
  telemetry: Record<string, TelemetryChannels>;
  selectedDriver: string | null;
}

// The backend's telemetry projection (LiveSessionState) is a per-driver
// snapshot of only the latest CarData.z sample — it does not keep history
// (a backend-owned time series would be a second SSOT for the same data,
// which is out of scope). The short speed trace below is therefore
// deliberately local, ephemeral UI state, not derived from any backend
// history: it appends the latest sample each time telemetry changes and
// resets whenever the selected driver changes, capped at
// SPEED_TRACE_LENGTH samples. `drs` exists on TelemetryChannels but isn't
// rendered here — its raw code isn't decoded into an on/off signal
// anywhere in this feature (see handoff §3.6), so displaying it would
// mean inventing an interpretation this plan never verified.
export function DriverTelemetryPanel({ drivers, telemetry, selectedDriver }: DriverTelemetryPanelProps) {
  const [speedTrace, setSpeedTrace] = useState<{ speed: number }[]>([]);

  const channels = selectedDriver ? telemetry[selectedDriver] : undefined;
  const driver = selectedDriver ? drivers[selectedDriver] : undefined;
  const speed = channels?.speed ?? 0;
  const rpm = channels?.rpm ?? 0;
  const gear = channels?.gear ?? 0;
  const throttle = channels?.throttle ?? 0;
  const brake = channels?.brake ?? 0;

  useEffect(() => {
    setSpeedTrace([]);
  }, [selectedDriver]);

  useEffect(() => {
    if (!channels) return;
    setSpeedTrace((prev) => [...prev.slice(-(SPEED_TRACE_LENGTH - 1)), { speed: channels.speed ?? 0 }]);
  }, [channels]);

  if (!selectedDriver) {
    return (
      <div className="mkbhd-card p-16 flex flex-col items-center justify-center gap-4 text-center min-h-[300px] bg-white/[0.01]">
        <Activity size={32} className="text-mkbhd-gray" />
        <div className="text-mkbhd-gray text-xs uppercase tracking-widest">
          Select a driver from Running Order to view telemetry
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.3em]">
        Tracking: <span className="text-white italic">{driver?.tla ?? `#${selectedDriver}`}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <CircularGauge value={speed} max={360} label="Velocity" color="#ffffff" unit="KM/H" />
        <CircularGauge value={rpm} max={12000} label="Engine State" color="#cc0000" unit="RPM" />
        <div className="mkbhd-card p-10 flex flex-col justify-center items-center bg-mkbhd-red/5">
          <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.4em] mb-6 flex items-center gap-2">
            <Activity size={14} className="text-mkbhd-red" /> Active Ratio
          </div>
          <div className="text-[10rem] font-black italic text-white leading-none">{gear}</div>
          <div className="text-xs font-black uppercase text-mkbhd-red tracking-widest mt-4 italic">GEAR_LOCKED</div>
        </div>
      </div>

      <div className="mkbhd-card p-10 flex flex-col min-h-[300px]">
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3">
            <Activity size={16} className="text-mkbhd-red" /> Performance Trace
          </h2>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={speedTrace}>
              <defs>
                <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#cc0000" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#cc0000" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="speed" stroke="#cc0000" fill="url(#telemetryGrad)" strokeWidth={4} isAnimationActive={false} />
              <YAxis domain={["auto", "auto"]} hide />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mkbhd-card p-12 h-48 bg-white/[0.01] flex items-center justify-around gap-12">
        <div className="flex-1">
          <div className="text-[10px] font-black text-mkbhd-gray uppercase mb-4 flex justify-between tracking-widest">
            <span>THROTTLE</span>
            <span className="text-white italic">{throttle}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
            <div style={{ width: `${throttle}%` }} className="h-full bg-white rounded-full transition-all duration-300" />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-black text-mkbhd-gray uppercase mb-4 flex justify-between tracking-widest">
            <span>BRAKE_SYSTEM</span>
            <span className="text-mkbhd-red italic">{brake}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
            <div style={{ width: `${brake}%` }} className="h-full bg-mkbhd-red rounded-full transition-all duration-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
