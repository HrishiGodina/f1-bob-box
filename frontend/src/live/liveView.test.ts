import { describe, it, expect } from "vitest";
import {
  resolveLiveView,
  loadOverride,
  saveOverride,
  shouldShowNoSessionPanel,
  type StorageLike,
} from "./liveView";

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
}

describe("resolveLiveView", () => {
  it("follows the backend when override is null (auto)", () => {
    expect(resolveLiveView(null, true)).toBe(true);
    expect(resolveLiveView(null, false)).toBe(false);
  });

  it("pins live regardless of the backend", () => {
    expect(resolveLiveView("live", false)).toBe(true);
    expect(resolveLiveView("live", true)).toBe(true);
  });

  it("pins off regardless of the backend", () => {
    expect(resolveLiveView("off", true)).toBe(false);
    expect(resolveLiveView("off", false)).toBe(false);
  });
});

describe("loadOverride / saveOverride", () => {
  it("returns null when nothing is stored", () => {
    expect(loadOverride(fakeStorage())).toBeNull();
  });

  it("round-trips a saved value", () => {
    const storage = fakeStorage();
    saveOverride(storage, "live");
    expect(loadOverride(storage)).toBe("live");
    saveOverride(storage, "off");
    expect(loadOverride(storage)).toBe("off");
  });

  it("clears the stored value when saving null", () => {
    const storage = fakeStorage({ "f1.liveOverride": "live" });
    saveOverride(storage, null);
    expect(loadOverride(storage)).toBeNull();
  });

  it("ignores a garbage stored value", () => {
    const storage = fakeStorage({ "f1.liveOverride": "garbage" });
    expect(loadOverride(storage)).toBeNull();
  });

  it("falls back to null when storage throws on read", () => {
    expect(loadOverride(throwingStorage())).toBeNull();
  });

  it("does not throw when storage throws on write", () => {
    expect(() => saveOverride(throwingStorage(), "live")).not.toThrow();
  });
});

describe("shouldShowNoSessionPanel", () => {
  it("shows the panel when live and real but the backend has no session", () => {
    expect(shouldShowNoSessionPanel(false, false)).toBe(true);
  });

  it("never shows the panel while demo is active", () => {
    expect(shouldShowNoSessionPanel(false, true)).toBe(false);
    expect(shouldShowNoSessionPanel(true, true)).toBe(false);
  });

  it("does not show the panel when a real session is live", () => {
    expect(shouldShowNoSessionPanel(true, false)).toBe(false);
  });
});
