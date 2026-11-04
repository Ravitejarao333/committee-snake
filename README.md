<h1 align="center">Cheap Thrills</h1>

<p align="center">
  Small games. Big feelings. No sign-up.<br/>
  <a href="https://cheap-thrills.ravitejarao333.workers.dev">cheap-thrills.ravitejarao333.workers.dev</a>
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

Cheap Thrills is a small collection of browser games. `/` is a hub with one card per game, each with a live preview; a tap goes straight in. The GitHub repo is still called `committee-snake`, after the first game.

| Game                | Path     | What it is                                                                     |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| **Committee Snake** | `/snake` | Everyone votes. The snake dies. Someone gets blamed. (the rest of this README) |
| **Break Glass**     | `/glass` | In case of boredom, break glass. Solo, local-only.                             |

Each game is its own HTML page with its own JavaScript budget ([ADR 0008](docs/adr/0008-multi-game-client.md)).

### Site name, icons and link previews

- Page titles are `Cheap Thrills`, `Committee Snake · Cheap Thrills` and `Break Glass · Cheap Thrills`. Every PNG share card's footer reads `cheapthrills · <host>`, where the host is the one the card was made on.
- The mark is a cracked coin. `apps/client/scripts/icons.ts` holds its geometry, and the build writes `favicon.svg`, `favicon.ico` (16, 32 and 48 px) and `apple-touch-icon.png` from it, with no image dependencies. These are not JavaScript, so they don't count toward the page budgets.
- Each page has Open Graph and Twitter meta with `og:site_name` "Cheap Thrills" and its own 1200×630 card from `apps/client/public/og/`. The cards are committed. `node scripts/og/render.ts` redraws them with headless Chrome.

### Break Glass

A red emergency box with a pane of glass. A press cracks it under your finger in the same frame, and every hit adds damage until the pane gives: 3 to 5 ordinary taps, 1 or 2 hard ones (a press held for about half a second, a hard flick, or on desktop a fast swing into the click), never more than 7. New cracks grow out of the old ones into one network, flakes fall at each impact, a low creak gets louder near the limit, a hairline web fills in past 70%, and the pane wobbles on the last hit before it goes. The shards fall (bigger near the hit), bounce once and fade, each with its own tinkle, with glittering slivers and a jagged rim left in the frame for a second, and behind the pane is one of 60 lines: fortunes, terrible tips, committee memos and the odd prize. Tap the line to share it as a 1200×630 card; tap elsewhere, or wait two seconds, for a new pane.

- **Panes are numbered.** Every pane (#1 to #9999) always hides the same line, so `/glass#1234` reproduces a pane someone shared. New panes don't repeat any of the last 10 lines.
- **All sound is synthesized** with Web Audio: an impact thump, a crackle of noise grains and a ping per landing shard, through a small room reverb. Harder hits are louder and brighter. On phones the first tap turns sound on when it's released.
- **Hit strength** comes from the mouse's speed into the click, or from how long the press lasts and how fast the pointer moves while down. A plain tap is the same base hit on every device; contact size and pressure are ignored.
- **Damage** is a pure model in `apps/client/src/glass/damage.ts`: each pane has a strength budget of about 100, a hit does `26 × strength multiplier` (less near the frame, more within 28 px of a crack), and the pane shatters when the total reaches the budget. Every feel number is in `glass/tuning.ts`.
- **Reduced motion** turns off the screen shake and the first-shatter slow motion; shards and the flash stay.
- **The counter is local** (`localStorage`). The strip has a hidden slot for a worldwide count, which needs Worker support later.
- If frames run long during a shatter, later shatters use fewer shards and fewer tinkle voices.

## How it works

The rest of this README is about **Committee Snake**: classic phone Snake, except everyone in the room votes on where it turns. When it dies, the **Blame Screen** names exactly who killed it. _Democracy was a mistake._

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
scripts/           setup-github.sh (one-time repo bootstrap), replay, OG cards, browser and route smoke tests
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
node scripts/og/render.ts        # redraw the OG cards in apps/client/public/og/ (headless Chrome)
```

### Size budgets

`pnpm build` fails if any page's JavaScript is over budget. A page's size is every chunk it loads, static or dynamic, so a chunk shared by two pages counts toward both.

| Page     | Budget (raw) | Now (raw / gzip)    |
| -------- | ------------ | ------------------- |
| `/` hub  | 15 KB        | 14,347 B / 6,996 B  |
| `/snake` | 40 KB        | 39,070 B / 16,714 B |
| `/glass` | 60 KB        | 28,833 B / 13,361 B |

## Deploying

Production is one Worker, `cheap-thrills` ([ADR 0006](docs/adr/0006-single-worker-assets-and-api.md)). It serves the built client from `apps/client/dist` as Workers Static Assets and runs the router only for `/room`, `/room/*`, `/public/*` and `/health`. Any other path is a static file. The client builds to three pages, `index.html` (the hub), `snake.html` and `glass.html`. Static Assets serves `snake.html` at `/snake` and redirects `/snake.html` and `/snake/` there; `glass.html` works the same way. A path with no matching file gets `index.html`, so unknown URLs land on the hub. The live URL is `https://cheap-thrills.<your-subdomain>.workers.dev`. Deploy builds the client, then runs `wrangler deploy --env production` from `apps/server`; there is no separate Pages project.

The site used to be the `committee-snake` Worker, and links to `https://committee-snake.<your-subdomain>.workers.dev` exist. That Worker is now `apps/server/src/redirect.ts` (config `wrangler.redirect.jsonc`): it answers every request with a 301 to the same path and query on the `cheap-thrills` host. Deploy runs it right after the site. Its `v2` migration deleted the old Worker's Durable Object classes, which had never held state. After a deploy, `node scripts/smoke/routes.mjs https://cheap-thrills.<sub>.workers.dev https://committee-snake.<sub>.workers.dev` checks both hosts.

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
