import { mulberry32 } from "@committee-snake/shared";
import type { CrackLines } from "./crack";
import { at, type Bounds, clamp01, lerp, type Pt } from "./geom";
import { BRIDGE_MAX, WEB_AT, WEB_MAX } from "./tuning";

/**
 * Pure crack network. Every hit's lines join one network: a new crack's lines stop where they meet
 * an older crack (real cracks don't cross), and a hit that touches none bridges to the nearest
 * crack within reach, so the damage reads as one growing web instead of separate stars. Lines are
 * cut into tapered segments for drawing; a grid makes the crossing tests cheap.
 */

/** One straight piece of crack, `w` px wide, from hit `hit` (-1 for a hairline). */
export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  w: number;
  hit: number;
}

export interface Network {
  b: Bounds;
  segs: Seg[];
  /** Grid cell → indices into segs. */
  grid: Map<number, number[]>;
  /** Union-find over hits, for the connected components. */
  parent: number[];
}

/** What one hit adds: its segments, and the older hits they touch. */
export interface Traced {
  segs: Seg[];
  met: number[];
}

const CELL = 32;
/** A crack starting on an older one ignores crossings this close to its start, px. */
const SKIP = 3;
/** Widths, px: a ray at the hit (plus more for a harder hit), a ring, a branch and every tip. */
const RAY_W = 1.6;
const RAY_W_GAIN = 1.4;
const RING_W = 1.1;
const BRANCH_W = 0.9;
const TIP_W = 0.35;
const HAIR_W = 0.45;

export const createNetwork = (b: Bounds): Network => ({ b, segs: [], grid: new Map(), parent: [] });

function eachCell(s: Seg, f: (key: number) => void): void {
  const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL);
  const x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
  const y0 = Math.floor(Math.min(s.ay, s.by) / CELL);
  const y1 = Math.floor(Math.max(s.ay, s.by) / CELL);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(y * 4096 + x);
}

function find(net: Network, i: number): number {
  let r = i;
  while (at(net.parent, r) !== r) r = at(net.parent, r);
  return r;
}

/** Connected groups of hits. */
export function components(net: Network): number {
  const roots = new Set<number>();
  net.parent.forEach((_, i) => {
    roots.add(find(net, i));
  });
  return roots.size;
}

