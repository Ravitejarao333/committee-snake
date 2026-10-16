/**
 * Pure round-flow machine for the local game (docs/PLAN.md §3.6, minus the
 * Blame Screen which is M2): lobby -> countdown -> playing -> dying -> over,
 * and any key from over starts the next countdown. Times are caller ms.
 */
export type PhaseName = "lobby" | "countdown" | "playing" | "dying" | "over";

export interface Phase {
  readonly name: PhaseName;
  /** When this phase began. */
  readonly since: number;
}

const POWER_ON_MS = 300;
const COUNTDOWN_DIGIT_MS = 700;
const COUNTDOWN_FROM = 3;
export const COUNTDOWN_MS = POWER_ON_MS + COUNTDOWN_FROM * COUNTDOWN_DIGIT_MS;
const DEATH_FREEZE_MS = 600;
const BLINK_MS = 100;

export const lobby = (now: number): Phase => ({ name: "lobby", since: now });
export const countdown = (now: number): Phase => ({ name: "countdown", since: now });
export const dying = (now: number): Phase => ({ name: "dying", since: now });

/** Time-driven transitions only; key presses and death are explicit calls above. */
export function advance(phase: Phase, now: number): Phase {
  const t = now - phase.since;
  if (phase.name === "countdown" && t >= COUNTDOWN_MS) {
    return { name: "playing", since: phase.since + COUNTDOWN_MS };
  }
  if (phase.name === "dying" && t >= DEATH_FREEZE_MS) {
    return { name: "over", since: phase.since + DEATH_FREEZE_MS };
  }
  return phase;
}

/** A key press in lobby or over starts a round. */
export const canStart = (phase: Phase): boolean => phase.name === "lobby" || phase.name === "over";

/** Is the snake drawn? It blinks 3x during the death freeze: 100 ms off, 100 ms on. */
export function visibleAt(phase: Phase, now: number): boolean {
  if (phase.name !== "dying") return true;
  return Math.floor((now - phase.since) / BLINK_MS) % 2 === 1;
}

/** Countdown digit to show (3, 2, 1), or null while powering on / outside countdown. */
export function countdownDigit(phase: Phase, now: number): number | null {
  if (phase.name !== "countdown") return null;
  const t = now - phase.since - POWER_ON_MS;
  if (t < 0) return null;
  return Math.max(1, COUNTDOWN_FROM - Math.floor(t / COUNTDOWN_DIGIT_MS));
}

/** LCD contrast 0..1: the screen powers on over the first 300 ms of a countdown. */
export function powerAt(phase: Phase, now: number): number {
  if (phase.name !== "countdown") return 1;
  return Math.min(1, Math.max(0, (now - phase.since) / POWER_ON_MS));
}
