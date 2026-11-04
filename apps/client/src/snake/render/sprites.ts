import type { Dir } from "@committee-snake/shared";

/**
 * Original LCD bitmaps (data only). Rows of "#" (lit dot) and "." (unlit).
 * Cell sprites are 4x4 and drawn facing right ("R"); `rotate` turns them.
 */
export type Bitmap = readonly string[];

/** Straight body, two alternating notch phases so the snake reads as segments. */
export const BODY_A: Bitmap = ["....", "##.#", "####", "...."];
export const BODY_B: Bitmap = ["....", "####", "#.##", "...."];

/** Corner joining the left and bottom edges; rotate for the other three. */
export const CORNER: Bitmap = ["....", "###.", "#.#.", ".##."];

/** Tail tip, body continues to the right. */
export const TAIL: Bitmap = ["....", "..##", "####", "...."];

/** Head facing right, with an unlit eye dot at (1, 1). */
export const HEAD: Bitmap = ["###.", "#.##", "####", "###."];

/** Head facing right with the mouth open (shown the tick before eating). */
export const HEAD_OPEN: Bitmap = ["####", "#.#.", "##..", "####"];

/**
 * Place a 3x3 snake core in its 4x4 cell, filling the gap column or row toward a neighbour on
 * the right or below. (A neighbour on the left or above fills its own gap toward this cell.)
 */
export function cellSprite(core: Bitmap, link: { right: boolean; down: boolean }): Bitmap {
  const rows = core.map((r) => r + (link.right ? "#" : "."));
  rows.push(link.down ? "###." : "....");
  return rows;
}

/** One snake look: right-facing parts plus how a rotated part becomes a 4x4 cell sprite. */
interface SnakeSprites {
  readonly BODY_A: Bitmap;
  readonly BODY_B: Bitmap;
  readonly CORNER: Bitmap;
  readonly TAIL: Bitmap;
  readonly HEAD: Bitmap;
  readonly HEAD_OPEN: Bitmap;
  /** `links` are the sides the segment joins (toward the head and the tail). */
  place(part: Bitmap, links: readonly Dir[]): Bitmap;
}

/** The classic 2-dot snake: 4x4 parts drawn as they are. */
const CLASSIC: SnakeSprites = { BODY_A, BODY_B, CORNER, TAIL, HEAD, HEAD_OPEN, place: (b) => b };

/**
 * The thick snake: a line 3 dots thick on the 4-dot grid. Each part is a 3x3 core; `cellSprite`
 * puts it in the cell and fills the 1-dot gap only toward a linked neighbour.
 */
export const THICK: SnakeSprites = {
  BODY_A: ["#.#", "###", "###"],
  BODY_B: ["###", "###", "#.#"],
  /** Outer corner rounded. */
  CORNER: ["##.", "###", "###"],
  TAIL: [".##", "###", ".##"],
  /** Rounded nose, unlit eye in the middle. */
  HEAD: ["##.", "#.#", "##."],
  HEAD_OPEN: ["###", "#..", "###"],
  place: (core, links) =>
    cellSprite(core, { right: links.includes("R"), down: links.includes("D") }),
};

export type SnakeStyle = "classic" | "thick";

/** Which snake the board draws. */
export const SNAKE_STYLE: SnakeStyle = "classic";

export const SNAKE_SPRITES: Readonly<Record<SnakeStyle, SnakeSprites>> = {
  classic: CLASSIC,
  thick: THICK,
};

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

/** 8x8 glyphs for the tally bars and the Blame Screen (original pixel art, not emoji). */
export const GLYPH = {
  /** Arrow pointing up; `rotate` it for the other directions. */
  arrow: [
    "...##...",
    "..####..",
    ".######.",
    "########",
    "...##...",
    "...##...",
    "...##...",
    "...##...",
  ],
  /** Upside-down face: the nonsense (reverse) votes. */
  upside: [
    "..####..",
    ".#....#.",
    "#..##..#",
    "#.#..#.#",
    "#......#",
    "#.#..#.#",
    ".#....#.",
    "..####..",
  ],
  /** Kitchen knife, blade up-right: the assassins. */
  knife: [
    "......##",
    ".....###",
    "....###.",
    "...###..",
    "..###...",
    ".##.....",
    "###.....",
    "##......",
  ],
  /** Two hands pressed together: tried to save it. */
  hands: [
    "...##...",
    "..####..",
    "..####..",
    ".######.",
    ".######.",
    "##.##.##",
    "#..##..#",
    "...##...",
  ],
  /** A little coiled snake, for the share card footer. */
  snake: [
    "........",
    ".....##.",
    "....#.##",
    "....###.",
    ".#..##..",
    "#.#.##..",
    "#..###..",
    ".####...",
  ],
} as const satisfies Record<string, Bitmap>;

export type GlyphName = keyof typeof GLYPH;

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
