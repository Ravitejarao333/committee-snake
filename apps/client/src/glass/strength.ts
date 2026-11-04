import { at, clamp01 } from "./geom";

/**
 * Pure hit strength, 0..1. A mouse carries its swing into the click; touch and pen have no motion
 * before contact, so they use contact area and real pressure where the device reports them, plus
 * how long the press lasts and how hard the finger flicks while down. iOS reports neither area nor
 * pressure, so there it comes down to duration and flick.
 */

export interface HitInput {
  /** Pointer speed over the ~60 ms before the press, px/s (0 for touch). */
  approach: number;
  /** How long the press has lasted, ms. */
  heldMs: number;
  /** Contact width × height, CSS px² (0 or ~1 when not reported). */
  area: number;
  /** PointerEvent.pressure. 0.5 is the "unknown" default and is ignored. */
  pressure: number;
  /** Pointer speed while down, px/s. */
  flick: number;
  /** The pane's diagonal, to scale speeds by screen size. */
  diag: number;
}

/** A held press shatters by itself at this age. */
export const HOLD_SHATTER_MS = 450;
/** A release faster than this many pane diagonals per second shatters. */
export const FLICK_SHATTER = 2.5;

export function strength(h: HitInput): number {
  const diag = Math.max(1, h.diag);
  const swing = clamp01(h.approach / diag / 3);
  const flick = clamp01(h.flick / diag / FLICK_SHATTER);
  const area = h.area > 1 ? clamp01((Math.sqrt(h.area) - 20) / 50) : 0;
  const pressure = h.pressure > 0 && h.pressure !== 0.5 ? clamp01(h.pressure) : 0;
  const hold = clamp01(h.heldMs / HOLD_SHATTER_MS);
  return clamp01(0.2 + 0.8 * Math.max(swing, flick, area, pressure) + 0.8 * hold);
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
