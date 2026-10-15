import { MAX_CLIENT_MESSAGE_BYTES } from "@committee-snake/shared";

const encoder = new TextEncoder();

/**
 * The real 512-byte cap on inbound socket messages (docs/PLAN.md §6.6), measured
 * in UTF-8 bytes. `parseClientMessage` in shared only checks UTF-16 length, which
 * lets multi-byte text through at up to 3× the cap, so call this first.
 */
export function withinByteCap(raw: string | ArrayBuffer): boolean {
  if (typeof raw !== "string") return raw.byteLength <= MAX_CLIENT_MESSAGE_BYTES;
  // Each UTF-16 unit is 1–3 UTF-8 bytes, so most messages are decided without encoding.
  if (raw.length > MAX_CLIENT_MESSAGE_BYTES) return false;
  if (raw.length * 3 <= MAX_CLIENT_MESSAGE_BYTES) return true;
  return encoder.encode(raw).byteLength <= MAX_CLIENT_MESSAGE_BYTES;
}
