# Contributing

Thanks for helping make the committee worse at Snake.

## Ground rules

- Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Read [docs/PLAN.md](docs/PLAN.md) before proposing a mechanic. If your idea changes a decision in §10, open an issue first and propose an ADR (`docs/adr/`).
- Game rules live **only** in `packages/shared`. The server and client never reimplement them.

## Setup

```bash
corepack enable           # gives you the pnpm version pinned in package.json
pnpm install              # installs deps + husky hooks
pnpm check                # lint, typecheck, test
```

Node version: `.nvmrc` (24). Editor: install the Biome extension; `.vscode/settings.json` turns on format-on-save.

## Workflow

1. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/…`, `chore/…`.
2. Commit with **Conventional Commits**. The hook enforces it:
   - `feat(shared): add dictator mode`
   - `fix(client): keypad glow stuck after blur`
   - `docs: clarify vote expiry`
   - Scopes: `shared`, `server`, `client`, `ci`, `deps`, `docs`, `release`.
3. Open a PR. The template asks for *what / why / how to test*. The PR **title** must also be a Conventional Commit, because we squash-merge and the title becomes the commit.
4. CI must be green: Biome, tsc, Vitest (Node 22 and 24, coverage thresholds), build, knip, CodeQL.
5. Squash-merge. `release-please` turns merged commits into a release PR and CHANGELOG automatically.

## Code style

Biome handles formatting and linting; don't argue with it, run `pnpm lint:fix`. Beyond that:

- `strict` TypeScript with `noUncheckedIndexedAccess`. Prefer narrowing over `!`.
- The simulation is pure: no `Date.now()`, no `Math.random()`, no I/O in `packages/shared`. Randomness comes from the `Rng` passed in.
- No new runtime dependencies in `shared` without discussion. It ships to every browser.
- Keep messages small; the protocol caps client messages at 512 bytes.

## Tests

- Any change to a rule in `shared` needs a unit test, and the property test (`sim.test.ts`) must still pass.
- Bugs get a regression test that replays the failing `(seed, votes)` pair.
- Run `pnpm test:watch` while working on the sim; it's fast.

## Working with Claude Code

The repo ships project config in `.claude/` (personal overrides go in the git-ignored `.claude/settings.local.json`). Agents still follow [CLAUDE.md](CLAUDE.md).

- **Hooks** (`.claude/settings.json`, scripts in `.claude/hooks/`)
  - After every Edit/Write: `biome check --write` on that one file. Non-blocking; anything Biome can't fix is fed back to Claude.
  - On Stop: `pnpm typecheck && pnpm test`. If red, Claude is sent back to fix it once; if it is still red after that, you get a warning instead of a loop.
- **Permissions:** `pnpm`, `git`, `gh` and `npx wrangler` run without prompting. `rm -rf` and reading `.dev.vars` / `.env*` are denied.
- **Subagents** (`.claude/agents/`), each restricted to its own package:
  - `sim-engineer`: `packages/shared` only; every rule change ships with a Vitest test; keeps the sim pure.
  - `cf-engineer`: `apps/server`; Durable Objects, Hibernation API, alarms, `wrangler.jsonc`; no game rules; validates with `parseClientMessage`.
  - `client-engineer`: `apps/client`; Canvas 2D, integer pixel scaling, `prefers-reduced-motion`, no frameworks.
  - `reviewer`: read-only; reviews a diff against CLAUDE.md, PLAN.md and the ADRs and returns a prioritized list.
- **Skills** (`.claude/skills/`, run as `/name`):
  - `/verify`: `pnpm check` + coverage + `pnpm build` + `pnpm knip` with a summary table. This is the definition of done.
  - `/replay <log.json>`: replays a `(seed, votes)` log through the real sim (`pnpm replay`, i.e. `scripts/replay.ts`) and prints every tick, the death cause and the board. See `scripts/replay.example.json`.
  - `/adr <title>`: creates the next-numbered ADR from the template and adds it to `docs/adr/README.md`.

## Releasing

Nothing manual. Merge to `main` → `release-please` opens/updates a release PR → merging that PR tags a version and publishes a GitHub Release. The `Deploy` workflow ships `main` to Cloudflare after CI passes.
