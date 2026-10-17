import type { Dir, PlayerId, VoteMap, VoteQueue } from "@committee-snake/shared";
import type { Seats } from "./seats";

/** One seat in the roster strip. */
export interface RosterEntry {
  readonly id: PlayerId;
  readonly name: string;
  /** The live vote (queue head), or null while napping / not voted yet. */
  readonly head: Dir | null;
  /** The queued press (ADR 0007), shown dimly. */
  readonly pending: Dir | null;
  /** Napping or hasn't voted yet: shown at 40% with "zZ". */
  readonly asleep: boolean;
}

export function rosterEntries(
  seats: Seats,
  votes: ReadonlyMap<PlayerId, VoteQueue>,
  live: VoteMap,
): RosterEntry[] {
  return seats.map(({ id, name }) => {
    const head = live.get(id) ?? null;
    const pending = head === null ? null : (votes.get(id)?.pending?.dir ?? null);
    return { id, name, head, pending, asleep: head === null };
  });
}

/** Keypad dots: who has their live vote on each key, in seat order, at most `max` per key. */
export function keyVoters(seats: Seats, live: VoteMap, max = 4): Record<Dir, PlayerId[]> {
  const out: Record<Dir, PlayerId[]> = { U: [], D: [], L: [], R: [] };
  for (const { id } of seats) {
    const d = live.get(id);
    if (d && out[d].length < max) out[d].push(id);
  }
  return out;
}
