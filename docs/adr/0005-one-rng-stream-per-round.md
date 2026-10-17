# 0005. One seeded RNG stream per round, consumed in a fixed order

- **Status:** Proposed
- **Date:** 2026-10-15
- **Amended 2026-10-16:** one extra draw after the death step, for the Blame Screen caption.

## Context

Every round has a 32-bit seed so any reported bug can be replayed exactly (docs/PLAN.md §6.3). A seed alone isn't enough, though. The pure sim draws from the `Rng` for the first food in `createGame`, for tie-breaks in `tally`, and for every food and bonus spawn in `step`. If the room created a second generator, reseeded mid-round, or let other code draw from the same one, a replay from `(seed, votes)` would drift from what players saw, silently, after the first divergent draw.

## Decision

Each round uses exactly one `mulberry32(seed)` instance, consumed in this order and nowhere else: `createGame(rng, rules)` once, then `step(state, votes, rng, rules)` once per tick. `votes` is the live (non-expired) vote map at that tick's boundary. After the death step, the room draws exactly once more, for the Blame Screen caption (`blameReport`). That draw comes after the last `step`, so replaying the round's states is unaffected. The caption is a pure function of the same stream, so it is reproducible from `(seed, rules, votes)`, but `scripts/replay.ts` does not print it yet. Nothing outside `packages/shared` draws from this stream. Ghost votes (§5.5) come from a separate generator derived from the same seed and are written into the vote log like human votes, so replay never has to regenerate them. Room codes, tokens and other non-gameplay randomness use `crypto.getRandomValues`.

## Consequences

`scripts/replay.ts` reproduces any round from `(seed, rules, votes per tick)`. In return:

- The server **must log `(seed, rules, votes-per-tick)` for the last round** in the Room DO's storage, in the format `scripts/replay.ts` reads, including the ticks where nobody voted.
- Changing the number or order of `rng` calls in `createGame`, `tally`, `spawnCell` or `step` invalidates every stored log. Such a change must be called out in its PR, and the regression tests that replay fixed `(seed, votes)` pairs will show it.
- New random mechanics must draw from the stream at a fixed point inside `step`, never from the room or the client.
