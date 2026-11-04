import { avatarBits } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { AVATAR_SIZE, avatarBitmap, avatarPath } from "./avatar";

describe("avatar", () => {
  it("turns row masks into a 7x7 bitmap, bit 6 on the left", () => {
    const b = avatarBitmap([0b1000000, 0b0000001, 0b1111111, 0, 0, 0, 0b0010100]);
    expect(b).toEqual([
      "#......",
      "......#",
      "#######",
      ".......",
      ".......",
      ".......",
      "..#.#..",
    ]);
  });

  it("matches the shared avatar for every seat", () => {
    for (const id of ["p1", "p2", "p3", "p4"]) {
      const b = avatarBitmap(avatarBits(id));
      expect(b).toHaveLength(AVATAR_SIZE);
      for (const row of b) expect(row).toMatch(/^[#.]{7}$/);
    }
  });

  it("emits one integer rect per run of lit dots", () => {
    expect(avatarPath([0b1100011, 0, 0, 0, 0, 0, 0])).toBe("M0 0h2v1H0zM5 0h2v1H5z");
    expect(avatarPath([0, 0, 0, 0, 0, 0, 0])).toBe("");
  });
});
