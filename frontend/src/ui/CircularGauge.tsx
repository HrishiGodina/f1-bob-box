import { motion } from "framer-motion";

export interface CircularGaugeProps {
  value: number;
  max: number;
  label: string;
  color: string;
  unit: string;
}

// Extracted verbatim (logic and markup unchanged) from the old
// frontend/src/App.tsx line 98. It has to live outside App.tsx: App.tsx
// imports LiveDashboard (frontend/src/live/LiveDashboard.tsx), and
// DriverTelemetryPanel — used by LiveDashboard — needs this gauge, so
// leaving the definition in App.tsx would create an import cycle. See
// docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
// §6.2.
export function CircularGauge({ value, max, label, color, unit }: CircularGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-10 mkbhd-card bg-white/[0.01]">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90">
          <circle cx="80" cy="80" r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="transparent" />
          <motion.circle
            cx="80"
            cy="80"
            r={radius}
            stroke={color}
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "circOut" }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute text-center">
          <div className="text-4xl font-black italic">{value}</div>
          <div className="text-[10px] font-bold text-mkbhd-gray uppercase tracking-widest">{unit}</div>
        </div>
      </div>
      <div className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-mkbhd-gray">{label}</div>
    </div>
  );
}