/** Where (0..1 along p→q) it crosses s, or -1. */
function crossT(p: Pt, q: Pt, s: Seg): number {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = s.bx - s.ax;
  const sy = s.by - s.ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const ox = s.ax - p.x;
  const oy = s.ay - p.y;
  const t = (ox * sy - oy * sx) / den;
  const u = (ox * ry - oy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/** The earliest crossing of p→q with an older crack, past `from` (0..1). */
function firstCross(net: Network, p: Pt, q: Pt, from: number): { t: number; hit: number } | null {
  let best: { t: number; hit: number } | null = null;
  const probe: Seg = { ax: p.x, ay: p.y, bx: q.x, by: q.y, w: 0, hit: -1 };
  eachCell(probe, (k) => {
    for (const i of net.grid.get(k) ?? []) {
      const s = at(net.segs, i);
      if (s.hit < 0) continue;
      const t = crossT(p, q, s);
      if (t > from && (!best || t < best.t)) best = { t, hit: s.hit };
    }
  });
  return best;
}

/**
 * The polyline up to where it first meets an older crack, and that crack's hit (or -1). Crossings
 * within `skip` px of the start don't count.
 */
function stopAtNet(net: Network, pts: readonly Pt[], skip: number): { pts: Pt[]; met: number } {
  const out = [at(pts, 0)];
  let run = 0;
  for (let j = 1; j < pts.length; j++) {
    const p = at(pts, j - 1);
    const q = at(pts, j);
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const c = firstCross(net, p, q, Math.max(0, (skip - run) / len));
    if (c) {
      out.push(lerp(p, q, c.t));
      return { pts: out, met: c.hit };
    }
    out.push(q);
    run += len;
  }
  return { pts: out, met: -1 };
}

/** Cut a polyline into segments, w0 wide at the start (or the middle, `both`) down to w1. */
function taper(pts: readonly Pt[], w0: number, w1: number, both: boolean, hit: number): Seg[] {
  const lens: number[] = [];
  let total = 0;
  for (let j = 1; j < pts.length; j++) {
    const p = at(pts, j - 1);
    const q = at(pts, j);
    total += Math.hypot(q.x - p.x, q.y - p.y);
    lens.push(total);
  }
  const out: Seg[] = [];
  for (let j = 1; j < pts.length; j++) {
    const p = at(pts, j - 1);
    const q = at(pts, j);
    const m = total > 0 ? (at(lens, j - 1) - Math.hypot(q.x - p.x, q.y - p.y) / 2) / total : 0;
    const k = both ? Math.sin(Math.PI * m) : (1 - m) ** 0.7;
    out.push({ ax: p.x, ay: p.y, bx: q.x, by: q.y, w: w1 + (w0 - w1) * k, hit });
  }
  return out;
}

/** Distance from p to segment s, and the nearest point. */
function toSeg(p: Pt, s: Seg): { d: number; q: Pt } {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const t = clamp01(((p.x - s.ax) * dx + (p.y - s.ay) * dy) / (dx * dx + dy * dy || 1));
  const q = { x: s.ax + dx * t, y: s.ay + dy * t };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q };
}

/** The nearest point on any crack (not hairlines), or null on a clean pane. */
function nearest(net: Network, p: Pt): { d: number; q: Pt; hit: number } | null {
  let best: { d: number; q: Pt; hit: number } | null = null;
  for (const s of net.segs) {
    if (s.hit < 0) continue;
    const n = toSeg(p, s);
    if (!best || n.d < best.d) best = { ...n, hit: s.hit };
  }
  return best;
}

/** How far p is from the nearest crack (Infinity on a clean pane). */
export const crackDist = (net: Network, p: Pt): number =>
  nearest(net, p)?.d ?? Number.POSITIVE_INFINITY;

/** What a hit at `hit` with these lines would add, without adding it. */
export function trace(net: Network, hit: Pt, l: CrackLines, s: number, seed: number): Traced {
  const id = net.parent.length;
  const segs: Seg[] = [];
  const met = new Set<number>();
  /** Only lines leaving the hit may start on an older crack (`fromHit`, a hit on a crack). */
  const add = (pts: readonly Pt[], w0: number, both: boolean, fromHit: boolean): void => {
    if (pts.length < 2) return;
    const c = stopAtNet(net, pts, fromHit ? SKIP : 0);
    if (c.met >= 0) met.add(c.met);
    segs.push(...taper(c.pts, w0, TIP_W, both, id));
  };
  const rayW = RAY_W + RAY_W_GAIN * clamp01(s);
  for (const ray of l.rays) add(ray, rayW, false, true);
  for (const ring of l.rings) add(ring, RING_W, true, false);
  for (const br of l.branches) add(br, BRANCH_W, false, false);
  const near = met.size === 0 ? nearest(net, hit) : null;
  if (near && near.d <= BRIDGE_MAX * Math.min(net.b.w, net.b.h)) {
    // A jagged bridge out to the nearest crack.
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const nx = -(near.q.y - hit.y) / (near.d || 1);
    const ny = (near.q.x - hit.x) / (near.d || 1);
    const steps = 4 + Math.floor(near.d / 60);
    const pts: Pt[] = [hit];
    for (let k = 1; k < steps; k++) {
      const p = lerp(hit, near.q, k / steps);
      const j = (rng.next() - 0.5) * 0.14 * near.d;
      pts.push({
        x: Math.min(net.b.w, Math.max(0, p.x + nx * j)),
        y: Math.min(net.b.h, Math.max(0, p.y + ny * j)),
      });
    }
    pts.push(near.q);
    segs.push(...taper(pts, 0.85 * rayW, TIP_W + 0.3, false, id));
    met.add(near.hit);
  }
  return { segs, met: [...met] };
}

/** Add a traced hit to the network. */
export function commitHit(net: Network, t: Traced): void {
  const id = net.parent.length;
  net.parent.push(id);
  for (const m of t.met) net.parent[find(net, m)] = id;
  for (const s of t.segs) {
    const i = net.segs.push(s) - 1;
    eachCell(s, (k) => {
      const list = net.grid.get(k);
      if (list) list.push(i);
      else net.grid.set(k, [i]);
    });
  }
}

/**
 * The hairline web that fills in between cracks once damage passes WEB_AT: short jagged lines
 * leaving a crack at about a right angle and stopping at the next one. Not part of the network.
 */
export function web(net: Network, ratio: number, seed: number): Seg[] {
  const n = Math.round(WEB_MAX * clamp01((ratio - WEB_AT) / (1 - WEB_AT)));
  const main = net.segs.filter((s) => s.hit >= 0);
  const out: Seg[] = [];
  if (main.length === 0) return out;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32((seed + i * 0x9e37) >>> 0);
    const s = at(main, Math.floor(rng.next() * main.length));
    const a = lerp({ x: s.ax, y: s.ay }, { x: s.bx, y: s.by }, rng.next());
    const ang =
      Math.atan2(s.by - s.ay, s.bx - s.ax) +
      (rng.next() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rng.next() - 0.5) * 0.8);
    const len = 14 + 42 * rng.next();
    const bend = ang + (rng.next() - 0.5) * 0.6;
    const mid = { x: a.x + Math.cos(ang) * len * 0.5, y: a.y + Math.sin(ang) * len * 0.5 };
    const end = { x: mid.x + Math.cos(bend) * len * 0.5, y: mid.y + Math.sin(bend) * len * 0.5 };
    const c = stopAtNet(net, [a, mid, end], SKIP);
    for (const seg of taper(c.pts, HAIR_W, HAIR_W * 0.6, false, -1)) {
      const inPane = (x: number, y: number) => x >= 0 && y >= 0 && x <= net.b.w && y <= net.b.h;
      if (inPane(seg.ax, seg.ay) && inPane(seg.bx, seg.by)) out.push(seg);
    }
  }
  return out;
}
