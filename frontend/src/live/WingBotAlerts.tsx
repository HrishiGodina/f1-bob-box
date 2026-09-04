import { AnimatePresence, motion } from "framer-motion";
import { useWingBotAlerts } from "./useWingBotAlerts";
import type { Battle } from "./battles";

export function WingBotAlerts({ battles }: { battles: Battle[] }) {
  const alerts = useWingBotAlerts(battles);
  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-72 pointer-events-none">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="mkbhd-card p-4 bg-mkbhd-red/10 border border-mkbhd-red/30"
          >
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-mkbhd-red mb-1">WingBot</div>
            <div className="text-xs text-white">{alert.message}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
