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

## Releasing

Nothing manual. Merge to `main` → `release-please` opens/updates a release PR → merging that PR tags a version and publishes a GitHub Release. The `Deploy` workflow ships `main` to Cloudflare after CI passes.
