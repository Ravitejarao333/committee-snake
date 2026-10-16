import type { Dir } from "@committee-snake/shared";

/**
 * Original LCD bitmaps (data only). Rows of "#" (lit dot) and "." (unlit).
 *
 * The snake is drawn the way the original 84x48 screen did it: a line 3 dots thick on a 4-dot
 * grid. Each snake sprite below is a 3x3 core, drawn facing right ("R"); `rotate` turns it and
 * `cellSprite` places it in the top-left of the 4x4 cell. The 4th column and row are the 1-dot
 * gap, filled only where the cell links to its neighbour, so parallel runs stay apart.
 */
export type Bitmap = readonly string[];

/** Straight body, two alternating notch phases so the snake reads as segments. */
export const BODY_A: Bitmap = ["#.#", "###", "###"];
export const BODY_B: Bitmap = ["###", "###", "#.#"];

/** Corner joining the left and bottom edges (outer corner rounded); rotate for the other three. */
export const CORNER: Bitmap = ["##.", "###", "###"];

/** Tail tip, body continues to the right. */
export const TAIL: Bitmap = [".##", "###", ".##"];

/** Head facing right: rounded nose, unlit eye in the middle. */
export const HEAD: Bitmap = ["##.", "#.#", "##."];

/** Head facing right with the mouth open (shown the tick before eating). */
export const HEAD_OPEN: Bitmap = ["###", "#..", "###"];

/**
 * Place a 3x3 snake core in its 4x4 cell, filling the gap column or row toward a neighbour on
 * the right or below. (A neighbour on the left or above fills its own gap toward this cell.)
 */
export function cellSprite(core: Bitmap, link: { right: boolean; down: boolean }): Bitmap {
  const rows = core.map((r) => r + (link.right ? "#" : "."));
  rows.push(link.down ? "###." : "....");
  return rows;
}

/** Food: one centred block. */
export const FOOD: Bitmap = ["....", ".##.", ".##.", "...."];

/** Bonus critter: a little beetle filling its one hit cell (the sim scores one cell). */
export const CRITTER: Bitmap = ["#..#", ".##.", "####", "#..#"];

/** 3x5 digits for the critter countdown. */
export const DIGITS: readonly Bitmap[] = [
  ["###", "#.#", "#.#", "#.#", "###"],
  [".#.", "##.", ".#.", ".#.", "###"],
  ["###", "..#", "###", "#..", "###"],
  ["###", "..#", ".##", "..#", "###"],
  ["#.#", "#.#", "###", "..#", "..#"],
  ["###", "#..", "###", "..#", "###"],
  ["###", "#..", "###", "#.#", "###"],
  ["###", "..#", ".#.", ".#.", ".#."],
  ["###", "#.#", "###", "#.#", "###"],
  ["###", "#.#", "###", "..#", "###"],
];

/** Quarter turns clockwise needed to face `dir` from "R". */
const TURNS: Readonly<Record<Dir, number>> = { R: 0, D: 1, L: 2, U: 3 };

function rotateCw(b: Bitmap): Bitmap {
  const h = b.length;
  const w = b[0]?.length ?? 0;
  const out: string[] = [];
  for (let y = 0; y < w; y++) {
    let row = "";
    for (let x = 0; x < h; x++) row += b[h - 1 - x]?.[y] ?? ".";
    out.push(row);
  }
  return out;
}

/** Rotate a right-facing bitmap so it faces `dir`. */
export function rotate(b: Bitmap, dir: Dir): Bitmap {
  let out = b;
  for (let i = 0; i < TURNS[dir]; i++) out = rotateCw(out);
  return out;
}
