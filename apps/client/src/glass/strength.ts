import { at, clamp01 } from "./geom";
import { BASE_STRENGTH, FLICK_FULL, HOLD_FULL_MS, SWING_FULL, TAP_MS } from "./tuning";

/**
 * Pure hit strength, 0..1, from pointer velocity and press duration only: a mouse carries its swing
 * into the click, a finger or pen flicks while down, and anything can be held. Contact area and
 * pressure are ignored (iOS reports neither, and some Android screens report full pressure for
 * any tap), so a plain tap is the same base hit on every device.
 */

export interface HitInput {
  /** Pointer speed over the ~60 ms before the press, px/s (0 for touch). */
  approach: number;
  /** How long the press has lasted, ms. */
  heldMs: number;
  /** Pointer speed while down, px/s. */
  flick: number;
  /** The pane's diagonal, to scale speeds by screen size. */
  diag: number;
}

export function strength(h: HitInput): number {
  const diag = Math.max(1, h.diag);
  const swing = clamp01(h.approach / diag / SWING_FULL);
  const flick = clamp01(h.flick / diag / FLICK_FULL);
  const hold = clamp01((h.heldMs - TAP_MS) / (HOLD_FULL_MS - TAP_MS));
  return clamp01(BASE_STRENGTH + (1 - BASE_STRENGTH) * (Math.max(swing, flick) + hold));
}

const WINDOW_MS = 60;
const SIZE = 16;

/** The last few pointer positions, for the speed just before a press or during one. */
export class MoveTrack {
  private readonly t = new Float64Array(SIZE);
  private readonly x = new Float64Array(SIZE);
  private readonly y = new Float64Array(SIZE);
  private n = 0;

  push(t: number, x: number, y: number): void {
    const i = this.n % SIZE;
    this.t[i] = t;
    this.x[i] = x;
    this.y[i] = y;
    this.n++;
  }

  clear(): void {
    this.n = 0;
  }

  /** Speed in px/s over the samples in the last 60 ms before `now`; 0 without two of them. */
  speed(now: number): number {
    const count = Math.min(this.n, SIZE);
    if (count < 2) return 0;
    const last = (this.n - 1) % SIZE;
    const tl = at(this.t, last);
    if (now - tl > WINDOW_MS) return 0;
    let first = last;
    for (let k = 1; k < count; k++) {
      const i = (this.n - 1 - k) % SIZE;
      if (now - at(this.t, i) > WINDOW_MS) break;
      first = i;
    }
    const dt = tl - at(this.t, first);
    if (dt <= 0) return 0;
    const dx = at(this.x, last) - at(this.x, first);
    const dy = at(this.y, last) - at(this.y, first);
    return (Math.hypot(dx, dy) / dt) * 1000;
  }
}
