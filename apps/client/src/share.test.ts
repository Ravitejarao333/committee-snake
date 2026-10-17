import { describe, expect, it } from "vitest";
import { SHARE_H, SHARE_W, shareLayout } from "./share";

describe("shareLayout", () => {
  const chars = "committee-snake · localhost:5173".length;
  const s = shareLayout(SHARE_W, SHARE_H, chars);

  it("splits 1200x630 into the blame area and a 70 px footer that never overlap", () => {
    expect(s.footer).toEqual({ x: 0, y: 560, w: 1200, h: 70 });
    expect(s.area.y + s.area.h).toBeLessThanOrEqual(s.footer.y);
    expect(s.area.x).toBeGreaterThanOrEqual(0);
    expect(s.area.x + s.area.w).toBeLessThanOrEqual(1200);
  });

  it("uses whole pixels, an integer glyph scale and an 8-multiple font", () => {
    const all = [
      ...Object.values(s.area),
      ...Object.values(s.footer),
      ...Object.values(s.glyph),
      ...Object.values(s.text),
    ];
    expect(all.every(Number.isInteger)).toBe(true);
    expect(s.glyph.unit).toBeGreaterThanOrEqual(1);
    expect(s.text.size % 8).toBe(0);
  });

  it("centres the glyph and text in the footer", () => {
    const left = s.glyph.x;
    const right = SHARE_W - (s.text.x + chars * s.text.size);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(s.glyph.y).toBeGreaterThanOrEqual(s.footer.y);
    expect(s.glyph.y + 8 * s.glyph.unit).toBeLessThanOrEqual(SHARE_H);
    expect(s.text.y + s.text.size).toBeLessThanOrEqual(SHARE_H);
  });

  it("shrinks the footer text for a long host, never below 8 px", () => {
    expect(shareLayout(SHARE_W, SHARE_H, 100).text.size).toBe(8);
    expect(shareLayout(SHARE_W, SHARE_H, 10).text.size).toBe(16);
  });
});
