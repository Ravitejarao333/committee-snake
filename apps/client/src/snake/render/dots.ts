import type { LcdLayout } from "./layout";
import type { Bitmap } from "./sprites";

/**
 * The LCD's grid and dot primitives, kept apart from lcd.ts so the hub's preview can draw a
 * board without loading the whole phone screen.
 */
export const COLS = 32;
export const ROWS = 20;
export const HUD_ROWS = 2;
/** Board size in cells plus the HUD rows above it (the bars' frame goes around both). */
export const GRID = { cols: COLS, rows: ROWS, hudRows: HUD_ROWS } as const;
export const LCD_BG = "#c7f0d8";
export const LCD_PX = "#43523d";
export const FONT = '"Press Start 2P", ui-monospace, monospace';

/** Device-px top-left of a board cell (the HUD rows and the bar frame sit around it). */
export function cellOrigin(l: LcdLayout, x: number, y: number): [number, number] {
  return [(x + l.frame) * l.pitch, (y + HUD_ROWS + l.frame) * l.pitch];
}

/** Draw a bitmap's lit dots as whole-pixel squares of side `unit`. */
export function drawBitmap(
  ctx: CanvasRenderingContext2D,
  b: Bitmap,
  x0: number,
  y0: number,
  unit: number,
): void {
  for (let j = 0; j < b.length; j++) {
    const row = b[j] ?? "";
    for (let i = 0; i < row.length; i++) {
      if (row[i] === "#") ctx.fillRect(x0 + i * unit, y0 + j * unit, unit, unit);
    }
  }
}
