# 0002. Authoritative server, pure simulation, no client prediction

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

Multiplayer games usually need prediction, rollback and lag compensation. Those are the hardest parts to build and debug. Snake is discrete, tiny and deterministic.

## Decision

The server owns the only real game state and clients just send votes. The simulation is a pure function `step(state, votes, rng) → {state, events}` in `packages/shared` with a seeded PRNG; it contains no clocks, sockets or I/O. Clients render what the server broadcasts and only "predict" the highlight on their own key.

## Consequences

Every rule is unit-testable and every round is replayable from `(seed, voteLog)`. Cheating beyond "voting" is impossible. A 200 ms ping means your vote lands one tick later, which is fair and invisible with standing votes. The server and client must never reimplement a rule.
