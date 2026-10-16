import { describe, expect, it } from "vitest";
import {
  type Bitmap,
  BODY_A,
  BODY_B,
  CORNER,
  CRITTER,
  cellSprite,
  DIGITS,
  FOOD,
  HEAD,
  HEAD_OPEN,
  rotate,
  TAIL,
} from "./sprites";

const shape = (b: Bitmap): [number, number] => [b[0]?.length ?? 0, b.length];
const valid = (b: Bitmap): boolean =>
  b.every((r) => /^[#.]+$/.test(r) && r.length === b[0]?.length);

describe("sprites", () => {
  it("snake cores are 3x3 and food is 4x4, all well-formed", () => {
    for (const b of [BODY_A, BODY_B, CORNER, TAIL, HEAD, HEAD_OPEN]) {
      expect(shape(b)).toEqual([3, 3]);
      expect(valid(b)).toBe(true);
    }
    expect(shape(FOOD)).toEqual([4, 4]);
    expect(valid(FOOD)).toBe(true);
  });

  it("body and head are 3 dots thick", () => {
    const thickness = (b: Bitmap, x: number) => b.filter((r) => r[x] === "#").length;
    expect(thickness(BODY_A, 0)).toBe(3);
    expect(thickness(BODY_B, 0)).toBe(3);
    expect(thickness(HEAD, 0)).toBe(3);
    // The notch is kept: one dot missing on alternate edges.
    expect(thickness(BODY_A, 1)).toBe(2);
    expect(BODY_A[0]).not.toBe(BODY_B[0]);
  });

  it("cellSprite keeps the 1-dot gap except toward a linked neighbour", () => {
    expect(cellSprite(BODY_B, { right: false, down: false })).toEqual([
      "###.",
      "###.",
      "#.#.",
      "....",
    ]);
    const linked = cellSprite(BODY_A, { right: true, down: true });
    expect(linked.map((r) => r[3]).join("")).toBe("###.");
    expect(linked[3]).toBe("###.");
  });

  it("critter is 4x4 and digits are 3x5, 0-9", () => {
    expect(shape(CRITTER)).toEqual([4, 4]);
    expect(DIGITS).toHaveLength(10);
    for (const d of DIGITS) {
      expect(shape(d)).toEqual([3, 5]);
      expect(valid(d)).toBe(true);
    }
    expect(new Set(DIGITS.map((d) => d.join("|"))).size).toBe(10);
  });

  it("the head has an unlit eye and differs from the open mouth", () => {
    expect(HEAD[1]?.[1]).toBe(".");
    expect(HEAD_OPEN.join()).not.toBe(HEAD.join());
    expect(BODY_A.join()).not.toBe(BODY_B.join());
  });

  it("rotate: R is identity, four directions are distinct, D then U undoes", () => {
    expect(rotate(HEAD, "R")).toEqual(HEAD);
    const all = (["R", "D", "L", "U"] as const).map((d) => rotate(HEAD, d).join("|"));
    expect(new Set(all).size).toBe(4);
    expect(rotate(rotate(HEAD, "D"), "U")).toEqual(HEAD);
    expect(rotate(rotate(HEAD, "D"), "D")).toEqual(rotate(HEAD, "L"));
  });

  it("a rotated core stays 3x3: vertical body is 3 wide, head nose follows its direction", () => {
    expect(rotate(BODY_A, "D")).toEqual(["###", "##.", "###"]);
    expect(shape(rotate(HEAD, "U"))).toEqual([3, 3]);
    expect(rotate(HEAD, "D")[2]).toBe(".#.");
    expect(rotate(HEAD, "U")[0]).toBe(".#.");
  });

  it("rotate turns clockwise", () => {
    expect(rotate(["#...", "....", "....", "...."], "D")).toEqual(["...#", "....", "....", "...."]);
  });
});
