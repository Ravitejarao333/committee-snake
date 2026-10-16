import { describe, expect, it } from "vitest";
import { avatarBits } from "./identity";

/** Reverse the 7 low bits of a row mask (mirror it left-right). */
const mirror = (m: number): number => {
  let out = 0;
  for (let c = 0; c < 7; c++) if (m & (1 << c)) out |= 1 << (6 - c);
  return out;
};

const ids = Array.from({ length: 500 }, (_, i) => (i % 2 === 0 ? `p${i}` : `player_${i * 31}`));

describe("avatarBits", () => {
  it("is deterministic", () => {
    expect(avatarBits("p1")).toEqual(avatarBits("p1"));
    expect(avatarBits("rahul")).toEqual(avatarBits("rahul"));
  });

  it("has 7 rows, each a 7-bit mask", () => {
    for (const id of ids) {
      const rows = avatarBits(id);
      expect(rows).toHaveLength(7);
      for (const m of rows) {
        expect(Number.isInteger(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThan(128);
      }
    }
  });

  it("is left-right symmetric", () => {
    for (const id of ids) for (const m of avatarBits(id)) expect(mirror(m)).toBe(m);
  });

  it("gives the four hot-seat ids distinct avatars", () => {
    const seen = new Set(["p1", "p2", "p3", "p4"].map((id) => avatarBits(id).join(",")));
    expect(seen.size).toBe(4);
  });

  it("is never blank and never fully lit", () => {
    for (const id of ["", ...ids]) {
      const rows = avatarBits(id);
      expect(rows.some((m) => m !== 0)).toBe(true);
      expect(rows.some((m) => m !== 127)).toBe(true);
    }
  });
});
