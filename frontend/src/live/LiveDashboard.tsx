import { useState } from "react";
import { motion } from "framer-motion";
import { useLiveTimingSocket } from "./useLiveTimingSocket";
import { TimingTower } from "./TimingTower";
import { TrackMap } from "./TrackMap";
import { RaceControlFeed } from "./RaceControlFeed";
import { DriverTelemetryPanel } from "./DriverTelemetryPanel";

export function LiveDashboard() {
  const snapshot = useLiveTimingSocket();
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const sessionName = snapshot.session_info.Meeting?.Name ?? "ON AIR";
  const isReconnecting = snapshot.connection_status === "reconnecting";
  const showFeedNotice = snapshot.connection_status !== "connected";

  return (
    <div className="space-y-12" id="live-dashboard">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-12 pb-12 border-b border-white/5">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ opacity: 1, x: 0 }}>
          <div className="text-mkbhd-red font-black uppercase tracking-[0.5em] mb-4 text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-mkbhd-red animate-pulse" /> Live Satellite Feed
          </div>
          <h1 className="text-7xl md:text-[10rem] tracking-tight leading-none">{sessionName}</h1>
        </motion.div>
        {showFeedNotice && (
          <div className="px-6 py-3 bg-mkbhd-red/10 border border-mkbhd-red/40 rounded-full text-[10px] font-black uppercase tracking-widest text-mkbhd-red">
            {isReconnecting ? "Reconnecting to live feed..." : "Connecting to live feed..."}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-3">
          <TimingTower
            drivers={snapshot.drivers}
            timing={snapshot.timing}
            selectedDriver={selectedDriver}
            onSelectDriver={setSelectedDriver}
          />
        </div>

        <div className="lg:col-span-9 space-y-10" id="telemetry">
          <DriverTelemetryPanel drivers={snapshot.drivers} telemetry={snapshot.telemetry} selectedDriver={selectedDriver} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            <TrackMap drivers={snapshot.drivers} positions={snapshot.positions} selectedDriver={selectedDriver} />
            <RaceControlFeed messages={snapshot.race_control} />
          </div>
        </div>
      </div>
    </div>
  );
}
