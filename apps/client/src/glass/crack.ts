import { mulberry32 } from "@committee-snake/shared";
import { at, type Bounds, clamp01, inside, lerp, type Pt, ring } from "./geom";

/**
 * Pure crack geometry. A crack is a star of jittered rays from the hit point, crossed by 2–3
 * jittered rings. Each ray runs well past the pane edge, so the same geometry can later be cut
 * into shards (shards.ts). Only the part within the current reach is drawn, and a longer reach
 * only ever adds to what a shorter one drew, so a held press grows the same crack.
 */

interface Ray {
  /** Vertex 0 is the hit; the distance from it strictly increases. */
  pts: Pt[];
  /** Each vertex's distance from the hit. */
  radii: number[];
  /** Share of the reach this ray is drawn to (0.7–1). */
  length: number;
  /** The vertex where each ring meets this ray, ascending. */
  ringIdx: number[];
}

interface Ring {
  r: number;
  /** Per ray i: the ring's points strictly between ray i and ray i + 1. */
  arcs: Pt[][];
  /** Per ray i: whether the ring is drawn between ray i and ray i + 1 (cracks aren't circles). */
  shown: boolean[];
}

interface Branch {
  ray: number;
  /** Distance from the hit where the branch leaves its ray. */
  from: number;
  pts: Pt[];
}

export interface Crack {
  hit: Pt;
  seed: number;
  rays: Ray[];
  /** Ascending radius. */
  rings: Ring[];
  branches: Branch[];
  /** The reach at full strength. */
  reachMax: number;
  /** Every ray ends at least this far from the hit. */
  far: number;
}

/** The lines to draw for a crack at some reach. */
export interface CrackLines {
  rays: Pt[][];
  rings: Pt[][];
  branches: Pt[][];
}

const RING_AT = [0.16, 0.38, 0.66];

