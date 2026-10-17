import type { PlayerRoundStats } from "./awards";
import type { Dir, PlayerId, VoteMap } from "./types";

const ZERO: Readonly<PlayerRoundStats> = {
  votesCast: 0,
  votesWon: 0,
  longestNapTicks: 0,
  napTicks: 0,
};

/**
 * Fold one tick into the round's per-player stats (for `pickAwards`). Pure: returns a new map.
 *
 * Call once per tick with the live votes `step` saw and the direction it took (`state.dir`
 * after the step). For each seat:
 * - live vote: `votesCast` +1, `votesWon` +1 if it matches `newDir`, nap streak reset to 0.
 * - no live vote: once the seat has voted this round, the nap streak grows by one tick and
 *   `longestNapTicks` keeps the longest. A seat that hasn't voted yet (a late joiner, or someone
 *   who never pressed) accrues no nap.
 *
 * Players in `stats` that are no longer in `seats` are carried over unchanged.
 */
export function recordTick(
  stats: ReadonlyMap<PlayerId, PlayerRoundStats>,
  seats: readonly PlayerId[],
  live: VoteMap,
  newDir: Dir,
): Map<PlayerId, PlayerRoundStats> {
  const out = new Map(stats);
  for (const seat of seats) {
    const s = stats.get(seat) ?? ZERO;
    const vote = live.get(seat);
    if (vote !== undefined) {
      out.set(seat, {
        ...s,
        votesCast: s.votesCast + 1,
        votesWon: s.votesWon + (vote === newDir ? 1 : 0),
        napTicks: 0,
      });
    } else if (s.votesCast > 0) {
      const napTicks = s.napTicks + 1;
      out.set(seat, { ...s, napTicks, longestNapTicks: Math.max(s.longestNapTicks, napTicks) });
    } else if (!stats.has(seat)) {
      out.set(seat, { ...ZERO });
    }
  }
  return out;
}
