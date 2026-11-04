import { at, contains, type Pt } from "./geom";
import type { Seg } from "./network";
import type { ShardSim } from "./physics";
import type { Shard } from "./shards";

/**
 * Canvas drawing for the pane. Cracks are lit from the top left: a dark core whose width tapers to
 * the tips, a 1 px bright highlight offset toward the light, and inside each crack the pane's sheen
 * shifted by REFRACT px, as glass bends what's behind it. The pane and the committed cracks live on
 * offscreen layers, so a frame is a couple of blits plus the live crack or the shards.
 */

const GLASS = "rgba(196,214,222,0.9)";
const EDGE = "rgba(255,255,255,0.75)";
const CORE = "rgba(24,38,46,0.78)";
const HAIR = "rgba(30,46,56,0.42)";
const LIGHT = "rgba(255,255,255,0.9)";
/** Highlight offset toward the top-left light, and the refraction shift, px. */
const HL = 0.7;
const REFRACT = 1.5;

/** Size a canvas to `w`x`h` CSS px at `dpr`, with a CSS-px transform. */
export function fit(c: HTMLCanvasElement, w: number, h: number, dpr: number): void {
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
}

/** The frosted pane: a blue-grey tint with two diagonal reflection streaks. */
export function paintPane(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, "rgba(214,228,234,0.94)");
  sky.addColorStop(1, "rgba(150,172,184,0.9)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (const [x0, band] of [
    [0.15, 0.22],
    [0.52, 0.08],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(w * x0, 0);
    ctx.lineTo(w * (x0 + band), 0);
    ctx.lineTo(w * (x0 + band) - h * 0.6, h);
    ctx.lineTo(w * x0 - h * 0.6, h);
    ctx.fill();
  }
}

const poly = (ctx: CanvasRenderingContext2D | Path2D, pts: readonly Pt[], dx = 0, dy = 0) => {
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x + dx, p.y + dy);
    else ctx.lineTo(p.x + dx, p.y + dy);
  });
};

/** A crack network's segments, batched into one path per stroke width. */
export interface CrackArt {
  widths: number[];
  paths: Path2D[];
  hair: Path2D;
}

export function crackArt(segs: readonly Seg[]): CrackArt {
  const byWidth = new Map<number, Path2D>();
  const hair = new Path2D();
  for (const g of segs) {
    let path = hair;
    if (g.hit >= 0) {
      const w = Math.max(0.25, Math.round(g.w * 4) / 4);
      path = byWidth.get(w) ?? new Path2D();
      byWidth.set(w, path);
    }
    path.moveTo(g.ax, g.ay);
    path.lineTo(g.bx, g.by);
  }
  const widths = [...byWidth.keys()].sort((p, q) => q - p);
  return { widths, paths: widths.map((w) => byWidth.get(w) ?? hair), hair };
}

/** The dark core and the highlight (just the core when `flat`). */
export function strokeCracks(ctx: CanvasRenderingContext2D, art: CrackArt, flat: boolean): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 0.5;
  ctx.stroke(art.hair);
  ctx.strokeStyle = CORE;
  art.widths.forEach((w, i) => {
    ctx.lineWidth = w;
    ctx.stroke(at(art.paths, i));
  });
  if (flat) return;
  ctx.save();
  ctx.translate(-HL, -HL);
  ctx.strokeStyle = LIGHT;
  art.widths.forEach((w, i) => {
    ctx.lineWidth = w >= 0.8 ? 1 : 0.5;
    ctx.stroke(at(art.paths, i));
  });
  ctx.restore();
}

/** The committed-cracks layer: refraction (unless `flat`), then the strokes. */
export function paintCracks(
  ctx: CanvasRenderingContext2D,
  pane: CanvasImageSource,
  art: CrackArt,
  w: number,
  h: number,
  flat: boolean,
): void {
  ctx.clearRect(0, 0, w, h);
  if (!flat) {
    ctx.save();
    ctx.drawImage(pane, REFRACT, REFRACT, w, h);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(0, 0, w, h);
    // Keep the shifted sheen only inside the cracks, a little wider than their cores.
    ctx.globalCompositeOperation = "destination-in";
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    art.widths.forEach((lw, i) => {
      ctx.lineWidth = lw + 2.5;
      ctx.stroke(at(art.paths, i));
    });
    ctx.restore();
  }
  strokeCracks(ctx, art, flat);
}

