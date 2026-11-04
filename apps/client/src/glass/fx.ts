import type { Rng } from "@committee-snake/shared";
import { clamp01 } from "./geom";

/**
 * Screen effects for a shatter: a short decaying shake, slow motion on the session's first
 * shatter, and a flash at the hole. Reduced motion (read live) turns off shake and slow motion;
 * the flash and the shards stay.
 */

export const SHAKE_MS = 40;
const SHAKE_PX = 6;
export const SLOWMO_SCALE = 0.4;
export const SLOWMO_MS = 300;
export const FLASH_MS = 120;
const SLOWMO_KEY = "break-glass:slowmo";

/** Shake amplitude in px, `elapsed` ms into a shake of strength s. */
export const shakeAmp = (elapsed: number, s: number): number =>
  elapsed < 0 || elapsed >= SHAKE_MS ? 0 : SHAKE_PX * clamp01(s) * (1 - elapsed / SHAKE_MS);

/** Time scale `elapsed` ms into a slow-motion window. */
export const timeScaleAt = (elapsed: number): number =>
  elapsed >= 0 && elapsed < SLOWMO_MS ? SLOWMO_SCALE : 1;

export const flashAlpha = (elapsed: number): number =>
  elapsed < 0 || elapsed >= FLASH_MS ? 0 : 0.9 * (1 - elapsed / FLASH_MS);

export interface FxFrame {
  dx: number;
  dy: number;
  /** Game-time per real time. */
  scale: number;
}

export interface Fx {
  shatter(x: number, y: number, s: number, now: number): void;
  frame(now: number): FxFrame;
  drawFlash(ctx: CanvasRenderingContext2D, now: number): void;
  /** Length of the last shake, ms (0 under reduced motion). */
  readonly shakeMs: number;
  /** Whether any of the effects is still running. */
  busy(now: number): boolean;
}

const firstThisSession = (): boolean => {
  try {
    if (sessionStorage.getItem(SLOWMO_KEY)) return false;
    sessionStorage.setItem(SLOWMO_KEY, "1");
  } catch {
    // No storage: slow motion on every page load is fine.
  }
  return true;
};

export function createFx(rng: Rng): Fx {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let shakeAt = -Infinity;
  let shakeS = 0;
  let shakeMs = 0;
  let slowAt = -Infinity;
  let flashAt = -Infinity;
  let fx = 0;
  let fy = 0;
  let fr = 0;

  return {
    shatter(x, y, s, now) {
      flashAt = now;
      fx = x;
      fy = y;
      fr = 120 + 200 * clamp01(s);
      if (reduced.matches) {
        shakeMs = 0;
        return;
      }
      shakeAt = now;
      shakeS = s;
      shakeMs = SHAKE_MS;
      if (firstThisSession()) slowAt = now;
    },
    frame(now) {
      const motion = !reduced.matches;
      const amp = motion ? shakeAmp(now - shakeAt, shakeS) : 0;
      return {
        dx: amp ? (rng.next() * 2 - 1) * amp : 0,
        dy: amp ? (rng.next() * 2 - 1) * amp : 0,
        scale: motion ? timeScaleAt(now - slowAt) : 1,
      };
    },
    drawFlash(ctx, now) {
      const a = flashAlpha(now - flashAt);
      if (!a) return;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.fillRect(fx - fr, fy - fr, 2 * fr, 2 * fr);
      ctx.restore();
    },
    get shakeMs() {
      return shakeMs;
    },
    busy: (now) => now - flashAt < FLASH_MS || now - shakeAt < SHAKE_MS || now - slowAt < SLOWMO_MS,
  };
}
