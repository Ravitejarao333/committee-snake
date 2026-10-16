# Architecture Decision Records

Short, numbered, immutable records of decisions that are expensive to reverse. Superseded ADRs stay, with a note pointing to the replacement. Template: [0000-template.md](0000-template.md).

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-standing-votes.md) | Standing votes with 4-second expiry | Accepted |
| [0002](0002-authoritative-server-pure-sim.md) | Authoritative server, pure `step()` simulation, no client prediction | Accepted |
| [0003](0003-cloudflare-durable-objects.md) | Cloudflare Workers + one Durable Object per room | Accepted |
| [0004](0004-toolchain.md) | pnpm + Biome + Vitest + strict tsc; squash merges; release-please | Accepted |
| [0005](0005-one-rng-stream-per-round.md) | One seeded RNG stream per round, consumed in a fixed order; server logs `(seed, votes-per-tick)` | Proposed |
| [0006](0006-single-worker-assets-and-api.md) | Single Worker serves static assets and API (no Pages) | Accepted |
| [0007](0007-two-deep-vote-queue.md) | Two-deep vote queue per player (head + one pending) | Accepted |
