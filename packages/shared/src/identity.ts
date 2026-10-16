import type { PlayerId } from "./types";

/** Avatar size in pixels (square). */
const SIZE = 7;
/** Row 2, columns 2 and 4: the "eyes" used to fix up a blank or full avatar. */
const EYES = 0b0010100;
const EYE_ROW = 2;
const FULL_ROW = (1 << SIZE) - 1;

/** FNV-1a 32-bit over the id's UTF-16 code units. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * murmur3's 32-bit finaliser. Ids like "p1".."p4" differ only in their last character, and
 * FNV-1a alone leaves most of their bits equal (the avatars came out near-identical), so the
 * hash is avalanched before its bits are used.
 */
function fmix32(x: number): number {
  let h = x;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A 7x7 left-right symmetric avatar for a player, identicon style. Identity data, not a game rule.
 *
 * Returns 7 row masks, top row first; bit 6 is the leftmost column, so each mask is < 128.
 * 28 hash bits fill columns 0-3 (4 per row) and are mirrored onto columns 6-4; column 3 is the
 * centre. Never blank and never fully lit: a blank avatar gets eyes, a full one loses them.
 */
export function avatarBits(id: PlayerId): readonly number[] {
  const h = fmix32(fnv1a(id));
  const rows: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    const nibble = (h >>> (4 * r)) & 0xf;
    let mask = 0;
    for (let c = 0; c < 4; c++) {
      if (nibble & (1 << c)) mask |= (1 << (SIZE - 1 - c)) | (1 << c);
    }
    rows.push(mask);
  }
  const anyLit = rows.reduce((acc, m) => acc | m, 0);
  const allLit = rows.reduce((acc, m) => acc & m, FULL_ROW);
  if (anyLit === 0) rows[EYE_ROW] = EYES;
  else if (allLit === FULL_ROW) rows[EYE_ROW] = FULL_ROW & ~EYES;
  return rows;
}
