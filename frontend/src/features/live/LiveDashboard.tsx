import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLiveSnapshot } from "./useLiveSnapshot";
import {
  computeSessionBests,
  computeBestSectors,
  computeTopSpeed,
  computeMostPositionsGained,
  computeDriverPenaltyStates,
  trackFlag,
} from "./liveState";
import type { TopSpeed } from "./liveState";
import { shouldShowNoSessionPanel } from "./liveView";
import { computeBattles } from "./battles";
import { useQualifyingGrid } from "./useQualifyingGrid";
import { startF1AuthRefresh, useF1AuthStatus } from "./useF1AuthStatus";
import { SessionBests } from "./SessionBests";
import { SectorBests } from "./SectorBests";
import { TimingTower } from "./TimingTower";
import { TrackMap } from "./TrackMap";
import { RaceControlTicker } from "./RaceControlTicker";
import { BattleWatchList } from "./BattleWatchList";
import { CompactTelemetry } from "./CompactTelemetry";

export interface LiveDashboardProps {
  demoActive: boolean;
  onToggleDemo: () => void;
}

export function LiveDashboard({ demoActive, onToggleDemo }: LiveDashboardProps) {
  const { snapshot, hasSnapshot } = useLiveSnapshot(demoActive);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sessionName = snapshot.session_info.Meeting?.Name ?? "ON AIR";
  const isReconnecting = snapshot.connection_status === "reconnecting";
  const showFeedNotice = snapshot.connection_status !== "connected" && !demoActive;
  const showNoSessionPanel = shouldShowNoSessionPanel(snapshot.is_live, demoActive, hasSnapshot);

  const bests = useMemo(
    () => computeSessionBests(snapshot.timing, snapshot.drivers),
    [snapshot.timing, snapshot.drivers]
  );

  const sectorBests = useMemo(
    () => computeBestSectors(snapshot.timing, snapshot.drivers),
    [snapshot.timing, snapshot.drivers]
  );

  const topSpeedRef = useRef<TopSpeed | null>(null);
  const topSpeed = useMemo(() => {
    const current = computeTopSpeed(snapshot.telemetry, snapshot.drivers);
    if (current && (!topSpeedRef.current || current.speed > topSpeedRef.current.speed)) {
      topSpeedRef.current = current;
    }
    return topSpeedRef.current;
  }, [snapshot.telemetry, snapshot.drivers]);

  const battles = useMemo(
    () => computeBattles(snapshot.timing, snapshot.drivers),
    [snapshot.timing, snapshot.drivers]
  );

  const flag = trackFlag(snapshot.track_status);

  const driverFlags = useMemo(
    () => computeDriverPenaltyStates(snapshot.race_control),
    [snapshot.race_control]
  );

  // Position-change baseline: the actual starting grid (qualifying
  // classification) when resolvable, falling back to the backend's
  // server-captured first-observed positions. Demo mode skips the fetch so
  // the demo timeline's own starting_grid stays the baseline.
  const qualifyingGrid = useQualifyingGrid(sessionName, snapshot.drivers, !demoActive);

  const f1Auth = useF1AuthStatus(!demoActive);

  const renewF1Token = async () => {
    const url = await startF1AuthRefresh();
    if (url) window.open(url, "_blank");
  };

  const positionChanges = useMemo(() => {
    const changes: Record<string, number> = {};
    for (const [racingNumber, line] of Object.entries(snapshot.timing)) {
      const start = qualifyingGrid[racingNumber] ?? snapshot.starting_grid[racingNumber];
      if (!start || !line.position) continue;
      changes[racingNumber] = Number(start) - Number(line.position);
    }
    return changes;
  }, [snapshot.timing, snapshot.starting_grid, qualifyingGrid]);

  const positionGain = useMemo(
    () => computeMostPositionsGained(positionChanges, snapshot.drivers),
    [positionChanges, snapshot.drivers]
  );

  return (
    <div className="space-y-6" id="live-dashboard">
      <header
        className={`sticky top-0 z-30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5 transition-all duration-300 ${
          scrolled ? "bg-mkbhd-black/85 backdrop-blur-xl px-4 py-2" : ""
        }`}
      >
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex items-center transition-all duration-300 ${scrolled ? "gap-3" : "gap-4"}`}
        >
          <h1
            className={`tracking-tight leading-none transition-all duration-300 ${
              scrolled ? "text-sm md:text-lg" : "text-2xl md:text-4xl"
            }`}
          >
            {sessionName}
          </h1>
          <div
            className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.25em] flex items-center gap-2 shrink-0"
            style={{ backgroundColor: `${flag.color}1a`, border: `1px solid ${flag.color}66`, color: flag.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: flag.color }} />
            {flag.label}
          </div>
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
        <div className="flex flex-col items-center justify-center gap-8 py-32 border border-white/10 rounded-mkbhd bg-white/2 text-center">
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
          {f1Auth.needsRefresh && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-3 rounded-mkbhd border border-mkbhd-red/40 bg-mkbhd-red/10">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-mkbhd-red">
                {f1Auth.validUntil
                  ? "F1TV token expiring soon — driver tracking & telemetry will stop without it"
                  : "F1TV token missing — driver tracking & telemetry are disabled"}
              </span>
              <button
                type="button"
                onClick={renewF1Token}
                className="px-4 py-2 rounded-full bg-mkbhd-red text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity cursor-pointer shrink-0"
              >
                Renew token
              </button>
            </div>
          )}
          <RaceControlTicker messages={snapshot.race_control} />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <SessionBests bests={bests} topSpeed={topSpeed} positionGain={positionGain} />
            <SectorBests sectors={sectorBests} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <TimingTower
                drivers={snapshot.drivers}
                timing={snapshot.timing}
                selectedDriver={selectedDriver}
                onSelectDriver={setSelectedDriver}
                fastestLapDriver={bests.fastestLap?.racingNumber ?? null}
                fastestPaceDriver={topSpeed?.racingNumber ?? null}
                positionChanges={positionChanges}
                driverFlags={driverFlags}
              />
            </div>

            <div className="lg:col-span-4 space-y-6">
              <TrackMap
                drivers={snapshot.drivers}
                positions={snapshot.positions}
                selectedDriver={selectedDriver}
                sessionName={sessionName}
                weather={snapshot.weather}
              />
              <CompactTelemetry drivers={snapshot.drivers} telemetry={snapshot.telemetry} selectedDriver={selectedDriver} />
              <BattleWatchList battles={battles} telemetry={snapshot.telemetry} timing={snapshot.timing} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
