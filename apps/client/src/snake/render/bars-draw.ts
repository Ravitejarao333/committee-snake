import { avatarBits, DIRS, type Dir, type PlayerId, type VoteCount } from "@committee-snake/shared";
import { avatarBitmap } from "./avatar";
import {
  type BarsLayout,
  barSlots,
  barsLayout,
  cornerSlots,
  fillRect,
  type Grid,
  glyphAt,
  type Slots,
  trackRect,
  tween,
} from "./bars";
import type { LcdLayout } from "./layout";
import { drawBitmap } from "./lcd";
import { type Bitmap, DIGITS, GLYPH, rotate } from "./sprites";

/** What the bars show this frame. */
interface BarsFrame {
  count: VoteCount;
  /** Seat order, for lining avatars up. */
  order: readonly PlayerId[];
  /** Direction taken on the last tick: its arrow stays solid until the next one. */
  winner: Dir | null;
  /** When the last tick happened (the pulse). */
  tickAt: number;
}

interface BarsMotion {
  slide: boolean;
  pulse: boolean;
}

const SLIDE_MS = 120;
const PULSE_MS = 100;
const TRACK_ALPHA = 0.15;
const PULSE_TRACK_ALPHA = 0.35;
const DIM_ALPHA = 0.4;
/** The arrow glyph points up; these turns aim it at each bar's direction. */
const ARROW_TURN: Readonly<Record<Dir, Dir>> = { U: "R", R: "D", D: "L", L: "U" };
const PLUS: Bitmap = ["...", ".#.", "###", ".#.", "..."];

interface Motion {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  at: number;
}

type Ctx = CanvasRenderingContext2D;

/** "+N" squeezed into one 7x7-unit avatar slot. */
function drawMore(ctx: Ctx, x: number, y: number, unit: number, n: number): void {
  const glyphs = [
    PLUS,
    ...String(n)
      .split("")
      .map((d) => DIGITS[Number(d)] ?? []),
  ];
  const u = Math.max(1, Math.floor((7 * unit) / (4 * glyphs.length - 1)));
  const top = y + Math.floor((7 * unit - 5 * u) / 2);
  glyphs.forEach((g, i) => {
    drawBitmap(ctx, g, x + i * 4 * u, top, u);
  });
}

export function createBarsPainter(grid: Grid) {
  const moving = new Map<PlayerId, Motion>();
  const avatars = new Map<PlayerId, Bitmap>();
  let cached: { l: LcdLayout; bl: BarsLayout } | null = null;

  const avatar = (id: PlayerId): Bitmap => {
    let b = avatars.get(id);
    if (!b) {
      b = avatarBitmap(avatarBits(id));
      avatars.set(id, b);
    }
    return b;
  };

  /** Current drawn position of an avatar heading for (tx, ty). */
  const position = (id: PlayerId, tx: number, ty: number, now: number, slide: boolean) => {
    const m = moving.get(id);
    if (!m || !slide) {
      moving.set(id, { fx: tx, fy: ty, tx, ty, at: now });
      return [tx, ty] as const;
    }
    const t = (now - m.at) / SLIDE_MS;
    const cx = Math.round(tween(m.fx, m.tx, t));
    const cy = Math.round(tween(m.fy, m.ty, t));
    if (m.tx !== tx || m.ty !== ty) {
      moving.set(id, { fx: cx, fy: cy, tx, ty, at: now });
      return [cx, cy] as const;
    }
    return [cx, cy] as const;
  };

  const drawSlots = (ctx: Ctx, s: Slots, now: number, slide: boolean, seen: Set<PlayerId>) => {
    for (const slot of s.slots) {
      seen.add(slot.id);
      const [x, y] = position(slot.id, slot.x, slot.y, now, slide);
      drawBitmap(ctx, avatar(slot.id), x, y, s.unit);
    }
    if (s.more) drawMore(ctx, s.more.x, s.more.y, s.unit, s.more.n);
  };

  return function paint(ctx: Ctx, l: LcdLayout, f: BarsFrame, now: number, m: BarsMotion): void {
    if (cached?.l !== l) cached = { l, bl: barsLayout(l, grid) };
    const bl = cached.bl;
    const base = ctx.globalAlpha;
    const { counts, nonsense, byDir, nonsenseBy } = f.count;
    const total = DIRS.reduce((n, d) => n + counts[d], nonsense);
    const pulse = m.pulse && now - f.tickAt >= 0 && now - f.tickAt < PULSE_MS;
    const rank = (id: PlayerId): number => {
      const i = f.order.indexOf(id);
      return i < 0 ? f.order.length : i;
    };
    const bySeat = (ids: readonly PlayerId[]) => [...ids].sort((a, b) => rank(a) - rank(b));
    const seen = new Set<PlayerId>();

    for (const d of DIRS) {
      const bar = bl.bars[d];
      const won = d === f.winner;
      const t = trackRect(bar, bl.dot);
      ctx.globalAlpha = base * (pulse ? PULSE_TRACK_ALPHA : TRACK_ALPHA);
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.globalAlpha = base;
      const fill = fillRect(bar, bl.dot, counts[d], total, pulse && won);
      if (fill.w > 0 && fill.h > 0) ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
      const g = glyphAt(bar, bl);
      ctx.globalAlpha = base * (won ? 1 : DIM_ALPHA);
      drawBitmap(ctx, rotate(GLYPH.arrow, ARROW_TURN[d]), g.x, g.y, bl.glyphUnit);
      ctx.globalAlpha = base;
      drawSlots(ctx, barSlots(bar, bl, bySeat(byDir[d])), now, m.slide, seen);
    }

    // The 🙃 corner: reverse votes, counted but never winning.
    const c = bl.corner;
    const gu = bl.glyphUnit;
    ctx.globalAlpha = base * DIM_ALPHA;
    drawBitmap(ctx, GLYPH.upside, c.x, c.y, gu);
    if (nonsense > 0) {
      String(nonsense)
        .split("")
        .forEach((digit, i) => {
          drawBitmap(ctx, DIGITS[Number(digit)] ?? [], c.x + 9 * gu + i * 4 * gu, c.y + gu, gu);
        });
    }
    drawSlots(ctx, cornerSlots(bl, bySeat(nonsenseBy)), now, m.slide, seen);
    ctx.globalAlpha = base;

    for (const id of moving.keys()) if (!seen.has(id)) moving.delete(id);
  };
}
