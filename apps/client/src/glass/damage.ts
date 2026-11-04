import { mulberry32 } from "@committee-snake/shared";
import { type Bounds, clamp01, type Pt } from "./geom";
import {
  BASE_DAMAGE,
  BASE_STRENGTH,
  EDGE_BAND,
  EDGE_MIN,
  MAX_MULT,
  PANE_STRENGTH,
  STRENGTH_SPREAD,
  WEAK_BONUS,
  WEAK_PX,
} from "./tuning";

/**
 * Pure damage model. Each pane has a strength budget; every hit adds damage for its strength and
 * where it lands (less near the frame, a bonus next to an existing crack), and the pane shatters
 * once the total reaches the budget, wherever the hits were.
 */

/** This pane's budget, PANE_STRENGTH ± STRENGTH_SPREAD. */
export function paneStrength(paneSeed: number): number {
  const u = mulberry32(paneSeed ^ 0x5bd1e995).next();
  return PANE_STRENGTH * (1 + STRENGTH_SPREAD * (2 * u - 1));
}

/** Hit strength (0..1) as a damage multiplier: 1 for a plain tap, MAX_MULT at full strength. */
export const multiplier = (s: number): number =>
  1 + ((MAX_MULT - 1) * clamp01(s - BASE_STRENGTH)) / (1 - BASE_STRENGTH);

/** EDGE_MIN on the frame, rising smoothly to 1 a band's width in. */
export function edgeFactor(p: Pt, b: Bounds): number {
  const d = Math.min(p.x, p.y, b.w - p.x, b.h - p.y) / (0.5 * Math.min(b.w, b.h));
  const t = clamp01(d / EDGE_BAND);
  return EDGE_MIN + (1 - EDGE_MIN) * t * t * (3 - 2 * t);
}

/** Damage of a hit of strength `s` at `p`, `crackDist` px from the nearest existing crack. */
export function hitDamage(s: number, p: Pt, b: Bounds, crackDist: number): number {
  const bonus = crackDist <= WEAK_PX ? WEAK_BONUS : 0;
  return BASE_DAMAGE * multiplier(s) * edgeFactor(p, b) + bonus;
}

/** Whether one more plain tap in the middle would break a pane with `dealt` of `max` damage. */
export const oneTapLeft = (dealt: number, max: number): boolean =>
  dealt < max && max - dealt <= BASE_DAMAGE;
