export type LiveOverride = "live" | "off" | null;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = "f1.liveOverride";

// null (auto) preserves today's behaviour: effectiveLive tracks the
// backend's own is_live poll until the user pins an explicit choice.
export function resolveLiveView(override: LiveOverride, backendIsLive: boolean): boolean {
  return override === null ? backendIsLive : override === "live";
}

// localStorage throws in private-browsing contexts (spec §4) — any
// failure here must fall back to auto, never crash the render. Storage is
// injected rather than read from `window` so this stays testable under
// vitest's node environment, which has no `window` global.
export function loadOverride(storage: StorageLike): LiveOverride {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === "live" || raw === "off" ? raw : null;
  } catch {
    return null;
  }
}

export function saveOverride(storage: StorageLike, value: LiveOverride): void {
  try {
    if (value === null) {
      storage.removeItem(STORAGE_KEY);
    } else {
      storage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Private-browsing / storage disabled: silently no-op. The next
    // loadOverride() call still resolves to auto, so render never breaks.
  }
}

// True only when the live view is showing, it isn't demo data, and the
// backend genuinely has no session running (spec §7's honest empty
// state) — always false while demo is filling the screen instead.
export function shouldShowNoSessionPanel(isLive: boolean, demoActive: boolean): boolean {
  return !demoActive && !isLive;
}
