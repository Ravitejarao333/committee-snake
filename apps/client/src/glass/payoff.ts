import { mulberry32 } from "@committee-snake/shared";
import { at, type Bounds, clamp01, type Pt } from "./geom";
import { SLIVERS_MAX, SLIVERS_MIN } from "./tuning";

/**
 * The shatter payoff beyond the shards: glittering slivers (thin pooled triangles that twinkle as
 * they spin down) and the jagged glass left in the frame for a moment.
 */

const POOL = SLIVERS_MAX;

/** Slivers for a shatter of strength s. */
export const sliverCount = (s: number): number =>
  Math.round(SLIVERS_MIN + (SLIVERS_MAX - SLIVERS_MIN) * clamp01(s));

export interface Slivers {
  emit(x: number, y: number, s: number, rnd: () => number): void;
  /** Advance by `dtMs`; returns how many are alive. */
  step(dtMs: number): number;
  draw(ctx: CanvasRenderingContext2D): void;
  readonly alive: number;
}

export function createSlivers(): Slivers {
  const f = (): Float32Array => new Float32Array(POOL);
  const x = f();
  const y = f();
  const vx = f();
  const vy = f();
  const a = f();
  const w = f();
  const len = f();
  const age = f();
  const life = f();
  const phase = f();
  let n = 0;
  let alive = 0;

  return {
    emit(px, py, s, rnd) {
      n = sliverCount(s);
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2;
        const v = (250 + 550 * s) * (0.3 + 0.7 * rnd());
        x[i] = px;
        y[i] = py;
        vx[i] = Math.cos(ang) * v;
        vy[i] = Math.sin(ang) * v - 200;
        a[i] = rnd() * Math.PI;
        w[i] = (rnd() - 0.5) * 18;
        len[i] = 4 + 8 * rnd();
        age[i] = 0;
        life[i] = 900 + 700 * rnd();
        phase[i] = rnd() * Math.PI * 2;
      }
    },
    step(dtMs) {
      const dt = Math.min(dtMs, 50) / 1000;
      alive = 0;
      for (let i = 0; i < n; i++) {
        if (at(age, i) >= at(life, i)) continue;
        age[i] = at(age, i) + dt * 1000;
        vx[i] = at(vx, i) * (1 - 1.2 * dt);
        vy[i] = at(vy, i) + 1100 * dt;
        x[i] = at(x, i) + at(vx, i) * dt;
        y[i] = at(y, i) + at(vy, i) * dt;
        a[i] = at(a, i) + at(w, i) * dt;
        alive++;
      }
      return alive;
    },
    draw(ctx) {
      if (!alive) return;
      ctx.fillStyle = "#f4fbff";
      for (let i = 0; i < n; i++) {
        const t = at(age, i) / at(life, i);
        if (t >= 1) continue;
        // Twinkle: brightest when the sliver turns edge-on to the light.
        const glint = Math.abs(Math.sin(at(phase, i) + at(age, i) * 0.018 + at(a, i)));
        ctx.globalAlpha = (1 - t) * (0.25 + 0.75 * glint);
        const c = Math.cos(at(a, i));
        const sn = Math.sin(at(a, i));
        const l = at(len, i) / 2;
        const cx = at(x, i);
        const cy = at(y, i);
        ctx.beginPath();
        ctx.moveTo(cx + c * l, cy + sn * l);
        ctx.lineTo(cx - c * l - sn * 0.8, cy - sn * l + c * 0.8);
        ctx.lineTo(cx - c * l + sn * 0.8, cy - sn * l - c * 0.8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    get alive() {
      return alive;
    },
  };
}

/**
 * The glass still stuck in the frame: one jagged strip along each side, mostly 3–12 px deep with
 * the odd longer spike, as closed polygons.
 */
export function remnant(b: Bounds, seed: number): Pt[][] {
  const rng = mulberry32(seed ^ 0x68e31da4);
  const depth = (): number => (rng.next() < 0.12 ? 14 + 18 * rng.next() : 3 + 9 * rng.next());
  const strip = (len: number, map: (along: number, inward: number) => Pt): Pt[] => {
    const pts: Pt[] = [map(len, 0), map(0, 0)];
    for (let t = 0; t < len; t += 10 + 22 * rng.next()) pts.push(map(t, depth()));
    pts.push(map(len, depth()));
    return pts;
  };
  return [
    strip(b.w, (u, v) => ({ x: u, y: v })),
    strip(b.h, (u, v) => ({ x: b.w - v, y: u })),
    strip(b.w, (u, v) => ({ x: b.w - u, y: b.h - v })),
    strip(b.h, (u, v) => ({ x: v, y: b.h - u })),
  ];
}