export interface ShardArt {
  fill: Path2D[];
  /** Earlier cracks, carried by the shard they lie in. */
  cracks: Path2D[];
}

/** Paths in each shard's own frame; earlier cracks' segments go to the shard holding their middle. */
export function shardArt(shards: readonly Shard[], prior: readonly Seg[]): ShardArt {
  const fill = shards.map((s) => {
    const p = new Path2D();
    poly(p, s.poly);
    p.closePath();
    return p;
  });
  const cracks = shards.map(() => new Path2D());
  const world = shards.map((s) => s.poly.map((p) => ({ x: p.x + s.cx, y: p.y + s.cy })));
  const box = world.map((w) => {
    const xs = w.map((p) => p.x);
    const ys = w.map((p) => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
  });
  for (const g of prior) {
    if (g.hit < 0) continue;
    const mid = { x: (g.ax + g.bx) / 2, y: (g.ay + g.by) / 2 };
    const i = world.findIndex((w, j) => {
      const [x0, y0, x1, y1] = at(box, j);
      return mid.x >= x0 && mid.x <= x1 && mid.y >= y0 && mid.y <= y1 && contains(w, mid);
    });
    if (i < 0) continue;
    const s = at(shards, i);
    const path = at(cracks, i);
    path.moveTo(g.ax - s.cx, g.ay - s.cy);
    path.lineTo(g.bx - s.cx, g.by - s.cy);
  }
  return { fill, cracks };
}

/** Draw the live shards; `dpr` and the shake offset are folded into each transform. */
export function drawShards(
  ctx: CanvasRenderingContext2D,
  sim: ShardSim,
  art: ShardArt,
  dpr: number,
  dx: number,
  dy: number,
  flat: boolean,
): void {
  ctx.fillStyle = GLASS;
  ctx.strokeStyle = EDGE;
  ctx.lineJoin = "round";
  for (let i = 0; i < sim.n; i++) {
    const alpha = at(sim.alpha, i);
    if (at(sim.state, i) === 3 || alpha <= 0) continue;
    const a = at(sim.a, i);
    const c = Math.cos(a) * dpr;
    const s = Math.sin(a) * dpr;
    ctx.setTransform(c, s, -s, c, (at(sim.x, i) + dx) * dpr, (at(sim.y, i) + dy) * dpr);
    ctx.globalAlpha = alpha;
    const f = at(art.fill, i);
    ctx.fill(f);
    ctx.lineWidth = flat ? 1 : 1.4;
    ctx.stroke(f);
    ctx.lineWidth = 0.9;
    ctx.stroke(at(art.cracks, i));
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** The glass left in the frame. */
export function drawRemnant(
  ctx: CanvasRenderingContext2D,
  strips: readonly Path2D[],
  a: number,
): void {
  if (a <= 0) return;
  ctx.globalAlpha = a;
  ctx.fillStyle = GLASS;
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.lineJoin = "miter";
  for (const s of strips) {
    ctx.fill(s);
    ctx.stroke(s);
  }
  ctx.globalAlpha = 1;
}

/**
 * Darken the glass drawn so far, except a lit circle `r` px round the reveal at c: the light
 * comes through the hole. Only touches pixels already drawn this frame.
 */
export function dimGlass(
  ctx: CanvasRenderingContext2D,
  c: Pt,
  r: number,
  a: number,
  w: number,
  h: number,
): void {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(c.x, c.y, r * 0.6, c.x, c.y, r * 1.6);
  g.addColorStop(0, "rgba(6,12,18,0)");
  g.addColorStop(1, `rgba(6,12,18,${0.45 * a})`);
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Path2Ds for closed polygons. */
export function polyPaths(polys: readonly (readonly Pt[])[]): Path2D[] {
  return polys.map((p) => {
    const path = new Path2D();
    poly(path, p);
    path.closePath();
    return path;
  });
}
