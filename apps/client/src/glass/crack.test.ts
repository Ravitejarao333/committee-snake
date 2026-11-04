import { describe, expect, it } from "vitest";
import { crackAt, crackLines, hitSeed, rayCount, reachFor } from "./crack";
import { at, type Bounds, type Pt } from "./geom";

const B: Bounds = { w: 390, h: 700 };
const HIT: Pt = { x: 180, y: 320 };
const dist = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y);
const allPts = (l: { rays: Pt[][]; rings: Pt[][]; branches: Pt[][] }): Pt[] =>
  [...l.rays, ...l.rings, ...l.branches].flat();

describe("crack geometry", () => {
  it("is deterministic and depends on where you hit", () => {
    const a = crackAt(HIT, 0.6, hitSeed(1234, HIT.x, HIT.y, 0), B);
    const b = crackAt(HIT, 0.6, hitSeed(1234, HIT.x, HIT.y, 0), B);
    expect(a).toEqual(b);
    expect(hitSeed(1234, 181, 320, 0)).not.toBe(hitSeed(1234, 180, 320, 0));
    expect(hitSeed(1234, 180, 320, 1)).not.toBe(hitSeed(1234, 180, 320, 0));
    expect(hitSeed(1235, 180, 320, 0)).not.toBe(hitSeed(1234, 180, 320, 0));
  });

  it("draws 6 to 12 rays, more for harder hits", () => {
    expect(rayCount(0)).toBe(6);
    expect(rayCount(1)).toBe(12);
    let prev = 0;
    for (const s of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const n = crackAt(HIT, s, 7, B).rays.length;
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(12);
      prev = n;
    }
    expect(crackAt(HIT, 1, 7, B).rays).toHaveLength(12);
    expect(crackAt(HIT, 0, 7, B).rays).toHaveLength(6);
  });

  it("keeps every drawn point inside the pane, even for hits near an edge", () => {
    for (const hit of [HIT, { x: 3, y: 4 }, { x: 389, y: 690 }, { x: 200, y: 1 }]) {
      for (let seed = 1; seed <= 20; seed++) {
        const c = crackAt(hit, 1, seed, B);
        for (const p of allPts(crackLines(c, c.reachMax, B))) {
          expect(p.x).toBeGreaterThanOrEqual(-1e-9);
          expect(p.x).toBeLessThanOrEqual(B.w + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(-1e-9);
          expect(p.y).toBeLessThanOrEqual(B.h + 1e-9);
        }
      }
    }
  });

  it("runs every ray outward from the hit, past the pane", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = crackAt(HIT, 0.8, seed, B);
      for (const ray of c.rays) {
        expect(ray.pts[0]).toEqual(HIT);
        for (let j = 1; j < ray.pts.length; j++) {
          expect(at(ray.radii, j)).toBeGreaterThan(at(ray.radii, j - 1));
          expect(dist(at(ray.pts, j), HIT)).toBeCloseTo(at(ray.radii, j), 6);
        }
        expect(ray.radii.at(-1)).toBeGreaterThanOrEqual(c.far);
      }
    }
  });

  it("orders rings by radius and meets each ray at them in order", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = crackAt(HIT, 0.9, seed, B);
      const radii = c.rings.map((r) => r.r);
      expect(radii).toHaveLength(3);
      expect([...radii].sort((p, q) => p - q)).toEqual(radii);
      for (const { ringIdx } of c.rays) {
        expect(at(ringIdx, 0)).toBeGreaterThan(0);
        for (let k = 1; k < ringIdx.length; k++)
          expect(at(ringIdx, k)).toBeGreaterThan(at(ringIdx, k - 1));
      }
    }
    expect(crackAt(HIT, 0.2, 1, B).rings).toHaveLength(2);
  });

  it("only adds lines as the reach grows (a held press grows the same crack)", () => {
    const c = crackAt(HIT, 0.5, 99, B);
    let prev = crackLines(c, reachFor(c, 0), B);
    for (const s of [0.25, 0.5, 0.75, 1]) {
      const next = crackLines(c, reachFor(c, s), B);
      prev.rays.forEach((ray, i) => {
        // Every earlier vertex but the cut end is still there, in order.
        const grown = at(next.rays, i);
        for (let j = 0; j < ray.length - 1; j++) expect(grown[j]).toEqual(ray[j]);
        const end = at(ray, ray.length - 1);
        expect(dist(at(grown, grown.length - 1), HIT)).toBeGreaterThanOrEqual(
          dist(end, HIT) - 1e-9,
        );
      });
      for (const ring of prev.rings) expect(next.rings).toContainEqual(ring);
      for (const br of prev.branches) expect(next.branches).toContainEqual(br);
      prev = next;
    }
  });

  it("stays within the reach", () => {
    const c = crackAt(HIT, 0.3, 5, B);
    const reach = reachFor(c, 0.3);
    for (const ray of crackLines(c, reach, B).rays)
      expect(dist(at(ray, ray.length - 1), HIT)).toBeLessThanOrEqual(reach + 1e-6);
  });
});
