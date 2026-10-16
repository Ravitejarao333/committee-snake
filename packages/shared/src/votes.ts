import { VOTE_EXPIRY_MS } from "./constants";
import {
  type Dir,
  type LiveVotes,
  OPPOSITE,
  type PlayerId,
  type StampedVote,
  type VoteQueue,
} from "./types";

/** The player's most recent key press; the expiry clock runs from here. */
const lastPressAt = (q: VoteQueue): number => Math.max(q.head.at, q.pending?.at ?? q.head.at);

const fresh = (head: StampedVote): VoteQueue => ({ head, pending: null, stale: false });

/**
 * Add a key press to a player's queue (ADR 0007). Pure.
 * - Same direction as the tail: refresh its timestamp, nothing else.
 * - Expired or stale head: the press replaces it.
 * - Same direction as the head while something is pending: cancel the pending entry.
 * - Otherwise the press becomes the pending entry, replacing any older one.
 */
export function pushVote(
  queue: VoteQueue | undefined,
  vote: StampedVote,
  ttlMs: number = VOTE_EXPIRY_MS,
): VoteQueue {
  if (!queue || vote.at - lastPressAt(queue) >= ttlMs) return fresh(vote);
  const { head, pending, stale } = queue;
  if (pending) {
    if (vote.dir === pending.dir) return { head, pending: vote, stale };
    if (vote.dir === head.dir) return { head: vote, pending: null, stale };
    return { head, pending: vote, stale };
  }
  if (vote.dir === head.dir) return { head: vote, pending: null, stale };
  return stale ? fresh(vote) : { head, pending: vote, stale };
}

/**
 * Split vote queues into live votes (each queue's head) and nappers (docs/PLAN.md §3.2).
 * A queue is live iff `now - lastPress < ttlMs`, so it expires exactly at `ttlMs`; a
 * future timestamp (clock skew) counts as live. Pure: the input is never mutated.
 */
export function expireVotes(
  votes: ReadonlyMap<PlayerId, VoteQueue>,
  now: number,
  ttlMs: number = VOTE_EXPIRY_MS,
): LiveVotes {
  const live = new Map<PlayerId, Dir>();
  const napping = new Set<PlayerId>();
  for (const [player, queue] of votes) {
    if (now - lastPressAt(queue) < ttlMs) live.set(player, queue.head.dir);
    else napping.add(player);
  }
  return { live, napping };
}

/**
 * Advance every queue after a tick in which the snake moved `newDir` (ADR 0007). Pure.
 * - A pending entry that is the reverse of `newDir` can never win: drop it.
 * - A head that won, or that is now a reverse vote, gives way to the pending entry; with
 *   nothing pending it stays as a standing vote but is marked stale.
 * - A head that lost to another direction stays put, pending entry and all.
 */
export function settleVotes(
  votes: ReadonlyMap<PlayerId, VoteQueue>,
  newDir: Dir,
): Map<PlayerId, VoteQueue> {
  const reverse = OPPOSITE[newDir];
  const out = new Map<PlayerId, VoteQueue>();
  for (const [player, queue] of votes) {
    let { head, pending } = queue;
    if (pending?.dir === reverse) {
      // Keep the dropped press's timestamp so dropping it can't make the player nap sooner.
      head = { dir: head.dir, at: Math.max(head.at, pending.at) };
      pending = null;
    }
    if (head.dir === newDir || head.dir === reverse) {
      out.set(player, pending ? fresh(pending) : { head, pending: null, stale: true });
    } else {
      out.set(player, { ...queue, head, pending });
    }
  }
  return out;
}
