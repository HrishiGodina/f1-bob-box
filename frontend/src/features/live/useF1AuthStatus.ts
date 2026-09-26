import { useEffect, useState } from "react";
import { API_BASE } from "../../shared/api/client";

export interface F1AuthStatus {
  validUntil: number | null;
  needsRefresh: boolean;
}

export function useF1AuthStatus(enabled: boolean): F1AuthStatus {
  const [status, setStatus] = useState<F1AuthStatus>({ validUntil: null, needsRefresh: false });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = () =>
      fetch(`${API_BASE}/f1auth/status`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) {
            setStatus({ validUntil: data.valid_until ?? null, needsRefresh: !!data.needs_refresh });
          }
        })
        .catch(() => {});
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return status;
}

export async function startF1AuthRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/f1auth/refresh/start`, { method: "POST" });
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}
