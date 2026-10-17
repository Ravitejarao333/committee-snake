/**
 * Pure round-flow machine for the local game (docs/PLAN.md §3.6):
 * lobby -> countdown -> playing -> dying (600 ms) -> blame (6 s) -> lobby.
 * A key skips the Blame Screen after its first 1.5 s. Times are caller ms.
 */
export type PhaseName = "lobby" | "countdown" | "playing" | "dying" | "blame";

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
export const BLAME_MS = 6000;
const BLAME_SKIP_MS = 1500;

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
    return { name: "blame", since: phase.since + DEATH_FREEZE_MS };
  }
  if (phase.name === "blame" && t >= BLAME_MS) {
    return { name: "lobby", since: phase.since + BLAME_MS };
  }
  return phase;
}

/** A start key in the lobby starts a round. */
export const canStart = (phase: Phase): boolean => phase.name === "lobby";

/** A key may skip the Blame Screen to the lobby once it has been up for 1.5 s. */
export const canSkip = (phase: Phase, now: number): boolean =>
  phase.name === "blame" && now - phase.since >= BLAME_SKIP_MS;

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
