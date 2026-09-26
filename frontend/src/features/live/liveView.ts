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

// `window.localStorage` is a getter that can itself throw a SecurityError
// (sandboxed iframes, fully-blocked storage) — that throw happens directly
// during render (e.g. inside a useState initializer) and is NOT caught by
// loadOverride/saveOverride's own try/catch, since those only guard the
// storage *methods*, not the property access that hands them a storage
// object in the first place. Callers should read `window.localStorage`
// through this helper instead of touching it directly.
export function browserStorage(): StorageLike {
  try {
    const storage = window.localStorage;
    // Touch it once — some browsers only throw on first use (e.g. a quota
    // check), not on the property access itself.
    storage.getItem("__f1_probe__");
    return storage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
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

// True only when the live view is showing, it isn't demo data, the backend
// genuinely has no session running (spec §7's honest empty state), AND
// we've actually heard from the backend at least once. Without that last
// check this would fire on first paint (and on every reconnect) purely
// because INITIAL_LIVE_STATE defaults is_live to false — indistinguishable
// from a real "no session" — while the separate "Connecting..." notice is
// the honest signal for that transient state instead.
export function shouldShowNoSessionPanel(
  isLive: boolean,
  demoActive: boolean,
  hasSnapshot: boolean
): boolean {
  if (!hasSnapshot) return false;
  return !demoActive && !isLive;
}
