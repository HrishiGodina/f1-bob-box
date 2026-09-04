// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWingBotAlerts } from "./useWingBotAlerts";
import type { Battle } from "./battles";

function mkBattle(overrides: Partial<Battle> = {}): Battle {
  return {
    key: "44-1",
    aheadNumber: "1",
    behindNumber: "44",
    aheadTla: "VER",
    behindTla: "HAM",
    gapSeconds: 0.8,
    tier: "live",
    ...overrides,
  };
}

describe("useWingBotAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces exactly one alert the first time a battle appears", () => {
    const now = () => 1000;
    const battle = mkBattle();

    const { result } = renderHook(({ battles }) => useWingBotAlerts(battles, now), {
      initialProps: { battles: [battle] },
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].key).toBe("44-1");
  });

  it("does not duplicate an alert when the same key persists across re-renders", () => {
    let clock = 1000;
    const now = () => clock;
    const battle = mkBattle();

    const { result, rerender } = renderHook(({ battles }) => useWingBotAlerts(battles, now), {
      initialProps: { battles: [battle] },
    });

    expect(result.current).toHaveLength(1);

    clock += 1000;
    rerender({ battles: [{ ...battle, gapSeconds: 0.6 }] });

    expect(result.current).toHaveLength(1);
  });

  it("removes the alert once the injected clock advances past ttlMs and re-renders", () => {
    let clock = 1000;
    const now = () => clock;
    const battle = mkBattle();
    const ttlMs = 6000;

    const { result, rerender } = renderHook(({ battles }) => useWingBotAlerts(battles, now, ttlMs), {
      initialProps: { battles: [battle] },
    });

    expect(result.current).toHaveLength(1);

    // Advance the injected clock past the ttl, then fire the pending
    // setTimeout the alert-ttl effect scheduled.
    clock += ttlMs + 1;
    act(() => {
      vi.advanceTimersByTime(ttlMs);
    });

    expect(result.current).toHaveLength(0);
    // Keep rerender referenced so it's clear it's unused only after expiry.
    rerender({ battles: [battle] });
  });

  it("alerts again when a battle disappears and later reappears with the same key", () => {
    let clock = 1000;
    const now = () => clock;
    const battle = mkBattle();

    const { result, rerender } = renderHook(({ battles }) => useWingBotAlerts(battles, now), {
      initialProps: { battles: [battle] },
    });

    expect(result.current).toHaveLength(1);
    const firstId = result.current[0].id;

    clock += 1000;
    rerender({ battles: [] });
    expect(result.current).toHaveLength(1); // still present until ttl expiry, but no longer "seen"

    clock += 1000;
    rerender({ battles: [battle] });

    expect(result.current.some((a) => a.id !== firstId && a.key === "44-1")).toBe(true);
  });

  it("produces two independent alerts for two distinct simultaneous battles", () => {
    const now = () => 1000;
    const battleA = mkBattle({ key: "44-1", aheadNumber: "1", behindNumber: "44" });
    const battleB = mkBattle({ key: "16-4", aheadNumber: "4", behindNumber: "16", aheadTla: "NOR", behindTla: "LEC" });

    const { result } = renderHook(({ battles }) => useWingBotAlerts(battles, now), {
      initialProps: { battles: [battleA, battleB] },
    });

    expect(result.current).toHaveLength(2);
    expect(result.current.map((a) => a.key).sort()).toEqual(["16-4", "44-1"]);
  });
});
