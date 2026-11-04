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

## Games

The site is a small collection of browser games. `/` is a hub with one card per game, each with a live preview; a tap goes straight in.

| Game                | Path     | What it is                                                                     |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| **Committee Snake** | `/snake` | Everyone votes. The snake dies. Someone gets blamed. (the rest of this README) |
| **Break Glass**     | `/glass` | In case of boredom, break glass. Solo, local-only.                             |

Each game is its own HTML page with its own JavaScript budget ([ADR 0008](docs/adr/0008-multi-game-client.md)).

### Break Glass

A red emergency box with a pane of glass. A press cracks it under your finger in the same frame; a second tap near a crack, a press held for about half a second, or a hard flick (on desktop, a fast swing into the click) breaks it. The shards fall, bounce once and fade, each with its own tinkle, and behind the pane is one of 60 lines: fortunes, terrible tips, committee memos and the odd prize. Tap the line to share it as a 1200×630 card; tap elsewhere, or wait two seconds, for a new pane.

- **Panes are numbered.** Every pane (#1 to #9999) always hides the same line, so `/glass#1234` reproduces a pane someone shared. New panes don't repeat any of the last 10 lines.
- **All sound is synthesized** with Web Audio: an impact thump, a crackle of noise grains and a ping per landing shard, through a small room reverb. Harder hits are louder and brighter. On phones the first tap turns sound on when it's released.
- **Hit strength** comes from the mouse's speed into the click, or for touch from how long the press lasts and how fast it flicks (contact size and pressure, where reported, only make the first crack bigger). iOS reports neither, so there it's duration and flick.
- **Reduced motion** turns off the screen shake and the first-shatter slow motion; shards and the flash stay.
- **The counter is local** (`localStorage`). The strip has a hidden slot for a worldwide count, which needs Worker support later.
- If frames run long during a shatter, later shatters use fewer shards and fewer tinkle voices.

## How it works

One snake per room. Every player holds a **standing vote** (↑ ↓ ← →). Each tick the server counts the live votes and the snake turns toward the winner. Eat, grow, speed up, die, and then a 6-second **Blame Screen** shows the fatal tally, names the _Assassins_, hands out awards, and offers a one-tap PNG share.

Up to **24 voters** per room, plus spectators. Public rooms for strangers, private rooms by 4-letter code. No accounts, no installs, no text chat. Desktop-first; mobile works.

The full design, with every rule and every decision, lives in **[docs/PLAN.md](docs/PLAN.md)**.

## Stack

| Layer      | Choice                                               | Why                                                                        |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Simulation | Pure TypeScript `step(state, votes, rng)`            | Deterministic, replayable, 100% unit-testable                              |
| Server     | Cloudflare Workers + **one Durable Object per room** | Room-per-object is exactly the shape of this game; edge latency; free tier |
| Client     | Vite + TypeScript + Canvas 2D                        | A 32×20 grid needs no engine; instant load                                 |
| Protocol   | JSON over WebSocket, validated with zod              | Readable, debuggable, hard to abuse                                        |
| Tooling    | pnpm workspaces, Biome, Vitest, tsc strict, knip     | One fast toolchain, no ESLint/Prettier split                               |

## Repository layout

```
packages/shared/   pure sim, tally, RNG, awards, protocol  ← all game rules live here
apps/server/       Worker router + RoomDO + LobbyDO
apps/client/       browser client: one Vite app, one HTML page per game
  src/hub/         the games hub at /
  src/snake/       Committee Snake at /snake
  src/glass/       Break Glass at /glass
  src/fx/, src/ui/ shared audio engine, PNG share, share-card footer
docs/              PLAN.md (design doc) and ADRs
scripts/           setup-github.sh (one-time repo bootstrap), replay, browser and route smoke tests
```

## Controls

Every input lights the matching key on the on-screen keypad. Your vote stands until you change it, and expires after 4 seconds without a key press. Two quick presses queue up as two turns ([ADR 0007](docs/adr/0007-two-deep-vote-queue.md)).

| Seat                                                                    | Up  | Left | Right | Down |
| ----------------------------------------------------------------------- | --- | ---- | ----- | ---- |
| P1 `ARROWS`: arrow keys, or the on-screen keypad (click or tap 2/4/6/8) | ↑   | ←    | →     | ↓    |
| P2 `WASD`                                                               | W   | A    | D     | S    |
| P3 `IJKL`                                                               | I   | J    | L     | K    |
| P4 `NUMPAD`: numpad (follows its printed arrows)                        | 8   | 4    | 6     | 2    |
| P4 `NUMPAD`: number row (phone layout)                                  | 2   | 4    | 6     | 8    |

| Key                       | Does                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| Enter or Space            | Start the round from the lobby (on touch: tap the screen)                         |
| `*` or `M`                | Toggle sound (off by default on touch devices)                                    |
| `S` or the SHARE soft key | On the Blame Screen: share it as a PNG (native share sheet, or a download)        |
| Ctrl/Cmd+C                | On the Blame Screen: copy the PNG to the clipboard, where the browser supports it |
| Any other key             | On the Blame Screen, after 1.5 s: skip back to the lobby                          |
| 5                         | Emotes (coming soon)                                                              |

The number row and the numpad disagree on purpose. On a phone keypad, 2 is the top row, so it means up. On a numpad, 8 is the top row and carries the ↑ legend.

### How to play with friends on one keyboard

Up to four people can share one laptop. In the lobby, each of you presses any key from your own set to take a seat: arrows, WASD, IJKL, or the numpad (the number row also works for P4). The roster under the status bar shows each seat's avatar, name and current vote. Press Enter to start, or wait 5 seconds after the second seat joins. Each vote stands until you change it, the bars around the screen show the argument live, and the majority steers. When the snake dies, the Blame Screen names who voted for the fatal move. Press `S` to share it. Seats are kept between rounds; reload the page to clear them.

## Getting started

Requires **Node 24** (see `.nvmrc`; the minimum is **22.22.1**, which lint-staged 17 requires; `scripts/replay.ts` needs 22.15+ for `module.registerHooks`) and **pnpm** (`corepack enable` gives you the pinned version).

```bash
pnpm install          # also installs git hooks via husky
pnpm dev              # hub on http://localhost:5173, Snake at /snake; API via wrangler dev
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
node scripts/smoke/client.mjs    # headless-Chrome smoke of the hub and Snake (needs the client dev server)
node scripts/smoke/glass.mjs     # headless-Chrome smoke of Break Glass, with a frame budget (needs the client dev server)
node scripts/smoke/routes.mjs    # page routing behind the Worker (needs `pnpm --filter @committee-snake/server dev`)
```

### Size budgets

`pnpm build` fails if any page's JavaScript is over budget. A page's size is every chunk it loads, static or dynamic, so a chunk shared by two pages counts toward both.

| Page     | Budget (raw) | Now (raw / gzip)    |
| -------- | ------------ | ------------------- |
| `/` hub  | 15 KB        | 14,347 B / 6,994 B  |
| `/snake` | 40 KB        | 39,077 B / 16,709 B |
| `/glass` | 60 KB        | 28,821 B / 13,346 B |

## Deploying

Production is one Worker, `committee-snake` ([ADR 0006](docs/adr/0006-single-worker-assets-and-api.md)). It serves the built client from `apps/client/dist` as Workers Static Assets and runs the router only for `/room`, `/room/*`, `/public/*` and `/health`. Any other path is a static file. The client builds to three pages, `index.html` (the hub), `snake.html` and `glass.html`. Static Assets serves `snake.html` at `/snake` and redirects `/snake.html` and `/snake/` there; `glass.html` works the same way. A path with no matching file gets `index.html`, so unknown URLs land on the hub. The live URL is `https://committee-snake.<your-subdomain>.workers.dev`. Deploy builds the client, then runs `wrangler deploy --env production` from `apps/server`; there is no separate Pages project.

The Deploy workflow is skipped until you add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and set the repository variable `DEPLOY_ENABLED=true` (`gh variable set DEPLOY_ENABLED --body true`).

## Milestones

| #   | Goal                                                                 | Status |
| --- | -------------------------------------------------------------------- | ------ |
| M0  | Pure sim + tests                                                     | ✅     |
| M1  | Local single-player with LCD look, keypad, beeps                     | ✅     |
| M2  | Hot-seat committee: 4 people, one keyboard, tally bars, Blame Screen | ✅     |
| M3  | Private rooms online                                                 | 🔜     |
| M4  | Public rooms, ghost voters, spectators                               |        |
| M5  | Polish: awards, captions, PNG share, emotes, reconnect               |        |
| M6  | Launch                                                               |        |

**Gate after M2:** if four friends on one laptop aren't laughing within three rounds, change the rules before writing any network code.

## Contributing

PRs welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow (Conventional Commits, Biome, tests for any rule change) and [docs/PLAN.md](docs/PLAN.md) before proposing new mechanics. Security issues go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The visual theme deliberately evokes early-2000s monochrome phones without reproducing any manufacturer's design, logo, startup screen or ringtone; all art and sound are original.