/** A 32-bit seed for one hit: the pane, the rounded hit point and which hit this is. */
export function hitSeed(paneSeed: number, x: number, y: number, hitIndex: number): number {
  let h = 0x811c9dc5;
  for (const v of [paneSeed, Math.round(x), Math.round(y), hitIndex]) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Rays drawn for a hit of this strength: 6 for the lightest tap, 12 for the hardest. */
export const rayCount = (strength: number): number => 6 + Math.floor(6 * clamp01(strength));

/** How far the crack has spread at this strength. */
export const reachFor = (c: Crack, strength: number): number =>
  c.reachMax * (0.18 + 0.82 * clamp01(strength));

const polar = (o: Pt, r: number, a: number): Pt => ({
  x: o.x + r * Math.cos(a),
  y: o.y + r * Math.sin(a),
});

export function crackAt(hit: Pt, strength: number, seed: number, b: Bounds): Crack {
  const rng = mulberry32(seed);
  const s = clamp01(strength);
  const n = rayCount(s);
  const min = Math.min(b.w, b.h);
  const diag = Math.hypot(b.w, b.h);
  const reachMax = 0.8 * min;
  const far = 1.5 * diag;
  const sp = (2 * Math.PI) / n;
  const a0 = rng.next() * 2 * Math.PI;
  const ringR = RING_AT.slice(0, s >= 0.5 ? 3 : 2).map(
    (f) => f * reachMax * (0.92 + 0.16 * rng.next()),
  );

  const angles: number[][] = [];
  const rays: Ray[] = [];
  for (let i = 0; i < n; i++) {
    const theta = a0 + i * sp + (rng.next() - 0.5) * 0.5 * sp;
    // Short jagged steps where the crack shows, long ones out to the far radius.
    const steps: number[] = [];
    for (let r = 0; r < far; ) {
      r +=
        r < reachMax * 1.05 ? min * (0.04 + 0.04 * rng.next()) : diag * (0.12 + 0.08 * rng.next());
      steps.push(r);
    }
    const gap = min * 0.016;
    const targets = ringR.map((r) => r * (0.95 + 0.1 * rng.next()));
    const radii = [
      0,
      ...steps.filter((r) => targets.every((t) => Math.abs(r - t) > gap)),
      ...targets,
    ];
    radii.sort((p, q) => p - q);
    const an = radii.map(() => theta + (rng.next() - 0.5) * 0.3 * sp);
    angles.push(an);
    rays.push({
      pts: radii.map((r, j) => polar(hit, r, at(an, j))),
      radii,
      length: 0.7 + 0.3 * rng.next(),
      ringIdx: targets.map((t) => radii.indexOf(t)),
    });
  }

  // Rings: between each pair of neighbouring rays, a few points at about the ring's radius.
  const rings: Ring[] = ringR.map((r, k) => {
    const arcs: Pt[][] = [];
    const shown: boolean[] = [];
    rays.forEach((ray, i) => {
      const next = ring(rays, i + 1);
      const ia = at(ray.ringIdx, k);
      const ib = at(next.ringIdx, k);
      const aa = at(at(angles, i), ia);
      let span = at(ring(angles, i + 1), ib) - aa;
      while (span <= 0) span += 2 * Math.PI;
      const m = Math.max(2, Math.ceil(span / (Math.PI / 10)));
      const ra = at(ray.radii, ia);
      const rb = at(next.radii, ib);
      const pts: Pt[] = [];
      for (let q = 1; q < m; q++) {
        const t = q / m;
        pts.push(polar(hit, (ra * (1 - t) + rb * t) * (0.97 + 0.06 * rng.next()), aa + span * t));
      }
      arcs.push(pts);
      shown.push(rng.next() < 0.75);
    });
    return { r, arcs, shown };
  });

  const branches: Branch[] = [];
  rays.forEach((ray, i) => {
    if (rng.next() >= 0.35) return;
    const lo = 0.25 * reachMax * ray.length;
    const hi = 0.85 * reachMax * ray.length;
    const js = ray.radii.flatMap((r, j) => (r >= lo && r <= hi ? [j] : []));
    if (js.length === 0) return;
    const j = at(js, rng.int(js.length));
    const from = at(ray.pts, j);
    if (!inside(from, b)) return;
    const a = at(at(angles, i), j) + (rng.next() < 0.5 ? -1 : 1) * (0.35 + 0.35 * rng.next());
    const len = min * (0.04 + 0.05 * rng.next());
    const mid = polar(from, len / 2, a);
    const end = polar(mid, len / 2, a + (rng.next() - 0.5) * 0.4);
    branches.push({ ray: i, from: at(ray.radii, j), pts: clipLine([from, mid, end], b) });
  });

  return { hit, seed, rays, rings, branches, reachMax, far };
}

/** Where (0..1) segment p→q leaves the pane; p is inside. */
function exitT(p: Pt, q: Pt, b: Bounds): number {
  let t = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (dx > 0) t = Math.min(t, (b.w - p.x) / dx);
  if (dx < 0) t = Math.min(t, -p.x / dx);
  if (dy > 0) t = Math.min(t, (b.h - p.y) / dy);
  if (dy < 0) t = Math.min(t, -p.y / dy);
  return Math.max(0, t);
}

/** The polyline up to where it first leaves the pane. */
function clipLine(pts: Pt[], b: Bounds): Pt[] {
  const out = [at(pts, 0)];
  for (let j = 1; j < pts.length; j++) {
    const p = at(pts, j - 1);
    const q = at(pts, j);
    if (!inside(q, b)) {
      out.push(lerp(p, q, exitT(p, q, b)));
      break;
    }
    out.push(q);
  }
  return out;
}

/** A ray cut at distance `len` from the hit and at the pane edge. */
function rayTo(hit: Pt, ray: Ray, len: number, b: Bounds): Pt[] {
  const out = [hit];
  for (let j = 1; j < ray.pts.length; j++) {
    const p = at(ray.pts, j - 1);
    const q = at(ray.pts, j);
    let t = 1;
    if (at(ray.radii, j) > len) {
      // Solve |p - hit + t(q - p)| = len for t.
      const px = p.x - hit.x;
      const py = p.y - hit.y;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const A = dx * dx + dy * dy;
      const B = px * dx + py * dy;
      const C = px * px + py * py - len * len;
      t = clamp01((-B + Math.sqrt(Math.max(0, B * B - A * C))) / A);
    }
    const e = inside(q, b) ? 1 : exitT(p, q, b);
    if (t < 1 || e < 1) {
      const end = Math.min(t, e);
      if (end > 0) out.push(lerp(p, q, end));
      break;
    }
    out.push(q);
  }
  return out;
}

/** What to draw at this reach. A longer reach only adds lines and lengthens rays. */
export function crackLines(c: Crack, reach: number, b: Bounds): CrackLines {
  const len = c.rays.map((ray) => reach * ray.length);
  const rays = c.rays.map((ray, i) => rayTo(c.hit, ray, at(len, i), b));
  const rings: Pt[][] = [];
  c.rings.forEach((rg, k) => {
    c.rays.forEach((ray, i) => {
      const next = ring(c.rays, i + 1);
      const ia = at(ray.ringIdx, k);
      const ib = at(next.ringIdx, k);
      if (!at(rg.shown, i) || at(ray.radii, ia) > at(len, i)) return;
      if (at(next.radii, ib) > ring(len, i + 1)) return;
      const line = [at(ray.pts, ia), ...at(rg.arcs, i), at(next.pts, ib)];
      if (line.every((p) => inside(p, b))) rings.push(line);
    });
  });
  const branches = c.branches.filter((br) => br.from <= at(len, br.ray)).map((br) => br.pts);
  return { rays, rings, branches };
}
