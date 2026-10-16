import { describe, expect, it } from "vitest";
import { computeLcdLayout } from "./layout";

const base = { cols: 32, rows: 20, hudRows: 2 };

describe("computeLcdLayout", () => {
  it("gives a 5px dot / 21px pitch at the 1366x768 slot", () => {
    const l = computeLcdLayout({ ...base, availW: 700, availH: 500, dpr: 1 });
    expect(l).toMatchObject({ dot: 5, gap: 1, pitch: 21, widthDev: 672, heightDev: 462 });
    expect(l.cssW).toBe(672);
    expect(l.cssH).toBe(462);
  });

  it("rounds the gap to whole device px and keeps the backing store integral", () => {
    const l = computeLcdLayout({ ...base, availW: 390, availH: 600, dpr: 3 });
    expect(l.gap).toBe(3);
    expect(l.pitch).toBe(4 * l.dot + 3);
    expect(l.widthDev).toBe(32 * l.pitch);
    expect(l.cssW * 3).toBe(l.widthDev);
    expect(l.widthDev).toBeLessThanOrEqual(390 * 3);
  });

  it("is limited by the tighter axis", () => {
    const wide = computeLcdLayout({ ...base, availW: 5000, availH: 220, dpr: 1 });
    expect(wide.heightDev).toBeLessThanOrEqual(220);
    const tall = computeLcdLayout({ ...base, availW: 330, availH: 5000, dpr: 1 });
    expect(tall.widthDev).toBeLessThanOrEqual(330);
  });

  it("never goes below a 1px dot, even for tiny or bogus input", () => {
    for (const availW of [0, 10, Number.NaN, -5]) {
      const l = computeLcdLayout({ ...base, availW, availH: 10, dpr: Number.NaN });
      expect(l.dot).toBe(1);
      expect(l.dpr).toBe(1);
    }
  });

  it("returns integers for all device-px values at fractional dpr", () => {
    const l = computeLcdLayout({ ...base, availW: 800, availH: 500, dpr: 1.25 });
    for (const v of [l.dot, l.gap, l.pitch, l.widthDev, l.heightDev]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
