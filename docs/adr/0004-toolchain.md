# 0004. Toolchain: pnpm, Biome, Vitest, strict tsc, squash merges, release-please

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

We want one fast, low-maintenance toolchain that matches what well-run TypeScript repositories use today, enforced identically in git hooks and CI.

## Decision

- **pnpm workspaces** with a pinned `packageManager` (Corepack) and `--frozen-lockfile` in CI.
- **Biome** for formatting, linting and import sorting; no ESLint/Prettier split.
- **Vitest** with v8 coverage thresholds on `packages/shared`; Node 22 and 24 matrix.
- **tsc `--strict`** plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; `Bundler` resolution with extensionless imports.
- **knip** for dead code and unused dependencies.
- **husky + lint-staged + commitlint** locally; Conventional Commit PR titles in CI because we **squash-merge**.
- **release-please** for versioning and CHANGELOG; **CodeQL**, **Dependabot** (grouped weekly), dependency review and secret scanning for security.
- Branch ruleset on `main`: PR required, linear history, signed commits, required checks `CI OK`, PR title, CodeQL.

## Consequences

One `pnpm check` is the whole contract. Adding a new CI job means adding it to the `ci-ok` fan-in, not to the ruleset. Biome covers less than the full ESLint ecosystem; if a rule is missing we accept that trade for speed.
