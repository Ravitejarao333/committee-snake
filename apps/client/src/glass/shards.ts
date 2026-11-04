import { mulberry32 } from "@committee-snake/shared";
import type { Crack } from "./crack";
import { at, type Bounds, centroid, clamp01, type Pt, polyArea, ring } from "./geom";
import { SHARD_FALLOFF, SHARD_FAR, SHARD_NEAR } from "./tuning";

/**
 * Pure shatter: cut the pane along a crack's rays and rings into shards that tile it exactly.
 * A cell lies between two rays and between two rings (the hit is the innermost "ring", a far
 * radius past the pane the outermost). Cells are clipped to the pane, slivers merge into a
 * neighbour, and over the cap ring cells merge outward first. The innermost ring isn't cut, so
 * the pieces at the hit stay big, and then pieces bigger than their target size (smaller further
 * from the hit) are halved while the cap allows.
 */

export interface Shard {
  /** Outline relative to the centroid. */
  poly: Pt[];
  cx: number;
  cy: number;
  area: number;
  vx: number;
  vy: number;
  /** Angular velocity, rad/s. */
  w: number;
}

/** A run of merged wedges, and the ring boundaries (1..rings) it still splits at. */
interface Column {
  i0: number;
  span: number;
  cuts: number[];
}

interface Cell {
  col: number;
  /** Band group within the column. */
  band: number;
  /** How many cuts the column still has. */
  cuts: number;
  poly: Pt[];
  area: number;
}

/** Below this share of the pane a cell merges into a neighbour. */
export const SLIVER = 0.0015;

type Edge = [(p: Pt) => number, (p: Pt, q: Pt) => number];

/** Sutherland–Hodgman against the pane rectangle, dropping repeated points. */
function clip(poly: Pt[], b: Bounds): Pt[] {
  const edges: Edge[] = [
    [(p) => p.x, (p, q) => -p.x / (q.x - p.x)],
    [(p) => b.w - p.x, (p, q) => (b.w - p.x) / (q.x - p.x)],
    [(p) => p.y, (p, q) => -p.y / (q.y - p.y)],
    [(p) => b.h - p.y, (p, q) => (b.h - p.y) / (q.y - p.y)],
  ];
  let out = poly;
  for (const [side, cross] of edges) {
    const src = out;
    out = [];
    src.forEach((p, i) => {
      const q = ring(src, i + 1);
      const sp = side(p);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== side(q) >= 0) {
        const t = cross(p, q);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    });
    if (out.length === 0) return out;
  }
  const kept = out;
  return kept.filter((p, i) => {
    const q = ring(kept, i + 1);
    return Math.abs(p.x - q.x) > 1e-9 || Math.abs(p.y - q.y) > 1e-9;
  });
}

/** Far-radius arcs between neighbouring ray ends, fine enough to stay outside the pane. */
function farArcs(c: Crack): Pt[][] {
  const ang = c.rays.map((r) => {
    const e = at(r.pts, r.pts.length - 1);
    return Math.atan2(e.y - c.hit.y, e.x - c.hit.x);
  });
  return ang.map((a, i) => {
    let span = ring(ang, i + 1) - a;
    while (span <= 0) span += 2 * Math.PI;
    const m = Math.max(2, Math.ceil(span / (Math.PI / 8)));
    const pts: Pt[] = [];
    for (let q = 1; q < m; q++) {
      const t = a + (span * q) / m;
      pts.push({ x: c.hit.x + c.far * Math.cos(t), y: c.hit.y + c.far * Math.sin(t) });
    }
    return pts;
  });
}

