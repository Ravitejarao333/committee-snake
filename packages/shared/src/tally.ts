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
  const counts: Record<Dir, number> = { U: 0, D: 0, L: 0, R: 0 };
  const byDir: Record<Dir, PlayerId[]> = { U: [], D: [], L: [], R: [] };
  let nonsense = 0;

  for (const [pid, dir] of votes) {
    if (dir === OPPOSITE[current]) {
      nonsense++;
      continue;
    }
    counts[dir]++;
    byDir[dir].push(pid);
  }

  const voted = DIRS.filter((d) => counts[d] > 0);
  if (voted.length === 0) {
    return { counts, nonsense, winner: current, winners: [] };
  }

  const pick = mode === "chaos" ? Math.min : Math.max;
  const target = pick(...voted.map((d) => counts[d]));
  const tied = voted.filter((d) => counts[d] === target);

  let winner: Dir;
  if (tied.length === 1) {
    winner = tied[0] as Dir;
  } else if (tied.includes(current)) {
    winner = current;
  } else {
    winner = tied[rng.int(tied.length)] as Dir;
  }

  return { counts, nonsense, winner, winners: byDir[winner] };
}
