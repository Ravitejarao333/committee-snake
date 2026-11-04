import type { CrackLines } from "./crack";
import { at, contains, type Pt } from "./geom";
import type { ShardSim } from "./physics";
import type { Shard } from "./shards";

/**
 * Canvas drawing for the pane. The backdrop is DOM, so real refraction isn't possible; cracks get
 * a fake bevel instead (a dark and a light stroke either side of a bright core). The pane and the
 * committed cracks live on offscreen layers, so a frame is a couple of blits plus the shards.
 */

const GLASS = "rgba(196,214,222,0.9)";
const EDGE = "rgba(255,255,255,0.75)";
const SHADE = "rgba(20,40,50,0.35)";

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

const allLines = (l: CrackLines): Pt[][] => [...l.rays, ...l.rings, ...l.branches];

/** Stroke a crack with the bevel (or just the core when `flat`). */
export function strokeCrack(ctx: CanvasRenderingContext2D, l: CrackLines, flat: boolean): void {
  const lines = allLines(l);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const pass = (style: string, width: number, d: number): void => {
    ctx.beginPath();
    for (const line of lines) poly(ctx, line, d, d);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  if (!flat) {
    pass(SHADE, 1, 0.8);
    pass("rgba(255,255,255,0.5)", 1, -0.8);
  }
  pass("rgba(255,255,255,0.95)", 0.9, 0);
}

export interface ShardArt {
  fill: Path2D[];
  /** Earlier cracks, carried by the shard they lie in. */
  cracks: Path2D[];
}

/** Paths in each shard's own frame; earlier cracks' segments go to the shard holding their middle. */
export function shardArt(shards: readonly Shard[], prior: readonly CrackLines[]): ShardArt {
  const fill = shards.map((s) => {
    const p = new Path2D();
    poly(p, s.poly);
    p.closePath();
    return p;
  });
  const cracks = shards.map(() => new Path2D());
  const world = shards.map((s) => s.poly.map((p) => ({ x: p.x + s.cx, y: p.y + s.cy })));
  for (const l of prior) {
    for (const line of allLines(l)) {
      for (let k = 1; k < line.length; k++) {
        const a = at(line, k - 1);
        const b = at(line, k);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const i = world.findIndex((w) => contains(w, mid));
        if (i < 0) continue;
        const s = at(shards, i);
        const path = at(cracks, i);
        path.moveTo(a.x - s.cx, a.y - s.cy);
        path.lineTo(b.x - s.cx, b.y - s.cy);
      }
    }
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
