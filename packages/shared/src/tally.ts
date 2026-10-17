import type { Rng } from "./rng";
import {
  DIRS,
  type Dir,
  type Mode,
  OPPOSITE,
  type PlayerId,
  type Tally,
  type VoteMap,
} from "./types";

/** Live votes counted per direction, before any winner is picked. */
export interface VoteCount {
  counts: Record<Dir, number>;
  /** Votes for the reverse of `current`; they never count. */
  nonsense: number;
  /** Who cast the `nonsense` votes, in vote-map order. */
  nonsenseBy: PlayerId[];
  /** Who voted for each direction, in vote-map order. Reverse votes are not listed here. */
  byDir: Record<Dir, PlayerId[]>;
}

/**
 * Count live votes for display (tally bars) and for `tally`. Pure and RNG-free: a vote for
 * the reverse of `current` goes to `nonsense`, every other vote to its direction.
 */
export function countVotes(live: VoteMap, current: Dir): VoteCount {
  const counts: Record<Dir, number> = { U: 0, D: 0, L: 0, R: 0 };
  const byDir: Record<Dir, PlayerId[]> = { U: [], D: [], L: [], R: [] };
  const nonsenseBy: PlayerId[] = [];
  const reverse = OPPOSITE[current];

  for (const [pid, dir] of live) {
    if (dir === reverse) {
      nonsenseBy.push(pid);
      continue;
    }
    counts[dir]++;
    byDir[dir].push(pid);
  }

  return { counts, nonsense: nonsenseBy.length, nonsenseBy, byDir };
}

/**
 * The directions tied for the win under `mode`, before the tie-break: democracy takes the most
 * votes, chaos the fewest non-zero. Empty when nobody cast a counting vote. RNG-free, so the
 * client can show the current leaders (keypad glow) without re-implementing the rule.
 */
export function leading(counts: Readonly<Record<Dir, number>>, mode: Mode): Dir[] {
  const voted = DIRS.filter((d) => counts[d] > 0);
  if (voted.length === 0) return [];
  const pick = mode === "chaos" ? Math.min : Math.max;
  const target = pick(...voted.map((d) => counts[d]));
  return voted.filter((d) => counts[d] === target);
}

/**
 * Count standing votes and pick the direction for this tick.
 *
 * Rules (see docs/PLAN.md §3.2):
 * - A vote for the reverse of `current` never counts (classic Snake rule).
 * - democracy: most votes wins. chaos: fewest non-zero votes wins.
 * - Tie containing `current` -> keep going straight; otherwise seeded RNG.
 * - No valid votes at all -> keep going straight.
 */
export function tally(votes: VoteMap, current: Dir, mode: Mode, rng: Rng): Tally {
  const { counts, nonsense, nonsenseBy, byDir } = countVotes(votes, current);

  const tied = leading(counts, mode);
  if (tied.length === 0) {
    return { counts, nonsense, nonsenseBy, winner: current, winners: [] };
  }

  let winner: Dir;
  if (tied.length === 1) {
    winner = tied[0] as Dir;
  } else if (tied.includes(current)) {
    winner = current;
  } else {
    winner = tied[rng.int(tied.length)] as Dir;
  }

  return { counts, nonsense, nonsenseBy, winner, winners: byDir[winner] };
}
