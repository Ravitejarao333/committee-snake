import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/**
 * Tracks public shards and their live voter counts; assigns newcomers to the
 * fullest shard under the cap (fill-first, never round-robin). See §5.4.
 */
export class LobbyDO extends DurableObject<Env> {
  override async fetch(_request: Request): Promise<Response> {
    // TODO(M4): shard registry + fill-first assignment + ghost voters.
    return new Response(JSON.stringify({ shard: "public-1" }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
