import { ROOM_CODE_ALPHABET, ROOM_CODE_RE } from "@committee-snake/shared";
import type { Env } from "./env";

export { LobbyDO } from "./lobby";
export { RoomDO } from "./room";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

/**
 * Router Worker. Validates the request shape and forwards to the right
 * Durable Object. All game logic lives in RoomDO; this file stays dumb.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, env: env.ENVIRONMENT });
    }

    // POST /room -> create a private room, return its code.
    if (url.pathname === "/room" && request.method === "POST") {
      const code = newRoomCode();
      return json({ code }, 201);
    }

    // GET /room/:code (WebSocket upgrade) -> that room's DO.
    const room = /^\/room\/([A-Z0-9]{4})$/.exec(url.pathname);
    if (room) {
      const code = room[1] as string;
      if (!ROOM_CODE_RE.test(code)) return json({ error: "bad room code" }, 400);
      const id = env.ROOM.idFromName(`private-${code}`);
      return env.ROOM.get(id).fetch(request);
    }

    // GET /public/join -> Lobby picks the fullest non-full shard.
    if (url.pathname === "/public/join") {
      const id = env.LOBBY.idFromName("lobby");
      return env.LOBBY.get(id).fetch(request);
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
