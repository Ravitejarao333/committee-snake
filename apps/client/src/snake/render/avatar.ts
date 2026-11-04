import type { Bitmap } from "./sprites";

/** Avatars are 7x7 (shared `avatarBits`: 7 row masks, bit 6 = leftmost column). */
export const AVATAR_SIZE = 7;

/** The avatar as a bitmap for `drawBitmap`. */
export function avatarBitmap(bits: readonly number[]): Bitmap {
  return bits.map((mask) => {
    let row = "";
    for (let c = AVATAR_SIZE - 1; c >= 0; c--) row += (mask >> c) & 1 ? "#" : ".";
    return row;
  });
}

/** SVG path data for the avatar in a 7x7 viewBox: one rect per horizontal run of lit dots. */
export function avatarPath(bits: readonly number[]): string {
  let d = "";
  avatarBitmap(bits).forEach((row, y) => {
    for (const m of row.matchAll(/#+/g)) d += `M${m.index} ${y}h${m[0].length}v1H${m.index}z`;
  });
  return d;
}
