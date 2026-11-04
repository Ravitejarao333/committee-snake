import { describe, expect, it } from "vitest";
import { FLICK_SHATTER, type HitInput, HOLD_SHATTER_MS, MoveTrack, strength } from "./strength";

const BASE: HitInput = { approach: 0, heldMs: 0, area: 0, pressure: 0.5, flick: 0, diag: 800 };
const at = (o: Partial<HitInput>): number => strength({ ...BASE, ...o });

function monotone(f: (v: number) => number, vs: number[]): void {
  for (let i = 1; i < vs.length; i++)
    expect(f(vs[i] ?? 0)).toBeGreaterThanOrEqual(f(vs[i - 1] ?? 0));
}

describe("hit strength", () => {
  it("grows with mouse swing speed", () => {
    monotone((v) => at({ approach: v }), [0, 200, 800, 1600, 2400, 5000]);
    expect(at({ approach: 2400 })).toBe(1);
    expect(at({ approach: 0 })).toBeCloseTo(0.2);
  });

  it("grows with press duration and touch contact area", () => {
    monotone((v) => at({ heldMs: v }), [0, 50, 150, 300, 450, 900]);
    monotone((v) => at({ area: v }), [0, 400, 900, 2500, 4900, 10_000]);
    expect(at({ heldMs: HOLD_SHATTER_MS })).toBe(1);
    expect(at({ flick: FLICK_SHATTER * BASE.diag })).toBe(1);
  });

  it("ignores the 0.5 default pressure but uses real pressure", () => {
    expect(at({ pressure: 0.5 })).toBe(at({ pressure: 0 }));
    monotone((v) => at({ pressure: v }), [0.1, 0.3, 0.7, 0.9, 1]);
    expect(at({ pressure: 0.9 })).toBeGreaterThan(at({ pressure: 0.5 }));
  });

  it("never shatters on contact size or pressure alone", () => {
    expect(at({ pressure: 1 })).toBeLessThan(0.75);
    expect(at({ area: 100_000, pressure: 1 })).toBeLessThan(0.75);
    expect(at({ pressure: 1, heldMs: HOLD_SHATTER_MS })).toBe(1);
  });

  it("stays within 0..1 for any input", () => {
    for (const o of [
      { approach: 1e9 },
      { heldMs: -5 },
      { area: -1 },
      { pressure: 7 },
      { flick: 1e9, diag: 0 },
    ]) {
      const s = at(o);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("move track", () => {
  it("measures speed over the last 60 ms only", () => {
    const m = new MoveTrack();
    m.push(0, 0, 0);
    m.push(100, 0, 0); // stale motion before this
    m.push(120, 30, 40);
    m.push(140, 60, 80);
    expect(m.speed(140)).toBeCloseTo(100 / 0.04);
    expect(m.speed(260)).toBe(0);
  });

  it("returns 0 with fewer than two samples, and after clear", () => {
    const m = new MoveTrack();
    expect(m.speed(0)).toBe(0);
    m.push(0, 0, 0);
    expect(m.speed(0)).toBe(0);
    m.push(10, 10, 0);
    m.clear();
    expect(m.speed(10)).toBe(0);
  });

  it("wraps its buffer", () => {
    const m = new MoveTrack();
    for (let t = 0; t < 400; t += 4) m.push(t, t, 0);
    expect(m.speed(396)).toBeCloseTo(1000);
  });
});
