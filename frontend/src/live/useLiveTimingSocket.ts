import { useEffect, useState } from "react";
import type { LivePatch, LiveSnapshot } from "./types";
import { INITIAL_LIVE_STATE, applyLivePatch, deriveWsUrl } from "./liveState";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000/api";

// The frontend's own reconnect delay for the browser <-> backend /ws/live
// link. This is unrelated to (and much simpler than) BACKOFF_SCHEDULE in
// backend/livetiming/client.py, which governs the backend's own reconnect
// to F1's servers — two independent links, two independent policies. When
// this link re-establishes, the backend immediately sends a fresh full
// snapshot (Task 6's /ws/live route), so the frontend needs no special
// catch-up logic beyond just reconnecting.
const RECONNECT_DELAY_MS = 3000;

// Owns the single browser connection to /ws/live and folds incoming
// patches into a LiveSnapshot via the pure applyLivePatch reducer
// (liveState.ts). connection_status/is_live on the returned snapshot
// reflect the backend's link to F1, not this hook's own link to the
// backend — that link's health is handled transparently by the reconnect
// loop below.
export function useLiveTimingSocket(enabled: boolean = true): LiveSnapshot {
  const [state, setState] = useState<LiveSnapshot>(INITIAL_LIVE_STATE);

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(deriveWsUrl(API_BASE));

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const patch = JSON.parse(event.data) as LivePatch;
          setState((prev) => applyLivePatch(prev, patch));
        } catch (error) {
          console.error("failed to parse /ws/live message", error);
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled]);

  return state;
}
