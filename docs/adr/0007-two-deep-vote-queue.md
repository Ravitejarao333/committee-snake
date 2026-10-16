# 0007. Two-deep vote queue per player

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

ADR 0001 gives each player one standing vote. In the first M1 playtest that lost input: pressing Up then Left inside one tick overwrote the Up, so quick corner turns and wall-escape U-turns (Down then Left at the right wall) were impossible. At 3–8 tps, two presses inside one tick is normal play, not mashing.

## Decision

Each player's vote becomes a queue of at most two stamped presses: a **head**, which is the only thing `tally` sees, and one **pending** entry. `pushVote` adds a press:
- Pressing the tail's direction again only refreshes its timestamp.
- Pressing the head's direction while something is pending cancels the pending entry.
- Any other press becomes the pending entry, replacing an older one.

After every tick, `settleVotes(queues, newDir)` runs:
- A pending entry that is the reverse of `newDir` is dropped, because it can never win.
- A head that won gives way to its pending entry. So does a head that is now a reverse vote; without this, a "Left, Down" queue while heading right would never move.
- A head that lost to another direction stays put, with its pending entry.

A winning head with nothing pending stays as the standing vote (ADR 0001 still holds) but is marked **stale**. A stale head is replaced by the next press rather than queued behind, otherwise every turn from a standing straight-ahead vote would land a tick late. Expiry runs from the most recent press in the queue, and a press after expiry starts a fresh queue.

## Consequences

- Two quick presses become two consecutive turns, so tight corners and U-turns at a wall are possible.
- `tally` and `step` are unchanged.
- Replays still log only the live head per tick (ADR 0005), so stored replays stay valid and deterministic.
- The server must call `pushVote` on every vote message and `settleVotes` after every `step`, exactly as the solo client does. Keeping one pending press per player also caps any queue-flooding.
