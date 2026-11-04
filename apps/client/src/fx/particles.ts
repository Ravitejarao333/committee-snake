/**
 * A tiny pooled particle burst on a canvas: fixed-size typed arrays, no allocation per frame.
 * Used for glass dust on a shatter and sparkles on a prize.
 */

const POOL = 96;

interface Burst {
  x: number;
  y: number;
  count: number;
  /** Launch speed, px/s. */
  speed: number;
  /** Lifetime, ms. */
  life: number;
  /** Downward pull, px/s². */
  gravity: number;
  size: number;
  colors: readonly string[];
}

export interface Particles {
  emit(b: Burst, rnd: () => number): void;
  /** Advance by `dtMs`; returns how many are alive. */
  step(dtMs: number): number;
  draw(ctx: CanvasRenderingContext2D): void;
  readonly alive: number;
}

export function createParticles(): Particles {
  const x = new Float32Array(POOL);
  const y = new Float32Array(POOL);
  const vx = new Float32Array(POOL);
  const vy = new Float32Array(POOL);
  const age = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  const g = new Float32Array(POOL);
  const size = new Float32Array(POOL);
  const color: string[] = new Array<string>(POOL).fill("#fff");
  let alive = 0;
  let next = 0;

  return {
    emit(b, rnd) {
      for (let k = 0; k < b.count; k++) {
        const i = next;
        next = (next + 1) % POOL;
        const a = rnd() * Math.PI * 2;
        const v = b.speed * (0.3 + 0.7 * rnd());
        x[i] = b.x;
        y[i] = b.y;
        vx[i] = Math.cos(a) * v;
        vy[i] = Math.sin(a) * v - b.speed * 0.3;
        age[i] = 0;
        life[i] = b.life * (0.6 + 0.4 * rnd());
        g[i] = b.gravity;
        size[i] = b.size * (0.5 + rnd());
        color[i] = b.colors[Math.floor(rnd() * b.colors.length)] ?? "#fff";
      }
    },
    step(dtMs) {
      const dt = Math.min(dtMs, 50) / 1000;
      alive = 0;
      for (let i = 0; i < POOL; i++) {
        if ((age[i] ?? 0) >= (life[i] ?? 0)) continue;
        age[i] = (age[i] ?? 0) + dt * 1000;
        vy[i] = (vy[i] ?? 0) + (g[i] ?? 0) * dt;
        x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
        y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
        alive++;
      }
      return alive;
    },
    draw(ctx) {
      if (!alive) return;
      for (let i = 0; i < POOL; i++) {
        const l = life[i] ?? 0;
        const t = (age[i] ?? 0) / (l || 1);
        if (t >= 1) continue;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = color[i] ?? "#fff";
        const s = size[i] ?? 1;
        ctx.fillRect((x[i] ?? 0) - s / 2, (y[i] ?? 0) - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    },
    get alive() {
      return alive;
    },
  };
}
