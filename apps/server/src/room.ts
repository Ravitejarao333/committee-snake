import { DurableObject } from "cloudflare:workers";
import { parseClientMessage } from "@committee-snake/shared";
import type { Env } from "./env";

/**
 * One Room = one snake = one tick loop = one source of truth.
 *
 * M3 milestone fills this in (see docs/PLAN.md §5.6–5.8). The skeleton
 * already enforces the two non-negotiables: the server owns the game, and
 * every inbound message goes through zod before anything looks at it.
 */
export class RoomDO extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) return; // malformed / oversized: drop silently (§6.6)
    switch (msg.t) {
      case "ping":
        ws.send(JSON.stringify({ t: "pong", c: msg.c, s: Date.now() }));
        break;
      default:
        // TODO(M3): hello / vote / emote / start / settings
        break;
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }
}
