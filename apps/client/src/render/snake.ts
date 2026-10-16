import type { Cell, Dir, GameState } from "@committee-snake/shared";
import type { LcdLayout } from "./layout";
import { COLS, cellOrigin, drawBitmap } from "./lcd";
import {
  type Bitmap,
  BODY_A,
  BODY_B,
  CORNER,
  CRITTER,
  DIGITS,
  FOOD,
  HEAD,
  HEAD_OPEN,
  rotate,
  TAIL,
} from "./sprites";

/** What the board renderer needs from a game state. */
export type BoardView = Pick<GameState, "tick" | "snake" | "dir" | "food" | "bonus" | "alive">;

/**
 * RENDER-ONLY offsets, used just to peek at the cell in front of the head so
 * the mouth can open a tick early. Movement itself lives in packages/shared.
 */
const RENDER_AHEAD: Readonly<Record<Dir, Cell>> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

/** Which side of `from` the neighbouring cell `to` is on (wrap-aware, render-only). */
function sideOf(from: Cell, to: Cell): Dir {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dy === 0) return dx === 1 || dx < -1 ? "R" : "L";
  return dy === 1 || dy < -1 ? "D" : "U";
}

/** Rotation that turns CORNER (left + bottom) into each pair of sides, keyed alphabetically. */
const CORNER_TURN: Readonly<Record<string, Dir>> = { DL: "R", LU: "D", RU: "L", DR: "U" };

const at = (c: Cell | undefined, x: number, y: number): boolean => !!c && c[0] === x && c[1] === y;

/** The sprite for segment `i` of the snake (head first). */
export function segmentSprite(view: BoardView, i: number, mouthOpen: boolean): Bitmap {
  const s = view.snake;
  const cell = s[i];
  if (!cell) return [];
  if (i === 0) return rotate(mouthOpen ? HEAD_OPEN : HEAD, view.dir);
  const toHead = s[i - 1];
  const toTail = s[i + 1];
  if (!toHead) return [];
  const a = sideOf(cell, toHead);
  if (!toTail) return rotate(TAIL, a);
  const b = sideOf(cell, toTail);
  const straight = (a === "L" || a === "R") === (b === "L" || b === "R");
  if (straight) {
    // Alternate the notch per segment; tick - i is stable for a segment as it moves.
    const body = ((view.tick - i) & 1) === 0 ? BODY_A : BODY_B;
    return rotate(body, a === "L" || a === "R" ? "R" : "D");
  }
  const key = [a, b].sort().join("");
  return rotate(CORNER, CORNER_TURN[key] ?? "R");
}

/** True when the head is about to bite food or the critter (cosmetic look-ahead). */
function mouthOpen(view: BoardView): boolean {
  const head = view.snake[0];
  if (!head || !view.alive) return false;
  const [dx, dy] = RENDER_AHEAD[view.dir];
  const x = head[0] + dx;
  const y = head[1] + dy;
  return at(view.food, x, y) || at(view.bonus?.cell, x, y);
}

/** Draw food, critter, its countdown and the snake into the board layer. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  l: LcdLayout,
  view: BoardView,
  opts: { visible: boolean },
): void {
  const [fx, fy] = cellOrigin(l, view.food[0], view.food[1]);
  drawBitmap(ctx, FOOD, fx, fy, l.dot);

  if (view.bonus) {
    const [bx, by] = view.bonus.cell;
    const [cx, cy] = cellOrigin(l, bx, by);
    drawBitmap(ctx, CRITTER, cx, cy, l.dot);
    const digits = String(view.bonus.ttl)
      .split("")
      .map((d) => DIGITS[Number(d)] ?? []);
    const textW = (digits.length * 4 - 1) * l.dot;
    // Countdown beside the critter, flipped to its left near the right wall.
    const right = bx + 3 < COLS;
    const tx = right ? cx + l.pitch + l.dot : cx - l.dot - textW;
    const ty = cy - Math.floor(l.dot / 2);
    digits.forEach((g, i) => {
      drawBitmap(ctx, g, tx + i * 4 * l.dot, ty, l.dot);
    });
  }

  if (!opts.visible) return;
  const open = mouthOpen(view);
  for (let i = view.snake.length - 1; i >= 0; i--) {
    const cell = view.snake[i];
    if (!cell) continue;
    const [x, y] = cellOrigin(l, cell[0], cell[1]);
    drawBitmap(ctx, segmentSprite(view, i, open), x, y, l.dot);
  }
}
