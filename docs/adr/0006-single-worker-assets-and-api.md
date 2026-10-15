# 0006. Single Worker serves assets and API

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The client was deployed to Cloudflare Pages and the API as a separate Worker. Cloudflare now treats Pages as legacy and recommends Workers Static Assets. Two deployables meant two URLs, two deploy steps, and cross-origin requests from the client to the API.

## Decision

One Worker, `committee-snake`, serves both. `wrangler.jsonc` points `assets.directory` at `../client/dist`, with `not_found_handling: "single-page-application"`. `run_worker_first` lists the API routes (`/room`, `/room/*`, `/public/*`, `/health`), so only those invoke the router. Everything else is served from assets without running the Worker. The router's fallback is `env.ASSETS.fetch(request)`.

## Consequences

One deploy, one URL, and same-origin WebSockets with no CORS. Static requests don't count as Worker invocations. The client must be built before `wrangler deploy`, and every new API route must be added to `run_worker_first`. Otherwise it gets `index.html` instead of reaching the Worker.
