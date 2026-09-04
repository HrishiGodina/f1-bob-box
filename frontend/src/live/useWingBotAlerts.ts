import { useEffect, useRef, useState } from "react";
import type { Battle } from "./battles";

export interface WingBotAlert {
  id: string;
  key: string;
  message: string;
  createdAt: number;
}

export function useWingBotAlerts(battles: Battle[], now: () => number = Date.now, ttlMs = 6000): WingBotAlert[] {
  const [alerts, setAlerts] = useState<WingBotAlert[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeKeys = new Set(battles.map((b) => b.key));
    const newAlerts: WingBotAlert[] = [];

    for (const battle of battles) {
      if (seenRef.current.has(battle.key)) continue;
      seenRef.current.add(battle.key);
      newAlerts.push({
        id: `${battle.key}-${now()}`,
        key: battle.key,
        message: `${battle.behindTla} closing on ${battle.aheadTla} — ${battle.gapSeconds.toFixed(1)}s`,
        createdAt: now(),
      });
    }

    for (const key of Array.from(seenRef.current)) {
      if (!activeKeys.has(key)) seenRef.current.delete(key);
    }

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...prev, ...newAlerts]);
    }
  }, [battles, now]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = setTimeout(() => {
      const cutoff = now() - ttlMs;
      setAlerts((prev) => prev.filter((a) => a.createdAt > cutoff));
    }, ttlMs);
    return () => clearTimeout(timer);
  }, [alerts, now, ttlMs]);

  return alerts;
}