/** The outline of wedges [i0, i0 + span) between boundaries k0 and k1 + 1, unclipped. */
function cellPoly(c: Crack, far: Pt[][], i0: number, span: number, k0: number, k1: number): Pt[] {
  const rings = c.rings.length;
  const n = c.rays.length;
  const ray = (i: number): number => ((i % n) + n) % n;
  const idx = (i: number, k: number): number => {
    const r = at(c.rays, i);
    return k === 0 ? 0 : k <= rings ? at(r.ringIdx, k - 1) : r.pts.length - 1;
  };
  const arc = (k: number, i: number): Pt[] =>
    k === 0 ? [] : k <= rings ? at(at(c.rings, k - 1).arcs, i) : at(far, i);
  const vertex = (i: number, j: number): Pt => at(at(c.rays, i).pts, j);
  const out: Pt[] = [];
  const left = ray(i0);
  const right = ray(i0 + span);
  for (let j = idx(left, k0); j <= idx(left, k1 + 1); j++) out.push(vertex(left, j));
  for (let w = 0; w < span; w++) {
    const i = ray(i0 + w);
    out.push(...arc(k1 + 1, i));
    if (w < span - 1) out.push(vertex(ray(i + 1), idx(ray(i + 1), k1 + 1)));
  }
  for (let j = idx(right, k1 + 1); j >= idx(right, k0); j--) out.push(vertex(right, j));
  if (k0 === 0) {
    out.pop(); // the hit again
  } else {
    for (let w = span - 1; w >= 0; w--) {
      const i = ray(i0 + w);
      out.push(...[...arc(k0, i)].reverse());
      if (w > 0) out.push(vertex(i, idx(i, k0)));
    }
  }
  return out;
}

/** A column's band groups as [first band, last band]. */
function bandsOf(col: Column, rings: number): [number, number][] {
  const edges = [0, ...col.cuts, rings + 1];
  return edges.slice(0, -1).map((e, j) => [e, at(edges, j + 1) - 1]);
}

const smallest = (xs: Cell[]): Cell => xs.reduce((m, x) => (x.area < m.area ? x : m));

/**
 * Shatter the pane along `crack` into at most `maxShards` pieces, flying out from the hit
 * harder for a stronger hit.
 */
export function shatter(crack: Crack, b: Bounds, maxShards: number, strength: number): Shard[] {
  const rings = crack.rings.length;
  const far = farArcs(crack);
  const sliver = SLIVER * b.w * b.h;
  const cuts = Array.from({ length: rings - 1 }, (_, k) => k + 2);
  let cols: Column[] = crack.rays.map((_, i) => ({ i0: i, span: 1, cuts: [...cuts] }));

  const cellsOf = (): Cell[] =>
    cols.flatMap((col, ci) =>
      bandsOf(col, rings).map(([k0, k1], band) => {
        const poly = clip(cellPoly(crack, far, col.i0, col.span, k0, k1), b);
        const area = poly.length >= 3 ? Math.abs(polyArea(poly)) : 0;
        return { col: ci, band, cuts: col.cuts.length, poly, area };
      }),
    );
  const colArea = (cells: Cell[], ci: number): number =>
    cells.reduce((s, x) => s + (x.col === ci ? x.area : 0), 0);
  /** Remove the cut between band group `band` and its outer (or inner) neighbour. */
  const mergeBands = (x: Cell, outward: boolean): void => {
    const drop = outward ? x.band : x.band - 1;
    cols = cols.map((c, j) =>
      j === x.col ? { ...c, cuts: c.cuts.filter((_, k) => k !== drop) } : c,
    );
  };
  /** Join column ci with the next one, keeping only the cuts both still have. */
  const mergeCols = (ci: number): void => {
    const nj = (ci + 1) % cols.length;
    const a = at(cols, ci);
    const z = at(cols, nj);
    const joined = {
      i0: a.i0,
      span: a.span + z.span,
      cuts: a.cuts.filter((k) => z.cuts.includes(k)),
    };
    cols = cols.flatMap((col, j) => (j === ci ? [joined] : j === nj ? [] : [col]));
  };

  for (;;) {
    const cells = cellsOf();
    const live = cells.filter((x) => x.area > 1e-6);
    const small = live.filter((x) => x.area < sliver);
    const whole = cols.length < 2 && (cols[0]?.cuts.length ?? 0) === 0;
    if (whole || (live.length <= maxShards && small.length === 0)) {
      const polys = refine(
        live.map((x) => x.poly),
        crack,
        b,
        maxShards,
      );
      return polys.map((p) => launch(p, Math.abs(polyArea(p)), crack, b, strength));
    }
    const pool = small.length > 0 ? small : live;
    const banded = pool.filter((x) => x.cuts > 0);
    if (banded.length > 0) {
      const x = smallest(banded);
      mergeBands(x, x.band < x.cuts);
    } else {
      const x = smallest(pool);
      const prev = (x.col - 1 + cols.length) % cols.length;
      const next = (x.col + 1) % cols.length;
      mergeCols(colArea(cells, prev) < colArea(cells, next) ? prev : x.col);
    }
  }
}

