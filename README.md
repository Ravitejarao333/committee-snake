<h1 align="center">🐍 Committee Snake</h1>

<p align="center">
  Classic phone Snake, except <strong>everyone in the room votes</strong> on where it turns.<br/>
  When it dies, the <strong>Blame Screen</strong> names exactly who killed it.<br/>
  <em>Democracy was a mistake.</em>
</p>

<p align="center">
  <a href="https://github.com/Ravitejarao333/committee-snake/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Ravitejarao333/committee-snake/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Ravitejarao333/committee-snake/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/Ravitejarao333/committee-snake/actions/workflows/codeql.yml/badge.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="Biome" src="https://img.shields.io/badge/code_style-biome-60a5fa?logo=biome&logoColor=white">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/runs_on-Cloudflare_Workers-f38020?logo=cloudflare&logoColor=white">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

---

## How it works

One snake per room. Every player holds a **standing vote** (↑ ↓ ← →). Each tick the server counts the live votes and the snake turns toward the winner. Eat, grow, speed up, die, and then a 6-second **Blame Screen** shows the fatal tally, names the *Assassins*, hands out awards, and offers a one-tap PNG share.

Up to **24 voters** per room, plus spectators. Public rooms for strangers, private rooms by 4-letter code. No accounts, no installs, no text chat. Desktop-first; mobile works.

The full design, with every rule and every decision, lives in **[docs/PLAN.md](docs/PLAN.md)**.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Simulation | Pure TypeScript `step(state, votes, rng)` | Deterministic, replayable, 100% unit-testable |
| Server | Cloudflare Workers + **one Durable Object per room** | Room-per-object is exactly the shape of this game; edge latency; free tier |
| Client | Vite + TypeScript + Canvas 2D | A 32×20 grid needs no engine; instant load |
| Protocol | JSON over WebSocket, validated with zod | Readable, debuggable, hard to abuse |
| Tooling | pnpm workspaces, Biome, Vitest, tsc strict, knip | One fast toolchain, no ESLint/Prettier split |

## Repository layout

```
packages/shared/   pure sim, tally, RNG, awards, protocol  ← all game rules live here
apps/server/       Worker router + RoomDO + LobbyDO
apps/client/       browser client
docs/              PLAN.md (design doc) and ADRs
scripts/           setup-github.sh (one-time repo bootstrap)
```

## Getting started

Requires **Node 24** (see `.nvmrc`) and **pnpm** (`corepack enable` gives you the pinned version).

```bash
pnpm install          # also installs git hooks via husky
pnpm dev              # client on http://localhost:5173, API via wrangler dev
pnpm test             # vitest
pnpm check            # lint + typecheck + test — same as CI
```

Useful extras:

```bash
pnpm test:watch                  # TDD on the simulation
pnpm test:coverage               # coverage report (thresholds enforced in CI)
pnpm lint:fix                    # Biome auto-fix + import sorting
pnpm knip                        # unused files/exports/deps
pnpm --filter @committee-snake/server cf-typegen   # regenerate Worker binding types
```

## Milestones

| # | Goal | Status |
| --- | --- | --- |
| M0 | Pure sim + tests | ✅ |
| M1 | Local single-player with LCD look, keypad, beeps | 🔜 |
| M2 | Hot-seat committee: 4 people, one keyboard, Blame Screen | 🔜 |
| M3 | Private rooms online | |
| M4 | Public rooms, ghost voters, spectators | |
| M5 | Polish: awards, captions, PNG share, emotes, reconnect | |
| M6 | Launch | |

**Gate after M2:** if four friends on one laptop aren't laughing within three rounds, change the rules before writing any network code.

## Contributing

PRs welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow (Conventional Commits, Biome, tests for any rule change) and [docs/PLAN.md](docs/PLAN.md) before proposing new mechanics. Security issues go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The visual theme deliberately evokes early-2000s monochrome phones without reproducing any manufacturer's design, logo, startup screen or ringtone; all art and sound are original.
