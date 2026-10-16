import { VOTE_EXPIRY_MS } from "./constants";
import type { Dir, LiveVotes, PlayerId, StampedVote } from "./types";

/**
 * Split stamped standing votes into live votes and nappers (docs/PLAN.md §3.2).
 * A vote is live iff `now - at < ttlMs`, so it expires exactly at `ttlMs`; a
 * future `at` (clock skew) counts as live. Pure: the input is never mutated.
 */
export function expireVotes(
  votes: ReadonlyMap<PlayerId, StampedVote>,
  now: number,
  ttlMs: number = VOTE_EXPIRY_MS,
): LiveVotes {
  const live = new Map<PlayerId, Dir>();
  const napping = new Set<PlayerId>();
  for (const [player, vote] of votes) {
    if (now - vote.at < ttlMs) live.set(player, vote.dir);
    else napping.add(player);
  }
  return { live, napping };
}