/** The part of `poly` on the side of the line through c where n·(p − c) ≥ 0. */
function halfPlane(poly: Pt[], c: Pt, nx: number, ny: number): Pt[] {
  const side = (p: Pt): number => (p.x - c.x) * nx + (p.y - c.y) * ny;
  const out: Pt[] = [];
  poly.forEach((p, i) => {
    const q = ring(poly, i + 1);
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  });
  return out.filter((p, i) => {
    const q = ring(out, i + 1);
    return Math.abs(p.x - q.x) > 1e-9 || Math.abs(p.y - q.y) > 1e-9;
  });
}

/**
 * Halve the piece furthest over its target size until none is over or the cap is reached. A
 * piece is cut across its longest reach from the centroid, with a seeded tilt.
 */
function refine(polys: Pt[][], c: Crack, b: Bounds, cap: number): Pt[][] {
  const paneArea = b.w * b.h;
  const sliver = SLIVER * paneArea;
  const reach = SHARD_FALLOFF * Math.hypot(b.w, b.h);
  const target = (p: Pt): number => {
    const t = clamp01(Math.hypot(p.x - c.hit.x, p.y - c.hit.y) / reach);
    return paneArea * (SHARD_NEAR + (SHARD_FAR - SHARD_NEAR) * t);
  };
  const rng = mulberry32(c.seed ^ 0x2545f491);
  const out = polys.map((poly) => ({ poly, m: centroid(poly), area: Math.abs(polyArea(poly)) }));
  const stuck = new Set<Pt[]>();
  while (out.length < cap) {
    let best = -1;
    let over = 1;
    out.forEach((x, i) => {
      const r = x.area / target(x.m);
      if (r > over && !stuck.has(x.poly)) {
        over = r;
        best = i;
      }
    });
    if (best < 0) break;
    const x = at(out, best);
    const far = x.poly.reduce((f, p) =>
      Math.hypot(p.x - x.m.x, p.y - x.m.y) > Math.hypot(f.x - x.m.x, f.y - x.m.y) ? p : f,
    );
    const a = Math.atan2(far.y - x.m.y, far.x - x.m.x) + (rng.next() - 0.5) * 0.6;
    const halves = [1, -1].map((k) => halfPlane(x.poly, x.m, k * Math.cos(a), k * Math.sin(a)));
    const areas = halves.map((h) => (h.length >= 3 ? Math.abs(polyArea(h)) : 0));
    if (areas.some((v) => v < sliver)) {
      stuck.add(x.poly);
      continue;
    }
    out.splice(
      best,
      1,
      ...halves.map((poly, k) => ({ poly, m: centroid(poly), area: at(areas, k) })),
    );
  }
  return out.map((x) => x.poly);
}

/** A shard's outward kick: faster near the hit and for harder hits, with seeded jitter. */
function launch(poly: Pt[], area: number, c: Crack, b: Bounds, strength: number): Shard {
  const m = centroid(poly);
  const rng = mulberry32(c.seed ^ Math.round(m.x * 131 + m.y * 7));
  const dx = m.x - c.hit.x;
  const dy = m.y - c.hit.y;
  const d = Math.hypot(dx, dy) || 1;
  const near = 1 - 0.5 * Math.min(1, d / Math.hypot(b.w, b.h));
  const speed = (120 + 620 * strength) * near * (0.6 + 0.6 * rng.next());
  return {
    poly: poly.map((p) => ({ x: p.x - m.x, y: p.y - m.y })),
    cx: m.x,
    cy: m.y,
    area,
    vx: (dx / d) * speed,
    vy: (dy / d) * speed - 120 * strength * rng.next(),
    w: (rng.next() - 0.5) * (1 + 5 * strength),
  };
}
