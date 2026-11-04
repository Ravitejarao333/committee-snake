import { describe, expect, it } from "vitest";
import { edgeFactor, hitDamage, multiplier, oneTapLeft, paneStrength } from "./damage";
import type { Bounds, Pt } from "./geom";
import { BASE_DAMAGE, BASE_STRENGTH, EDGE_MIN, PANE_STRENGTH, STRENGTH_SPREAD } from "./tuning";

const B: Bounds = { w: 390, h: 700 };
const CENTRE: Pt = { x: 195, y: 350 };
const EDGES: Pt[] = [
  { x: 0, y: 40 },
  { x: 390, y: 200 },
  { x: 120, y: 0 },
  { x: 300, y: 700 },
  { x: 0, y: 650 },
  { x: 390, y: 520 },
  { x: 5, y: 5 },
];
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
const FAR = Number.POSITIVE_INFINITY;

/** Hits until the pane breaks, for damage d each. */
function hitsToBreak(max: number, damage: (i: number) => number): number {
  let dealt = 0;
  for (let i = 0; i < 100; i++) {
    dealt += damage(i);
    if (dealt >= max) return i + 1;
  }
  return Number.POSITIVE_INFINITY;
}

describe("damage model", () => {
  it("gives every pane a budget of about 100", () => {
    for (const seed of SEEDS) {
      const s = paneStrength(seed);
      expect(s).toBeGreaterThanOrEqual(PANE_STRENGTH * (1 - STRENGTH_SPREAD));
      expect(s).toBeLessThanOrEqual(PANE_STRENGTH * (1 + STRENGTH_SPREAD));
      expect(paneStrength(seed)).toBe(s);
    }
    expect(new Set(SEEDS.map(paneStrength)).size).toBeGreaterThan(100);
  });

  it("scales damage with strength: a plain tap is the base hit", () => {
    expect(multiplier(BASE_STRENGTH)).toBe(1);
    expect(multiplier(0)).toBe(1);
    expect(hitDamage(BASE_STRENGTH, CENTRE, B, FAR)).toBe(BASE_DAMAGE);
    let prev = 0;
    for (const s of [0.2, 0.4, 0.6, 0.8, 1]) {
      expect(multiplier(s)).toBeGreaterThan(prev);
      prev = multiplier(s);
    }
  });

  it("does less damage near the frame than in the middle", () => {
    expect(edgeFactor(CENTRE, B)).toBe(1);
    for (const p of EDGES) expect(edgeFactor(p, B)).toBeLessThan(0.7);
    expect(edgeFactor({ x: 0, y: 350 }, B)).toBeCloseTo(EDGE_MIN);
    let prev = 0;
    for (const x of [0, 20, 40, 60, 80, 120, 195]) {
      const f = edgeFactor({ x, y: 350 }, B);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("adds a weak-spot bonus next to an existing crack", () => {
    expect(hitDamage(0.2, CENTRE, B, 10)).toBeGreaterThan(hitDamage(0.2, CENTRE, B, 200));
  });

  it("takes 3–5 ordinary taps in the middle of any pane", () => {
    for (const seed of SEEDS) {
      const max = paneStrength(seed);
      const plain = hitsToBreak(max, () => hitDamage(BASE_STRENGTH, CENTRE, B, FAR));
      // The same taps, each landing on the cracks of the ones before.
      const onCracks = hitsToBreak(max, (i) =>
        hitDamage(BASE_STRENGTH, CENTRE, B, i === 0 ? FAR : 0),
      );
      expect(plain).toBeLessThanOrEqual(5);
      expect(onCracks).toBeGreaterThanOrEqual(3);
    }
  });

  it("breaks with 1–2 hard hits on the centre", () => {
    for (const seed of SEEDS)
      expect(hitsToBreak(paneStrength(seed), () => hitDamage(1, CENTRE, B, FAR))).toBe(1);
    for (const seed of SEEDS)
      for (const p of EDGES)
        expect(hitsToBreak(paneStrength(seed), () => hitDamage(1, p, B, FAR))).toBeLessThanOrEqual(
          2,
        );
  });

  it("never needs more than 7 hits, even plain taps on the frame far from any crack", () => {
    for (const seed of SEEDS) {
      const max = paneStrength(seed);
      expect(
        hitsToBreak(max, (i) => hitDamage(0, EDGES[i % EDGES.length] ?? CENTRE, B, FAR)),
      ).toBeLessThanOrEqual(7);
      expect(hitsToBreak(max, () => hitDamage(0, { x: 0, y: 0 }, B, FAR))).toBeLessThanOrEqual(7);
    }
  });

  it("knows when one more tap would do it", () => {
    expect(oneTapLeft(80, 100)).toBe(true);
    expect(oneTapLeft(60, 100)).toBe(false);
    expect(oneTapLeft(100, 100)).toBe(false);
  });
});
