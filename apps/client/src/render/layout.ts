/**
 * Pure LCD sizing math. Every cell is a 4x4 grid of "dots" followed by a gap,
 * so a cell is `pitch = 4 * dot + gap` device pixels. All outputs except the
 * CSS size are integers in device pixels, which keeps every fillRect crisp.
 */
interface LayoutInput {
  /** Available slot size in CSS px. */
  availW: number;
  availH: number;
  dpr: number;
  cols: number;
  rows: number;
  /** Extra cell rows above the board for the HUD strip. */
  hudRows: number;
  /** Cells of tally-bar frame on every side of the board. */
  frame: number;
}

export interface LcdLayout {
  /** Side of one LCD dot, device px. */
  dot: number;
  /** Gap after each cell, device px (1 CSS px rounded). */
  gap: number;
  /** Cell pitch, device px. */
  pitch: number;
  widthDev: number;
  heightDev: number;
  /** Canvas CSS size, so that cssW * dpr === widthDev exactly. */
  cssW: number;
  cssH: number;
  dpr: number;
  /** Frame cells per side (copied from the input). */
  frame: number;
}

/** Dots per cell side. */
export const CELL_DOTS = 4;

const finitePos = (n: number, fallback: number): number =>
  Number.isFinite(n) && n > 0 ? n : fallback;

export function computeLcdLayout(input: LayoutInput): LcdLayout {
  const dpr = finitePos(input.dpr, 1);
  const availW = finitePos(input.availW, 0);
  const availH = finitePos(input.availH, 0);
  const frame = Math.max(0, Math.floor(input.frame));
  const totalCols = input.cols + 2 * frame;
  const totalRows = input.rows + input.hudRows + 2 * frame;
  const gap = Math.max(1, Math.round(dpr));
  const maxPitchW = Math.floor((availW * dpr) / totalCols);
  const maxPitchH = Math.floor((availH * dpr) / totalRows);
  const fit = Math.floor((Math.min(maxPitchW, maxPitchH) - gap) / CELL_DOTS);
  const dot = Math.max(1, fit);
  const pitch = CELL_DOTS * dot + gap;
  const widthDev = totalCols * pitch;
  const heightDev = totalRows * pitch;
  return {
    dot,
    gap,
    pitch,
    widthDev,
    heightDev,
    cssW: widthDev / dpr,
    cssH: heightDev / dpr,
    dpr,
    frame,
  };
}
