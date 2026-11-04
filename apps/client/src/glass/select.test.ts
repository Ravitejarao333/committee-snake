import { mulberry32 } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { REVEALS } from "./reveals";
import { MAX_PANE, nextPaneSeed, paneFromHash, revealFor, revealIndex } from "./select";

describe("reveals", () => {
  it("has 60 unique lines: 20 fortunes, 20 tips, 16 memos, 4 prizes", () => {
    expect(REVEALS).toHaveLength(60);
    expect(new Set(REVEALS.map((r) => r.text)).size).toBe(60);
    const count = (k: string): number => REVEALS.filter((r) => r.kind === k).length;
    expect([count("fortune"), count("tip"), count("memo"), count("prize")]).toEqual([
      20, 20, 16, 4,
    ]);
  });

  it("keeps every line to 44 characters, trimmed", () => {
    for (const r of REVEALS) {
      expect(r.text.length, r.text).toBeLessThanOrEqual(44);
      expect(r.text).toBe(r.text.trim());
    }
  });
});

describe("pane selection", () => {
  it("gives the same reveal for the same pane", () => {
    expect(revealFor(1234)).toEqual(revealFor(1234));
    expect(revealIndex(1234)).toBe(revealIndex(1234));
  });

  it("reaches every reveal across panes 1..9999", () => {
    const seen = new Set<number>();
    for (let s = 1; s <= MAX_PANE; s++) seen.add(revealIndex(s));
    expect(seen.size).toBe(REVEALS.length);
  });

  it("never repeats one of the last 10 reveals", () => {
    const rng = mulberry32(7);
    const recent: number[] = [];
    for (let i = 0; i < 500; i++) {
      const seed = nextPaneSeed(rng, recent);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(MAX_PANE);
      const idx = revealIndex(seed);
      expect(recent.slice(-10)).not.toContain(idx);
      recent.push(idx);
    }
  });

  it("reads a pane number from the hash", () => {
    expect(paneFromHash("#1234")).toBe(1234);
    expect(paneFromHash("#1")).toBe(1);
    for (const h of ["", "#", "#0", "#10000", "#12a", "#-3", "1234"])
      expect(paneFromHash(h)).toBeNull();
  });
});
