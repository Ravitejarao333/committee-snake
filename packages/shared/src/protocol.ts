import { z } from "zod";

/** Hard cap on any client message; anything bigger is dropped unread. */
export const MAX_CLIENT_MESSAGE_BYTES = 512;
export const MAX_VOTERS = 24;
export const VOTE_EXPIRY_MS = 4_000;
export const EMOTE_COOLDOWN_MS = 1_500;
export const NICKNAME_RE = /^[a-zA-Z0-9_]{3,12}$/;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{4}$`);

export const DirSchema = z.enum(["U", "D", "L", "R"]);
export const ModeSchema = z.enum(["democracy", "chaos"]);

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    token: z.string().max(64).optional(),
    name: z.string().regex(NICKNAME_RE),
  }),
  z.object({ t: z.literal("vote"), d: DirSchema }),
  z.object({ t: z.literal("emote"), e: z.number().int().min(0).max(5) }),
  z.object({ t: z.literal("start") }),
  z.object({
    t: z.literal("settings"),
    mode: ModeSchema,
    speed: z.number().min(1).max(8),
    walls: z.enum(["solid", "wrap"]),
  }),
  z.object({ t: z.literal("ping"), c: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

const Cell = z.tuple([z.number().int(), z.number().int()]);

export const ServerMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("welcome"), you: z.string(), token: z.string(), room: z.unknown() }),
  z.object({
    t: z.literal("tick"),
    n: z.number().int(),
    head: Cell,
    dir: DirSchema,
    grew: z.boolean(),
    food: Cell,
    bonus: z.object({ x: z.number(), y: z.number(), ttl: z.number() }).optional(),
    score: z.number(),
    len: z.number(),
  }),
  z.object({
    t: z.literal("tally"),
    n: z.number().int(),
    v: z.object({ U: z.number(), D: z.number(), L: z.number(), R: z.number(), X: z.number() }),
    who: z.record(z.string(), DirSchema),
  }),
  z.object({
    t: z.literal("death"),
    n: z.number().int(),
    cause: z.enum(["wall", "self"]),
    fatalDir: DirSchema,
    seed: z.number(),
    caption: z.string(),
    awards: z.array(z.unknown()),
    tally: z.unknown(),
  }),
  z.object({ t: z.literal("roster"), players: z.array(z.unknown()) }),
  z.object({ t: z.literal("emote"), p: z.string(), e: z.number().int() }),
  z.object({ t: z.literal("pong"), c: z.number(), s: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** Parse raw socket data defensively. Returns null for anything we should ignore. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_CLIENT_MESSAGE_BYTES) return null;
  try {
    const result = ClientMessage.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
