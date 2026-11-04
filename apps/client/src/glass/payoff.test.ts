import { describe, expect, it } from "vitest";
import type { Bounds } from "./geom";
import { remnant, sliverCount } from "./payoff";

const B: Bounds = { w: 390, h: 700 };

describe("shatter payoff", () => {
  it("throws 20–40 slivers, more for a harder shatter", () => {
    expect(sliverCount(0)).toBe(20);
    expect(sliverCount(1)).toBe(40);
    expect(sliverCount(5)).toBe(40);
    expect(sliverCount(0.5)).toBeGreaterThan(20);
  });

  it("leaves a jagged strip on each side of the frame, hugging the edge", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const strips = remnant(B, seed);
      expect(strips).toHaveLength(4);
      for (const s of strips) {
        expect(s.length).toBeGreaterThan(10);
        for (const p of s) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(B.w);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(B.h);
          const edge = Math.min(p.x, p.y, B.w - p.x, B.h - p.y);
          expect(edge).toBeLessThanOrEqual(32);
        }
      }
    }
    expect(remnant(B, 3)).toEqual(remnant(B, 3));
  });
});
