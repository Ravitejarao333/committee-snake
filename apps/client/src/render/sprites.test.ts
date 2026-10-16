import { describe, expect, it } from "vitest";
import {
  type Bitmap,
  BODY_A,
  BODY_B,
  CORNER,
  CRITTER,
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
  it("cell sprites are 4x4 and well-formed", () => {
    for (const b of [BODY_A, BODY_B, CORNER, TAIL, HEAD, HEAD_OPEN, FOOD]) {
      expect(shape(b)).toEqual([4, 4]);
      expect(valid(b)).toBe(true);
    }
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

  it("rotate turns clockwise", () => {
    expect(rotate(["#...", "....", "....", "...."], "D")).toEqual(["...#", "....", "....", "...."]);
  });
});
