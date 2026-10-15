# Instructions for AI coding agents

This file is read by Claude Code, Cursor, Copilot and similar tools. Humans: see CONTRIBUTING.md.

## Project in one paragraph

Multiplayer browser Snake where a room votes on each turn. pnpm monorepo: `packages/shared` (pure deterministic simulation + zod protocol, **all game rules live here**), `apps/server` (Cloudflare Worker, one Durable Object per room), `apps/client` (Vite + Canvas 2D). Design doc: `docs/PLAN.md`. Decisions: `docs/adr/`.

## Non-negotiables

- Never put game rules in server or client code; change `packages/shared` and add a test.
- `packages/shared` is pure: no `Date.now()`, `Math.random()`, fetch, DOM or Node APIs. Use the injected `Rng`.
- Validate every inbound socket message with `parseClientMessage` before touching it.
- Keep TypeScript strict; don't add `any`, `// @ts-ignore` or `!` to make errors go away.
- Don't add dependencies to `shared` without asking.

## Commands

```bash
pnpm install
pnpm check            # lint + typecheck + test; must pass before you say you're done
pnpm test:watch
pnpm lint:fix
```

## Conventions

- Conventional Commits with scopes `shared|server|client|ci|deps|docs|release`.
- Biome for formatting/linting (not ESLint/Prettier). Run `pnpm lint:fix` rather than hand-formatting.
- Imports inside a package are extensionless (`./sim`), resolved by the bundler.
- New design decision → new ADR in `docs/adr/NNNN-title.md` using the template there.
