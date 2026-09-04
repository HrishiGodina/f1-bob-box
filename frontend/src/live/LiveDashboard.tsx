import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { computeSessionBests } from "./liveState";
import { shouldShowNoSessionPanel } from "./liveView";
import { computeBattles } from "./battles";
import { SessionBests } from "./SessionBests";
import { TimingTower } from "./TimingTower";
import { TrackMap } from "./TrackMap";
import { RaceControlTicker } from "./RaceControlTicker";
import { BattleWatchList } from "./BattleWatchList";
import { WingBotAlerts } from "./WingBotAlerts";
import { DriverTelemetryPanel } from "./DriverTelemetryPanel";

export interface LiveDashboardProps {
  demoActive: boolean;
  onToggleDemo: () => void;
}

export function LiveDashboard({ demoActive, onToggleDemo }: LiveDashboardProps) {
  const { snapshot, hasSnapshot } = useLiveSnapshot(demoActive);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const sessionName = snapshot.session_info.Meeting?.Name ?? "ON AIR";
  const isReconnecting = snapshot.connection_status === "reconnecting";
  const showFeedNotice = snapshot.connection_status !== "connected" && !demoActive;
  const showNoSessionPanel = shouldShowNoSessionPanel(snapshot.is_live, demoActive, hasSnapshot);

  const bests = useMemo(
    () => computeSessionBests(snapshot.timing, snapshot.drivers),
    [snapshot.timing, snapshot.drivers]
  );

  const battles = useMemo(
    () => computeBattles(snapshot.timing, snapshot.drivers),
    [snapshot.timing, snapshot.drivers]
  );

  // The current leader is whoever holds P1 in the timing map — derived, not
  // tracked separately.
  const leaderTla = useMemo(() => {
    const leader = Object.entries(snapshot.timing).find(([, line]) => line.position === "1");
    if (!leader) return null;
    return snapshot.drivers[leader[0]]?.tla ?? `#${leader[0]}`;
  }, [snapshot.timing, snapshot.drivers]);

  return (
    <div className="space-y-6" id="live-dashboard">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5">
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4"
        >
          <div className="text-mkbhd-red font-black uppercase tracking-[0.5em] text-xs flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-mkbhd-red animate-pulse" /> Live Satellite Feed
          </div>
          <h1 className="text-2xl md:text-4xl tracking-tight leading-none">{sessionName}</h1>
        </motion.div>
        <div className="flex items-center gap-3">
          {demoActive && (
            <div className="px-4 py-2 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest text-white">
              DEMO — SIMULATED DATA
            </div>
          )}
          {showFeedNotice && (
            <div className="px-4 py-2 bg-mkbhd-red/10 border border-mkbhd-red/40 rounded-full text-[10px] font-black uppercase tracking-widest text-mkbhd-red">
              {isReconnecting ? "Reconnecting to live feed..." : "Connecting to live feed..."}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleDemo}
            className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-mkbhd-gray hover:text-white transition-all cursor-pointer"
          >
            {demoActive ? "Stop Demo" : "Start Demo"}
          </button>
        </div>
      </header>

      {showNoSessionPanel ? (
        <div className="flex flex-col items-center justify-center gap-8 py-32 border border-white/10 rounded-mkbhd bg-white/[0.02] text-center">
          <div className="text-3xl font-black italic uppercase tracking-tight">No Live Session</div>
          <p className="text-mkbhd-gray max-w-md">
            The live feed has nothing to show right now — no session is running. Start a simulated
            demo to preview the dashboard with moving data.
          </p>
          <button
            type="button"
            onClick={onToggleDemo}
            className="mkbhd-btn-primary px-10 py-4 text-[11px] font-black uppercase tracking-widest"
          >
            Start Demo
          </button>
        </div>
      ) : (
        <>
          <RaceControlTicker messages={snapshot.race_control} />

          <SessionBests bests={bests} leaderTla={leaderTla} trackStatus={snapshot.track_status} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <TimingTower
                drivers={snapshot.drivers}
                timing={snapshot.timing}
                selectedDriver={selectedDriver}
                onSelectDriver={setSelectedDriver}
                fastestLapDriver={bests.fastestLap?.racingNumber ?? null}
                fastestPaceDriver={bests.fastestPace?.racingNumber ?? null}
              />
            </div>

            <div className="lg:col-span-4 space-y-6">
              <TrackMap
                drivers={snapshot.drivers}
                positions={snapshot.positions}
                selectedDriver={selectedDriver}
                sessionName={sessionName}
              />
              <BattleWatchList battles={battles} telemetry={snapshot.telemetry} />
            </div>
          </div>

          <div id="telemetry">
            <DriverTelemetryPanel drivers={snapshot.drivers} telemetry={snapshot.telemetry} selectedDriver={selectedDriver} />
          </div>
        </>
      )}

      <WingBotAlerts battles={battles} />
    </div>
  );
}
