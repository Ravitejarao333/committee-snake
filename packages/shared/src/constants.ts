/**
 * Zod-free protocol constants. Kept apart from `./protocol` so code that only
 * needs these (the browser client) doesn't pull zod into its bundle.
 */

/**
 * Hard cap on any client message; anything bigger is dropped unread. The byte cap
 * is enforced server-side (apps/server `withinByteCap`, UTF-8 via TextEncoder);
 * `parseClientMessage` in `./protocol` only applies it to string length as a cheap first gate.
 */
export const MAX_CLIENT_MESSAGE_BYTES = 512;
export const MAX_VOTERS = 24;
export const VOTE_EXPIRY_MS = 4_000;
export const EMOTE_COOLDOWN_MS = 1_500;
export const NICKNAME_RE = /^[a-zA-Z0-9_]{3,12}$/;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{4}$`);
