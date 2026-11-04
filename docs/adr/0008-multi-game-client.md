# 0008. Multi-game client: one Vite app, per-page budgets, shared fx/ toolkit

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

The site is becoming a small collection of games. The second one, Break Glass, has nothing in common with Snake: no LCD, no votes, no server. The client was a single page that booted Snake in its phone frame, and nothing in it tears down. Input listeners, `visibilitychange`, the ResizeObserver and `createPhone` (which overwrites `#app`) all assume they own the page for its lifetime. Snake was also already close to its 40 KB JavaScript budget, so a hub or a second game must not add to Snake's bytes.

## Decision

**One Vite app, one HTML page per game, full page loads.** `apps/client` has three root-level entries: `index.html` (the hub), `snake.html` and `glass.html`. Links between them are plain `<a href>`, so there is no client router and no `dispose()`. Code lives in `src/hub/`, `src/snake/` and `src/glass/`.

**Routing uses the Workers Static Assets defaults, not Worker code.** `html_handling: auto-trailing-slash` serves `snake.html` at `/snake` and redirects `/snake.html` and `/snake/` to it. Vite's dev server resolves `/snake` to `snake.html` the same way. `not_found_handling: single-page-application` returns `index.html` for unknown paths, so they land on the hub. `/room/*` stays the Worker's API. A `snake/index.html` layout was rejected because it would serve `/snake/` in dev and need `drop-trailing-slash` in production.

**Per-page budgets.** The build writes a Vite manifest. `scripts/check-size.ts` sums, for each HTML entry, every chunk it reaches through `imports` and `dynamicImports`. A shared chunk counts toward every page that loads it, and a lazy `import()` still counts. The build fails if a page is over budget, if an entry has no budget, or if some JavaScript file is loaded by no page. Budgets: hub 15 KB, Snake 40 KB, Glass 60 KB. `public/.assetsignore` keeps the manifest out of the deploy.

**Shared code has two homes and one direction.**
- `fx/` holds side-effectful browser toolkits: the audio engine and PNG share/copy so far.
- `ui/` holds DOM and canvas UI pieces: the share-card footer and the site name.
- A module moves into either only when a second page uses it.
- A game never imports another game, and `fx/`/`ui/` never import a game.
- The one exception is the hub. Its Snake preview runs the real `step()` and draws with Snake's board renderer, so the preview can't drift from the game.
- `packages/shared` stays Snake's pure rules.

## Consequences

- Each game boots on a clean page and can assume it owns it. Navigating between games costs a page load, which is cheap for pages this small.
- Rolldown splits per module, so any module two pages share becomes a shared chunk, and its whole size counts toward both. Shared modules have to stay small. That's why Snake's LCD constants and bitmap helper live in `render/dots.ts`, apart from the LCD frame drawing.
- Adding a game means adding an HTML entry, a budget line and a knip entry. The size check fails the build if the budget line is missing.
- Follow-ups: when M3 adds private-room links (`/r/CODE`), it must decide whether those serve `snake.html`. Today they fall back to the hub. The hub's "— playing" counts and Break Glass's worldwide counter will need a Worker endpoint later; the UI has slots for them already.
