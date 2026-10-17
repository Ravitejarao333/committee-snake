import type { Cell } from "@committee-snake/shared";
import { CELL_DOTS, computeLcdLayout, type LcdLayout } from "./layout";
import { type Bitmap, DIGITS } from "./sprites";

export const COLS = 32;
const ROWS = 20;
const HUD_ROWS = 2;
/** Board size in cells plus the HUD rows above it (the bars' frame goes around both). */
export const GRID = { cols: COLS, rows: ROWS, hudRows: HUD_ROWS } as const;
/** Tally-bar frame cells on each side of the board. */
const FRAME = 2;
export const LCD_BG = "#c7f0d8";
export const LCD_PX = "#43523d";
const GHOST_ALPHA = 0.06;
const SHIMMER_ALPHA = 0.02;
const AFTERIMAGE_MS = 120;
const AFTERIMAGE_ALPHA = 0.45;
export const FONT = '"Press Start 2P", ui-monospace, monospace';

export interface Motion {
  shimmer: boolean;
  ramp: boolean;
  ghost: boolean;
  /** Avatars slide between bars. */
  slide: boolean;
  /** Bars pulse on every tick. */
  pulse: boolean;
}

interface Hud {
  score: number;
  len: number;
  tps: number;
}

export interface Afterimage {
  cell: Cell;
  bitmap: Bitmap;
  at: number;
}

export type Overlay = { kind: "text"; lines: readonly string[] } | { kind: "digit"; n: number };

/** Something drawn every frame on top of the board layer (bars, Blame Screen, toast). */
export type Layer = (ctx: CanvasRenderingContext2D, layout: LcdLayout, now: number) => void;

export interface Frame {
  /** LCD contrast 0..1 (power-on ramp). */
  power: number;
  /** Show the tick-only board layer (off on the Blame Screen). */
  board: boolean;
  /** Drawn after the board and afterimage, before the overlay, in order. */
  layers: readonly Layer[];
  afterimage: Afterimage | null;
  overlay: Overlay | null;
}

export interface Lcd {
  readonly layout: LcdLayout;
  readonly motion: Readonly<Motion>;
  /** Called after a resize, a dpr change or the pixel font loading: redraw the board. */
  onChange(cb: () => void): void;
  /** Clear the tick-only board layer and draw into it. */
  drawBoard(draw: (ctx: CanvasRenderingContext2D, layout: LcdLayout) => void): void;
  /** The 60 fps composite: bg, ghost grid, board, afterimage, overlay, shimmer. */
  composite(now: number, frame: Frame): void;
}

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

/** Largest multiple of 8 device px (Press Start 2P's grid) that fits, min 8. */
const fontPx = (limit: number): number => Math.max(8, 8 * Math.floor(limit / 8));

function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return ctx;
}

