import type { Dir, PlayerId } from "@committee-snake/shared";
import type { LcdLayout } from "./layout";

/**
 * Pure tally-bar geometry (docs/PLAN.md §3.2), in device px. The four bars live in the frame
 * around the board: up on top, down below, left and right on the sides. Distances "across" a
 * band are measured from its outer edge, so the track always hugs the board.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Grid {
  cols: number;
  rows: number;
  hudRows: number;
}

export interface Bar {
  dir: Dir;
  band: Rect;
  /** Band length along the bar and thickness across it. */
  len: number;
  thick: number;
}

export interface BarsLayout {
  bars: Readonly<Record<Dir, Bar>>;
  /** Bottom-right corner square: the 🙃 nonsense tally. */
  corner: Rect;
  dot: number;
  /** Avatar dot size: 7x7 avatars, 1 unit apart. */
  unit: number;
  /** 8x8 glyph dot size. */
  glyphUnit: number;
}

export interface Slot {
  id: PlayerId;
  x: number;
  y: number;
}

export interface Slots {
  /** Avatar dot size for these slots. */
  unit: number;
  slots: Slot[];
  /** "+N" in the last slot when the row would outgrow the bar. */
  more: { x: number; y: number; n: number } | null;
}

export function barsLayout(l: LcdLayout, g: Grid): BarsLayout {
  const p = l.pitch;
  const bx = l.frame * p;
  const by = (g.hudRows + l.frame) * p;
  const bw = g.cols * p - l.gap;
  const bh = g.rows * p - l.gap;
  const t = Math.max(1, l.frame * p - l.gap);
  const right = bx + g.cols * p;
  const bottom = by + g.rows * p;
  const bar = (dir: Dir, band: Rect): Bar => {
    const horizontal = dir === "U" || dir === "D";
    return { dir, band, len: horizontal ? band.w : band.h, thick: horizontal ? band.h : band.w };
  };
  return {
    bars: {
      U: bar("U", { x: bx, y: g.hudRows * p, w: bw, h: t }),
      D: bar("D", { x: bx, y: bottom, w: bw, h: t }),
      L: bar("L", { x: 0, y: by, w: t, h: bh }),
      R: bar("R", { x: right, y: by, w: t, h: bh }),
    },
    corner: { x: right, y: bottom, w: t, h: t },
    dot: l.dot,
    unit: Math.max(1, Math.floor((l.dot * 3) / 4)),
    glyphUnit: Math.max(1, Math.floor(l.dot / 2)),
  };
}

/** A rect `along` the bar and `across` it from the band's outer edge. */
export function place(
  b: Bar,
  along: number,
  across: number,
  alongLen: number,
  acrossLen: number,
): Rect {
  const { x, y, w, h } = b.band;
  switch (b.dir) {
    case "U":
      return { x: x + along, y: y + across, w: alongLen, h: acrossLen };
    case "D":
      return { x: x + along, y: y + h - across - acrossLen, w: alongLen, h: acrossLen };
    case "L":
      return { x: x + across, y: y + along, w: acrossLen, h: alongLen };
    case "R":
      return { x: x + w - across - acrossLen, y: y + along, w: acrossLen, h: alongLen };
  }
}

/** The 1-dot ghost track along the inner edge, one dot off the board. */
export const trackRect = (b: Bar, dot: number): Rect =>
  place(b, 0, Math.max(0, b.thick - 2 * dot), b.len, dot);

/**
 * The lit fill, centred on the track: length is the bar's share of all live votes (nonsense
 * included, so 2-1 reads as 2/3 vs 1/3). `wide` (the winner on a pulse) adds one dot outward.
 */
export function fillRect(b: Bar, dot: number, count: number, total: number, wide: boolean): Rect {
  const len = total > 0 ? Math.round((b.len * Math.max(0, count)) / total) : 0;
  const t = wide ? 2 * dot : dot;
  return place(b, Math.floor((b.len - len) / 2), Math.max(0, b.thick - dot - t), len, t);
}

/** Where the bar's 8x8 arrow sits: at its start, centred in the space outside the track. */
export function glyphAt(b: Bar, bl: BarsLayout): Rect {
  const size = 8 * bl.glyphUnit;
  const across = Math.max(0, Math.floor((b.thick - 3 * bl.dot - size) / 2));
  return place(b, bl.dot, across, size, size);
}

/**
 * Avatar slots: agreeing voters line up along the bar, centred on its midpoint, 1 unit apart,
 * in the given (seat) order, clear of the arrow glyph at either end.
 */
export function barSlots(b: Bar, bl: BarsLayout, ids: readonly PlayerId[]): Slots {
  const u = bl.unit;
  const size = 7 * u;
  const step = 8 * u;
  const margin = 2 * (2 * bl.dot + 8 * bl.glyphUnit);
  const cap = Math.max(1, Math.floor((b.len - margin + u) / step));
  const overflow = ids.length > cap;
  const count = overflow ? cap : ids.length;
  const start = Math.floor((b.len - (count * step - u)) / 2);
  const across = Math.max(0, Math.floor((b.thick - 3 * bl.dot - size) / 2));
  const at = (i: number): Rect => place(b, start + i * step, across, size, size);
  const shown = overflow ? cap - 1 : count;
  const slots = ids.slice(0, shown).map((id, i) => ({ id, ...xy(at(i)) }));
  const more = overflow ? { ...xy(at(cap - 1)), n: ids.length - shown } : null;
  return { unit: u, slots, more };
}

const xy = (r: Rect): { x: number; y: number } => ({ x: r.x, y: r.y });

/** Nonsense voters: a row of 7x7 avatars along the bottom of the corner square. */
export function cornerSlots(bl: BarsLayout, ids: readonly PlayerId[]): Slots {
  const c = bl.corner;
  const u = Math.max(1, Math.floor(c.w / 32));
  const step = 8 * u;
  const cap = Math.max(1, Math.floor((c.w + u) / step));
  const overflow = ids.length > cap;
  const shown = overflow ? cap - 1 : ids.length;
  const y = c.y + c.h - 7 * u;
  const slots = ids.slice(0, shown).map((id, i) => ({ id, x: c.x + i * step, y }));
  const more = overflow ? { x: c.x + shown * step, y, n: ids.length - shown } : null;
  return { unit: u, slots, more };
}

/** Ease-out interpolation from `from` to `to`; `t` is clamped to 0..1. */
export function tween(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  return from + (to - from) * (1 - (1 - k) * (1 - k));
}
