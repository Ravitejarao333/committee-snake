# 0003. Cloudflare Workers + one Durable Object per room

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

Each room needs a single-threaded tick loop and a single source of truth, close to players (including India), with near-zero cost while idle. Alternatives considered: Node + `ws` on a VPS, Colyseus, Firebase/Supabase Realtime, WebRTC P2P (see PLAN.md §5.2).

## Decision

A router Worker forwards to **one Durable Object per room** (`RoomDO`) and a single `LobbyDO` for public matchmaking. SQLite-backed DOs so the Free plan works. Rooms stop ticking when empty and self-delete after 10 idle minutes via DO alarms.

## Consequences

No servers to manage and global edge placement. Cloudflare-specific APIs and a learning curve; fallback is a plain Node + `ws` process running the same `shared` simulation. Hibernation doesn't save money during a live game, so empty rooms must genuinely stop.

The same Worker also serves the static client; see [0006](0006-single-worker-assets-and-api.md).
