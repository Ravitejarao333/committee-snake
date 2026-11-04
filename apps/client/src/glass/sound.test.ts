import { mulberry32 } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import {
  crackleGrains,
  creakParams,
  createGlassSound,
  impactParams,
  loudness,
  tinklePing,
} from "./sound";

describe("glass sound parameters", () => {
  it("gets louder and brighter with strength", () => {
    expect(loudness(0)).toBeCloseTo(0.4);
    expect(loudness(1)).toBeCloseTo(1);
    expect(impactParams(1).cutoff).toBeGreaterThan(impactParams(0).cutoff);
    expect(impactParams(0).cutoff).toBe(1500);
    expect(impactParams(1).cutoff).toBe(6000);
    expect(impactParams(1).thumpFrom).toBeGreaterThan(impactParams(0).thumpTo);
  });

  it("crackles with 8–20 short grains spread over 200–400 ms", () => {
    const light = crackleGrains(0, mulberry32(1));
    const hard = crackleGrains(1, mulberry32(1));
    expect(light).toHaveLength(8);
    expect(hard).toHaveLength(20);
    for (const [g, spread] of [
      ...light.map((g) => [g, 0.2] as const),
      ...hard.map((g) => [g, 0.4] as const),
    ]) {
      expect(g.at).toBeLessThan(spread);
      expect(g.dur).toBeGreaterThanOrEqual(0.003);
      expect(g.dur).toBeLessThanOrEqual(0.008);
      expect(g.freq).toBeGreaterThanOrEqual(2000);
      expect(g.freq).toBeLessThanOrEqual(5000);
    }
    expect(hard.map((g) => g.at)).toEqual([...hard.map((g) => g.at)].sort((a, b) => a - b));
  });

  it("tinkles high, with an inharmonic partial and a 0.3–1.5 s tail", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const p = tinklePing(0, rng);
      expect(p.freq).toBeGreaterThanOrEqual(2400);
      expect(p.freq).toBeLessThanOrEqual(6000);
      expect(p.partial).toBeCloseTo(2.76);
      expect(p.decay).toBeGreaterThanOrEqual(0.3);
      expect(p.decay).toBeLessThanOrEqual(1.5);
    }
    expect(tinklePing(1, mulberry32(9)).freq).toBeGreaterThan(tinklePing(0, mulberry32(9)).freq);
  });

  it("creaks low, louder and longer as the pane nears its limit", () => {
    let prev = { gain: 0, dur: 0 };
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const p = creakParams(r, mulberry32(5));
      expect(p.gain).toBeGreaterThan(prev.gain);
      expect(p.dur).toBeGreaterThan(prev.dur);
      expect(p.freqFrom).toBeLessThan(150);
      expect(p.freqTo).toBeLessThan(p.freqFrom);
      prev = p;
    }
    expect(creakParams(1, mulberry32(5)).gain).toBeGreaterThan(
      8 * creakParams(0, mulberry32(5)).gain,
    );
    expect(creakParams(7, mulberry32(5))).toEqual(creakParams(1, mulberry32(5)));
  });

  it("plays nothing before the first gesture", () => {
    const s = createGlassSound(mulberry32(1));
    s.impact(1);
    s.crackle(1);
    s.tinkle(1);
    s.creak(1);
    expect(s.played).toEqual({ impact: 0, crackle: 0, tinkle: 0, creak: 0 });
    expect(s.engine.state).toBeNull();
  });
});