export function drawHud(ctx: CanvasRenderingContext2D, l: LcdLayout, hud: Hud): void {
  const h = HUD_ROWS * l.pitch;
  const size = fontPx(Math.min(h * 0.5, l.widthDev / 34));
  ctx.fillStyle = LCD_PX;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = "top";
  const y = Math.floor((h - l.dot - size) / 2);
  const pad = l.pitch;
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${String(hud.score).padStart(4, "0")}`, pad, y);
  ctx.textAlign = "center";
  ctx.fillText(`LEN ${String(hud.len).padStart(3, "0")}`, Math.floor(l.widthDev / 2), y);
  ctx.textAlign = "right";
  ctx.fillText(`SPD ${hud.tps.toFixed(2)}`, l.widthDev - pad, y);
  // A one-dot rule under the HUD marks the top wall.
  ctx.fillRect(0, h - l.gap - l.dot, l.widthDev - l.gap, l.dot);
}

function drawOverlay(ctx: CanvasRenderingContext2D, l: LcdLayout, o: Overlay): void {
  const boardTop = cellOrigin(l, 0, 0)[1];
  const boardH = ROWS * l.pitch;
  if (o.kind === "digit") {
    // A huge 3x5 digit where every font dot is one whole lit cell.
    const glyph = DIGITS[o.n] ?? DIGITS[0] ?? [];
    const cx = Math.floor((COLS - 3) / 2);
    const cy = Math.floor((ROWS - 5) / 2);
    const cell = CELL_DOTS * l.dot;
    ctx.fillStyle = LCD_PX;
    for (let j = 0; j < glyph.length; j++) {
      for (let i = 0; i < 3; i++) {
        if (glyph[j]?.[i] !== "#") continue;
        const [x, y] = cellOrigin(l, cx + i, cy + j);
        ctx.fillRect(x, y, cell, cell);
      }
    }
    return;
  }
  const longest = Math.max(1, ...o.lines.map((s) => s.length));
  // Press Start 2P is 1em per glyph; leave 2 em of padding each side inside a 1-cell margin.
  const size = fontPx(Math.min(l.pitch * 1.6, (l.widthDev - 2 * l.pitch) / (longest + 4)));
  const lineH = size * 2;
  const padX = 2 * size;
  const boxW = Math.min(l.widthDev - 2 * l.pitch, longest * size + 2 * padX);
  const boxH = o.lines.length * lineH + 2 * size;
  const bx = Math.floor((l.widthDev - boxW) / 2);
  const by = boardTop + Math.floor((boardH - boxH) / 2);
  ctx.fillStyle = LCD_BG;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.fillStyle = LCD_PX;
  const t = l.dot;
  ctx.fillRect(bx, by, boxW, t);
  ctx.fillRect(bx, by + boxH - t, boxW, t);
  ctx.fillRect(bx, by, t, boxH);
  ctx.fillRect(bx + boxW - t, by, t, boxH);
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const cx = Math.floor(l.widthDev / 2);
  o.lines.forEach((line, i) => {
    ctx.fillText(line, cx, by + size + i * lineH + Math.floor((lineH - size) / 2));
  });
}

export function createLcd(canvas: HTMLCanvasElement, slot: HTMLElement): Lcd {
  const ctx = context(canvas);
  const grid = document.createElement("canvas");
  const board = document.createElement("canvas");
  const gridCtx = context(grid);
  const boardCtx = context(board);
  const listeners: (() => void)[] = [];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const motion: Motion = { shimmer: true, ramp: true, ghost: true, slide: true, pulse: true };
  const applyMotion = (): void => {
    const on = !reduce.matches;
    motion.shimmer = on;
    motion.ramp = on;
    motion.ghost = on;
    motion.slide = on;
    motion.pulse = on;
  };
  applyMotion();
  reduce.addEventListener("change", applyMotion);

  let layout = computeLcdLayout({
    availW: 0,
    availH: 0,
    dpr: 1,
    cols: COLS,
    rows: ROWS,
    hudRows: HUD_ROWS,
    frame: FRAME,
  });
  let availW = 0;
  let availH = 0;

  const notify = (): void => {
    for (const cb of listeners) cb();
  };

  const relayout = (): void => {
    const next = computeLcdLayout({
      availW,
      availH,
      dpr: window.devicePixelRatio || 1,
      cols: COLS,
      rows: ROWS,
      hudRows: HUD_ROWS,
      frame: FRAME,
    });
    const same =
      next.widthDev === layout.widthDev &&
      next.heightDev === layout.heightDev &&
      next.dpr === layout.dpr;
    layout = next;
    if (same && canvas.width === next.widthDev) return;
    for (const c of [canvas, grid, board]) {
      c.width = next.widthDev;
      c.height = next.heightDev;
    }
    canvas.style.width = `${next.cssW}px`;
    canvas.style.height = `${next.cssH}px`;
    for (const c of [ctx, gridCtx, boardCtx]) c.imageSmoothingEnabled = false;
    // Unlit "ghost" cells: the faint grid that makes it read as an LCD.
    gridCtx.clearRect(0, 0, next.widthDev, next.heightDev);
    gridCtx.fillStyle = LCD_PX;
    gridCtx.globalAlpha = GHOST_ALPHA;
    const cell = CELL_DOTS * next.dot;
    for (let y = 0; y < next.heightDev; y += next.pitch) {
      for (let x = 0; x < next.widthDev; x += next.pitch) gridCtx.fillRect(x, y, cell, cell);
    }
    gridCtx.globalAlpha = 1;
    notify();
  };

  new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    if (!box) return;
    availW = box.width;
    availH = box.height;
    relayout();
  }).observe(slot);
  // Browser zoom and moving between monitors change dpr without resizing the slot.
  window.addEventListener("resize", relayout);
  void document.fonts
    ?.load(`16px ${FONT}`)
    .then(notify)
    .catch(() => undefined);

  return {
    get layout() {
      return layout;
    },
    motion,
    onChange(cb) {
      listeners.push(cb);
    },
    drawBoard(draw) {
      boardCtx.clearRect(0, 0, board.width, board.height);
      boardCtx.fillStyle = LCD_PX;
      draw(boardCtx, layout);
    },
    composite(now, f) {
      const l = layout;
      ctx.globalAlpha = 1;
      ctx.fillStyle = LCD_BG;
      ctx.fillRect(0, 0, l.widthDev, l.heightDev);
      ctx.globalAlpha = f.power;
      ctx.drawImage(grid, 0, 0);
      if (f.board) ctx.drawImage(board, 0, 0);
      const a = f.board ? f.afterimage : null;
      if (a && motion.ghost) {
        const age = now - a.at;
        if (age >= 0 && age < AFTERIMAGE_MS) {
          ctx.globalAlpha = f.power * AFTERIMAGE_ALPHA * (1 - age / AFTERIMAGE_MS);
          ctx.fillStyle = LCD_PX;
          const [x, y] = cellOrigin(l, a.cell[0], a.cell[1]);
          drawBitmap(ctx, a.bitmap, x, y, l.dot);
        }
      }
      ctx.globalAlpha = f.power;
      ctx.fillStyle = LCD_PX;
      for (const layer of f.layers) {
        layer(ctx, l, now);
        ctx.globalAlpha = f.power;
        ctx.fillStyle = LCD_PX;
      }
      if (f.overlay) drawOverlay(ctx, l, f.overlay);
      if (motion.shimmer) {
        // Faint horizontal bands drifting down, about one board height per 20 s.
        const band = 3 * l.pitch;
        const period = 2 * band;
        const offset = Math.floor((now / 1000) * (l.heightDev / 20)) % period;
        ctx.globalAlpha = SHIMMER_ALPHA;
        ctx.fillStyle = LCD_PX;
        for (let y = offset - period; y < l.heightDev; y += period)
          ctx.fillRect(0, y, l.widthDev, band);
      }
      ctx.globalAlpha = 1;
    },
  };
}
