import { describe, expect, it } from "vitest";
import { crackAt } from "./crack";
import { at, type Bounds, type Pt, polyArea, ring } from "./geom";
import { type Shard, SLIVER, shatter } from "./shards";

const PANES: Bounds[] = [
  { w: 390, h: 700 },
  { w: 420, h: 746 },
];
const HITS: Pt[] = [
  { x: 180, y: 320 },
  { x: 20, y: 30 },
  { x: 385, y: 690 },
  { x: 200, y: 4 },
];

const area = (p: Pt[]): number => Math.abs(polyArea(p));

/** Proper crossing of segments ab and cd (shared endpoints don't count). */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  const eps = 1e-7;
  return (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  );
}

function simple(p: Pt[]): boolean {
  const m = p.length;
  for (let i = 0; i < m; i++)
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (crosses(at(p, i), ring(p, i + 1), at(p, j), ring(p, j + 1))) return false;
    }
  return true;
}

function cases(cap: number): { b: Bounds; shards: Shard[] }[] {
  const out: { b: Bounds; shards: Shard[] }[] = [];
  for (const b of PANES)
    for (const hit of HITS)
      for (let seed = 1; seed <= 12; seed++)
        for (const s of [0, 0.5, 1])
          out.push({ b, shards: shatter(crackAt(hit, s, seed, b), b, cap, s) });
  return out;
}

describe("shatter", () => {
  it("tiles the whole pane: shard areas add up to the pane", () => {
    for (const { b, shards } of cases(48)) {
      const sum = shards.reduce((s, x) => s + area(x.poly), 0);
      expect(Math.abs(sum - b.w * b.h) / (b.w * b.h)).toBeLessThan(0.005);
    }
  });

  it("makes simple polygons with at least 3 vertices", () => {
    for (const { shards } of cases(48))
      for (const x of shards) {
        expect(x.poly.length).toBeGreaterThanOrEqual(3);
        expect(simple(x.poly)).toBe(true);
      }
  });

  it("honours the cap at 48 and at 24", () => {
    for (const cap of [48, 24])
      for (const { shards } of cases(cap)) expect(shards.length).toBeLessThanOrEqual(cap);
    const pane = at(PANES, 0);
    const big = shatter(crackAt(at(HITS, 0), 1, 3, pane), pane, 48, 1);
    expect(big.length).toBeGreaterThan(24);
  });

  it("leaves no sliver behind", () => {
    for (const { b, shards } of cases(48)) {
      if (shards.length < 2) continue;
      for (const x of shards) expect(x.area).toBeGreaterThanOrEqual(SLIVER * b.w * b.h);
    }
  });

  it("puts each centroid inside the pane and sends shards away from the hit", () => {
    const b = at(PANES, 0);
    const hit = at(HITS, 0);
    const shards = shatter(crackAt(hit, 1, 5, b), b, 48, 1);
    for (const x of shards) {
      expect(x.cx).toBeGreaterThanOrEqual(0);
      expect(x.cx).toBeLessThanOrEqual(b.w);
      expect((x.cx - hit.x) * x.vx).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic", () => {
    const b = at(PANES, 1);
    const c = crackAt(at(HITS, 0), 0.7, 42, b);
    expect(shatter(c, b, 48, 0.7)).toEqual(shatter(c, b, 48, 0.7));
  });
});
