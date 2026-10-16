/** After a stall longer than this, resync instead of fast-forwarding the snake. */
const MAX_LAG_MS = 1000;

/**
 * Fixed-step tick clock, driven from rAF. Pure: runs every tick due at `now` (at most `max`,
 * so a stalled frame can't fast-forward the snake). `tick` runs one tick and returns the delay
 * to the next, or null when the round has stopped. Returns the new next-tick time.
 *
 * Input is not polled here: keydown handlers write votes as they arrive, and the tick reads
 * whatever is there when it runs, so a press any time before the frame that runs the tick
 * counts for that tick.
 */
export function runDueTicks(
  nextAt: number,
  now: number,
  tick: () => number | null,
  max = 3,
): number {
  let at = now - nextAt > MAX_LAG_MS ? now : nextAt;
  for (let i = 0; i < max && now >= at; i++) {
    const delay = tick();
    if (delay === null) break;
    at += delay;
  }
  return at;
}
