---
name: verify
description: The definition of "done" for this repo. Runs pnpm check (Biome lint + tsc + Vitest), pnpm build (Vite + wrangler dry-run) and pnpm knip, then summarizes pass/fail per step. Use before saying any task is finished, before committing, and before opening a PR.
allowed-tools: Bash(pnpm *)
---

# verify

Run each step from the repo root, **in this order, even if an earlier one fails** (one run should show every problem):

```bash
pnpm check           # biome check . && typecheck (all packages + scripts/) && vitest run
pnpm test:coverage   # same tests with the CI coverage thresholds (lines/funcs/stmts 85, branches 80)
pnpm build           # vite build (client) + wrangler deploy --dry-run (server)
pnpm knip            # unused files / exports / dependencies
```

CI runs `pnpm biome ci .` instead of `biome check`. They report the same diagnostics, so `pnpm check` is enough locally.

## Report

Print this table with the real numbers from the run (the values below are only an example), then details for failures only:

```
| step      | result | detail                                   |
| --------- | ------ | ---------------------------------------- |
| lint      | PASS   | 0 errors, 0 warnings                     |
| typecheck | PASS   | shared, server, client, scripts          |
| test      | PASS   | 29 tests, 5 files                        |
| coverage  | PASS   | lines 95.97%, branches 88.57%            |
| build     | PASS   | client 29 kB gz, worker 121 kB gz        |
| knip      | PASS   | clean                                    |
```

For each FAIL, quote the first relevant error lines (file:line plus message) and say whether you will fix it or need input.

## Rules

- The task is **not done** unless every row is PASS. Don't describe it as done, "mostly done" or "should pass".
- Never make it green by weakening a Biome rule, loosening `tsconfig`, lowering coverage thresholds, adding `.skip`/`.only`, or adding knip ignores without a comment explaining the false positive. Fix the code, or explain why the rule is wrong and ask.
- `pnpm lint:fix` is fine for formatting-only failures; re-run `verify` afterwards.
