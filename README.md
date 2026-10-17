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

## Controls

Every input lights the matching key on the on-screen keypad. Your vote stands until you change it, and expires after 4 seconds without a key press. Two quick presses queue up as two turns ([ADR 0007](docs/adr/0007-two-deep-vote-queue.md)).

| Seat | Up | Left | Right | Down |
| --- | --- | --- | --- | --- |
| P1 `ARROWS`: arrow keys, or the on-screen keypad (click or tap 2/4/6/8) | ↑ | ← | → | ↓ |
| P2 `WASD` | W | A | D | S |
| P3 `IJKL` | I | J | L | K |
| P4 `NUMPAD`: numpad (follows its printed arrows) | 8 | 4 | 6 | 2 |
| P4 `NUMPAD`: number row (phone layout) | 2 | 4 | 6 | 8 |

| Key | Does |
| --- | --- |
| Enter or Space | Start the round from the lobby (on touch: tap the screen) |
| `*` or `M` | Toggle sound (off by default on touch devices) |
| `S` or the SHARE soft key | On the Blame Screen: share it as a PNG (native share sheet, or a download) |
| Ctrl/Cmd+C | On the Blame Screen: copy the PNG to the clipboard, where the browser supports it |
| Any other key | On the Blame Screen, after 1.5 s: skip back to the lobby |
| 5 | Emotes (coming soon) |

The number row and the numpad disagree on purpose. On a phone keypad, 2 is the top row, so it means up. On a numpad, 8 is the top row and carries the ↑ legend.

### How to play with friends on one keyboard

Up to four people can share one laptop. In the lobby, each of you presses any key from your own set to take a seat: arrows, WASD, IJKL, or the numpad (the number row also works for P4). The roster under the status bar shows each seat's avatar, name and current vote. Press Enter to start, or wait 5 seconds after the second seat joins. Each vote stands until you change it, the bars around the screen show the argument live, and the majority steers. When the snake dies, the Blame Screen names who voted for the fatal move. Press `S` to share it. Seats are kept between rounds; reload the page to clear them.

## Getting started

Requires **Node 24** (see `.nvmrc`; the minimum is **22.15**, because `scripts/replay.ts` uses `module.registerHooks`) and **pnpm** (`corepack enable` gives you the pinned version).

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

## Deploying

Production is one Worker, `committee-snake` ([ADR 0006](docs/adr/0006-single-worker-assets-and-api.md)). It serves the built client from `apps/client/dist` as Workers Static Assets and runs the router only for `/room`, `/room/*`, `/public/*` and `/health`. Any other path is a static file, or `index.html` if no file matches. The live URL is `https://committee-snake.<your-subdomain>.workers.dev`. Deploy builds the client, then runs `wrangler deploy --env production` from `apps/server`; there is no separate Pages project.

The Deploy workflow is skipped until you add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and set the repository variable `DEPLOY_ENABLED=true` (`gh variable set DEPLOY_ENABLED --body true`).

## Milestones

| # | Goal | Status |
| --- | --- | --- |
| M0 | Pure sim + tests | ✅ |
| M1 | Local single-player with LCD look, keypad, beeps | ✅ |
| M2 | Hot-seat committee: 4 people, one keyboard, tally bars, Blame Screen | ✅ |
| M3 | Private rooms online | 🔜 |
| M4 | Public rooms, ghost voters, spectators | |
| M5 | Polish: awards, captions, PNG share, emotes, reconnect | |
| M6 | Launch | |

**Gate after M2:** if four friends on one laptop aren't laughing within three rounds, change the rules before writing any network code.

## Contributing

PRs welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow (Conventional Commits, Biome, tests for any rule change) and [docs/PLAN.md](docs/PLAN.md) before proposing new mechanics. Security issues go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The visual theme deliberately evokes early-2000s monochrome phones without reproducing any manufacturer's design, logo, startup screen or ringtone; all art and sound are original.
