import { mulberry32, type Rng } from "@committee-snake/shared";
import { at } from "./geom";
import { REVEALS, type Reveal } from "./reveals";

/**
 * Pure pane selection. A pane's number (1..9999) fixes its reveal, so "pane #1234" means the same
 * thing to everyone and `/glass#1234` reproduces it. New panes avoid the last 10 reveals.
 */

export const MAX_PANE = 9999;
const NO_REPEAT = 10;

/** Which entry of REVEALS pane `seed` hides. */
export const revealIndex = (seed: number): number => mulberry32(seed).int(REVEALS.length);

export const revealFor = (seed: number): Reveal => at(REVEALS, revealIndex(seed));

/** A pane number whose reveal isn't among `recent` (reveal indices, newest last). */
export function nextPaneSeed(rng: Rng, recent: readonly number[]): number {
  const avoid = new Set(recent.slice(-NO_REPEAT));
  for (;;) {
    const seed = 1 + rng.int(MAX_PANE);
    if (!avoid.has(revealIndex(seed))) return seed;
  }
}

/** The pane number in a `#1234` location hash, if it is one. */
export function paneFromHash(hash: string): number | null {
  const m = /^#(\d{1,4})$/.exec(hash);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= MAX_PANE ? n : null;
}
