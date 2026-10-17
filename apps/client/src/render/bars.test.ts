import { describe, expect, it } from "vitest";
import {
  type BarsLayout,
  barSlots,
  barsLayout,
  cornerSlots,
  fillRect,
  glyphAt,
  type Rect,
  trackRect,
  tween,
} from "./bars";
import { computeLcdLayout } from "./layout";

const GRID = { cols: 32, rows: 20, hudRows: 2 };
const desktop = computeLcdLayout({ ...GRID, frame: 2, availW: 636, availH: 459, dpr: 1 });
const phone = computeLcdLayout({ ...GRID, frame: 2, availW: 390, availH: 282, dpr: 3 });
const tiny = computeLcdLayout({ ...GRID, frame: 2, availW: 180, availH: 130, dpr: 1 });

const inside = (r: Rect, o: Rect): boolean =>
  r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const ints = (r: Rect): boolean => [r.x, r.y, r.w, r.h].every(Number.isInteger);

describe("barsLayout", () => {
  const bl = barsLayout(desktop, GRID);

  it("puts a band in the frame on each side of the board (1366x768: dot 4, pitch 17)", () => {
    expect(bl.bars.U.band).toEqual({ x: 34, y: 34, w: 543, h: 33 });
    expect(bl.bars.D.band).toEqual({ x: 34, y: 408, w: 543, h: 33 });
    expect(bl.bars.L.band).toEqual({ x: 0, y: 68, w: 33, h: 339 });
    expect(bl.bars.R.band).toEqual({ x: 578, y: 68, w: 33, h: 339 });
    expect(bl.corner).toEqual({ x: 578, y: 408, w: 33, h: 33 });
    expect(bl.unit).toBe(3);
    expect(bl.glyphUnit).toBe(2);
  });

  it("keeps everything inside the canvas at every size", () => {
    for (const l of [desktop, phone, tiny]) {
      const b = barsLayout(l, GRID);
      const canvas = { x: 0, y: 0, w: l.widthDev, h: l.heightDev };
      for (const bar of Object.values(b.bars)) {
        expect(inside(bar.band, canvas)).toBe(true);
        expect(inside(trackRect(bar, b.dot), bar.band)).toBe(true);
        expect(ints(trackRect(bar, b.dot))).toBe(true);
      }
      expect(inside(b.corner, canvas)).toBe(true);
    }
  });

  it("tracks hug the board edge", () => {
    expect(trackRect(bl.bars.U, 4)).toEqual({ x: 34, y: 34 + 33 - 8, w: 543, h: 4 });
    expect(trackRect(bl.bars.D, 4)).toEqual({ x: 34, y: 408 + 4, w: 543, h: 4 });
    expect(trackRect(bl.bars.L, 4)).toEqual({ x: 25, y: 68, w: 4, h: 339 });
    expect(trackRect(bl.bars.R, 4)).toEqual({ x: 582, y: 68, w: 4, h: 339 });
  });
});

describe("fillRect", () => {
  const bl = barsLayout(desktop, GRID);
  const bar = bl.bars.U;

  it("is proportional to the share of live votes, centred", () => {
    const lens = [0, 1, 2, 3].map((n) => fillRect(bar, 4, n, 3, false).w);
    expect(lens).toEqual([0, 181, 362, 543]);
    const half = fillRect(bar, 4, 1, 3, false);
    expect(half.x - bar.band.x).toBe(Math.floor((543 - 181) / 2));
    expect(fillRect(bar, 4, 0, 0, false).w).toBe(0);
  });

  it("the winner thickens by one dot, outward", () => {
    const thin = fillRect(bar, 4, 2, 3, false);
    const wide = fillRect(bar, 4, 2, 3, true);
    expect(wide.h).toBe(thin.h + 4);
    expect(wide.y + wide.h).toBe(thin.y + thin.h);
    const side = fillRect(bl.bars.R, 4, 1, 1, true);
    expect(side).toMatchObject({ x: 582, w: 8, h: 339 });
  });
});

describe("barSlots", () => {
  const check = (bl: BarsLayout) => {
    for (const bar of Object.values(bl.bars)) {
      const glyph = glyphAt(bar, bl);
      expect(inside(glyph, bar.band)).toBe(true);
      for (let n = 1; n <= 4; n++) {
        const ids = ["p1", "p2", "p3", "p4"].slice(0, n);
        const { slots, more, unit } = barSlots(bar, bl, ids);
        expect(more).toBeNull();
        expect(slots.map((s) => s.id)).toEqual(ids);
        const rects = slots.map((s) => ({ x: s.x, y: s.y, w: 7 * unit, h: 7 * unit }));
        for (const r of rects) {
          expect(inside(r, bar.band)).toBe(true);
          expect(ints(r)).toBe(true);
          expect(overlap(r, glyph)).toBe(false);
        }
        const [first, ...rest] = rects;
        if (!first) throw new Error("no slots");
        let last = first;
        for (const b of rest) {
          expect(overlap(last, b)).toBe(false);
          // 1 unit apart along the bar.
          expect(b.x - last.x + (b.y - last.y)).toBe(8 * unit);
          last = b;
        }
        // Centred on the bar's midpoint (within a device px).
        const horizontal = bar.dir === "U" || bar.dir === "D";
        const lo = horizontal ? first.x - bar.band.x : first.y - bar.band.y;
        const hi = horizontal
          ? bar.band.x + bar.band.w - (last.x + last.w)
          : bar.band.y + bar.band.h - (last.y + last.h);
        expect(Math.abs(lo - hi)).toBeLessThanOrEqual(1);
      }
    }
  };

  it("lines up 1-4 agreeing seats without overlap at 1366, 390@3 and a tiny screen", () => {
    check(barsLayout(desktop, GRID));
    check(barsLayout(phone, GRID));
    check(barsLayout(tiny, GRID));
  });

  it("turns the last slot into +N when the row outgrows the bar", () => {
    const bl = barsLayout(desktop, GRID);
    const ids = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const { slots, more } = barSlots(bl.bars.L, bl, ids);
    expect(more).not.toBeNull();
    expect(slots.length + (more?.n ?? 0)).toBe(24);
    expect(more?.n).toBeGreaterThan(1);
  });
});

describe("cornerSlots", () => {
  it("fits the nonsense voters along the corner's bottom edge", () => {
    const bl = barsLayout(desktop, GRID);
    const { slots, more, unit } = cornerSlots(bl, ["p1", "p2", "p3", "p4"]);
    expect(more).toBeNull();
    for (const s of slots) {
      expect(inside({ x: s.x, y: s.y, w: 7 * unit, h: 7 * unit }, bl.corner)).toBe(true);
    }
    const crowd = cornerSlots(
      bl,
      Array.from({ length: 9 }, (_, i) => `p${i}`),
    );
    expect(crowd.slots.length + (crowd.more?.n ?? 0)).toBe(9);
  });
});

describe("tween", () => {
  it("hits its endpoints, eases out and clamps", () => {
    expect(tween(10, 20, 0)).toBe(10);
    expect(tween(10, 20, 1)).toBe(20);
    expect(tween(10, 20, 0.5)).toBe(17.5);
    expect(tween(10, 20, -1)).toBe(10);
    expect(tween(10, 20, 2)).toBe(20);
    expect(tween(10, 20, Number.NaN)).toBe(20);
  });
});
