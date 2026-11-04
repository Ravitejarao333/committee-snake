import { at } from "./geom";
import type { Shard } from "./shards";

/**
 * Pure shard physics in flat typed arrays (no allocation per frame). Shards fall under gravity
 * with a slight spin, bounce exactly once off the floor, fade over 350 ms from that bounce and
 * then stop. A shard that lands a second time just stays put while it finishes fading.
 */

const GRAVITY = 2600; // px/s²
const RESTITUTION = 0.3;
const FRICTION = 0.6;
export const FADE_MS = 350;
/** Steps longer than this are clamped, so a stalled tab doesn't fling shards through the floor. */
const MAX_DT_MS = 50;

/** 0 flying, 1 bounced (fading), 2 resting (fading), 3 gone. */
const FLYING = 0;
const BOUNCED = 1;
const RESTING = 2;
const GONE = 3;

export interface ShardSim {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Rotation, rad. */
  a: Float32Array;
  w: Float32Array;
  alpha: Float32Array;
  /** How far below its centroid the shard meets the floor. */
  foot: Float32Array;
  state: Uint8Array;
}

export function createSim(shards: readonly Shard[]): ShardSim {
  const n = shards.length;
  const s: ShardSim = {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    a: new Float32Array(n),
    w: new Float32Array(n),
    alpha: new Float32Array(n).fill(1),
    foot: new Float32Array(n),
    state: new Uint8Array(n),
  };
  shards.forEach((sh, i) => {
    s.x[i] = sh.cx;
    s.y[i] = sh.cy;
    s.vx[i] = sh.vx;
    s.vy[i] = sh.vy;
    s.w[i] = sh.w;
    // Shards tumble, so use about half the bounding radius rather than the true lowest point.
    s.foot[i] = 0.5 * Math.max(...sh.poly.map((p) => Math.hypot(p.x, p.y)));
  });
  return s;
}

/**
 * Advance by `dtMs` (already time-scaled). `onBounce(i, speed)` fires once per shard, at its
 * floor bounce, with the impact speed in px/s. Returns how many shards are still visible.
 */
export function stepShards(
  s: ShardSim,
  dtMs: number,
  floorY: number,
  onBounce?: (i: number, speed: number) => void,
): number {
  const ms = dtMs > 0 ? Math.min(dtMs, MAX_DT_MS) : 0;
  const dt = ms / 1000;
  let live = 0;
  for (let i = 0; i < s.n; i++) {
    const st = at(s.state, i);
    if (st === GONE) continue;
    if (st !== FLYING) {
      const alpha = at(s.alpha, i) - ms / FADE_MS;
      s.alpha[i] = Math.max(0, alpha);
      if (alpha <= 0) {
        s.state[i] = GONE;
        continue;
      }
    }
    live++;
    if (st === RESTING) continue;
    const vy = at(s.vy, i) + GRAVITY * dt;
    let y = at(s.y, i) + vy * dt;
    s.x[i] = at(s.x, i) + at(s.vx, i) * dt;
    s.a[i] = at(s.a, i) + at(s.w, i) * dt;
    s.vy[i] = vy;
    const floor = floorY - at(s.foot, i);
    if (y >= floor && vy > 0) {
      y = floor;
      if (st === FLYING) {
        s.vy[i] = -vy * RESTITUTION;
        s.vx[i] = at(s.vx, i) * FRICTION;
        s.w[i] = at(s.w, i) * 0.5;
        s.state[i] = BOUNCED;
        onBounce?.(i, vy);
      } else {
        s.vy[i] = 0;
        s.vx[i] = 0;
        s.w[i] = 0;
        s.state[i] = RESTING;
      }
    }
    s.y[i] = y;
  }
  return live;
}
