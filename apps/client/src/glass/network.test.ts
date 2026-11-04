import { describe, expect, it } from "vitest";
import { crackAt, crackLines, hitSeed, reachFor } from "./crack";
import type { Bounds, Pt } from "./geom";
import {
  commitHit,
  components,
  crackDist,
  createNetwork,
  type Network,
  trace,
  web,
} from "./network";

const B: Bounds = { w: 390, h: 700 };

function hitAll(pts: Pt[], s = 0.2, seed = 1234): Network {
  const net = createNetwork(B);
  pts.forEach((p, i) => {
    const c = crackAt(p, s, hitSeed(seed, p.x, p.y, i), B);
    commitHit(net, trace(net, p, crackLines(c, reachFor(c, s), B), s, c.seed));
  });
  return net;
}

/** Proper crossing of two segments. */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const e = 1e-6;
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < -e && d3 * d4 < -e;
}

describe("crack network", () => {
  it("starts clean", () => {
    const net = createNetwork(B);
    expect(components(net)).toBe(0);
    expect(crackDist(net, { x: 10, y: 10 })).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps the network in fewer than 3 pieces after 3 hits anywhere", () => {
    const spots: Pt[][] = [
      [
        { x: 195, y: 350 },
        { x: 60, y: 120 },
        { x: 330, y: 600 },
      ],
      [
        { x: 20, y: 20 },
        { x: 370, y: 680 },
        { x: 195, y: 350 },
      ],
      [
        { x: 10, y: 350 },
        { x: 380, y: 350 },
        { x: 195, y: 10 },
      ],
    ];
    for (const pts of spots)
      for (let seed = 1; seed <= 20; seed++)
        expect(components(hitAll(pts, 0.2, seed))).toBeLessThan(3);
  });

  it("stops a new crack where it meets an older one instead of crossing it", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const net = hitAll(
        [
          { x: 195, y: 350 },
          { x: 230, y: 380 },
        ],
        0.6,
        seed,
      );
      const older = net.segs.filter((s) => s.hit === 0);
      const newer = net.segs.filter((s) => s.hit === 1);
      expect(newer.length).toBeGreaterThan(0);
      // Lines leaving the hit may start on an older crack when the hit lands on one.
      for (const n of newer.filter((x) => x.ax !== 230 || x.ay !== 380))
        for (const o of older)
          expect(
            crosses(
              { x: n.ax, y: n.ay },
              { x: n.bx, y: n.by },
              { x: o.ax, y: o.ay },
              { x: o.bx, y: o.by },
            ),
          ).toBe(false);
    }
  });

  it("tapers rays from the hit to the tip", () => {
    const net = hitAll([{ x: 195, y: 350 }], 1);
    const fromHit = net.segs.filter((s) => s.ax === 195 && s.ay === 350);
    const widest = Math.max(...net.segs.map((s) => s.w));
    const thinnest = Math.min(...net.segs.map((s) => s.w));
    expect(fromHit.length).toBeGreaterThan(0);
    for (const s of fromHit) expect(s.w).toBeGreaterThan(0.6 * widest);
    expect(thinnest).toBeLessThan(0.3 * widest);
  });

  it("fills in a hairline web only past 70% damage, more as it nears the limit", () => {
    const net = hitAll([
      { x: 195, y: 350 },
      { x: 120, y: 250 },
    ]);
    expect(web(net, 0.5, 9)).toEqual([]);
    expect(web(net, 0.69, 9)).toEqual([]);
    const some = web(net, 0.8, 9);
    const more = web(net, 1, 9);
    expect(some.length).toBeGreaterThan(0);
    expect(more.length).toBeGreaterThan(some.length);
    for (const s of more) {
      expect(s.hit).toBe(-1);
      expect(s.w).toBeLessThan(0.6);
    }
  });

  it("measures distance to the nearest crack", () => {
    const net = hitAll([{ x: 195, y: 350 }]);
    expect(crackDist(net, { x: 195, y: 350 })).toBe(0);
    expect(crackDist(net, { x: 5, y: 5 })).toBeGreaterThan(100);
  });
});
