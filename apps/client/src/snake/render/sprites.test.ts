import { describe, expect, it } from "vitest";
import { type BoardView, segmentSprite } from "./snake";
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
  SNAKE_STYLE,
  TAIL,
  THICK,
} from "./sprites";

const shape = (b: Bitmap): [number, number] => [b[0]?.length ?? 0, b.length];
const valid = (b: Bitmap): boolean =>
  b.every((r) => /^[#.]+$/.test(r) && r.length === b[0]?.length);

/** Head at x=5, body running left: head, two straight segments, tail. */
const STRAIGHT: BoardView = {
  tick: 0,
  dir: "R",
  alive: true,
  food: [0, 0],
  bonus: null,
  snake: [
    [5, 3],
    [4, 3],
    [3, 3],
    [2, 3],
  ],
};

describe("classic sprites (the M1 2-dot snake)", () => {
  it("are the 129847b bitmaps, byte for byte", () => {
    expect(BODY_A).toEqual(["....", "##.#", "####", "...."]);
    expect(BODY_B).toEqual(["....", "####", "#.##", "...."]);
    expect(CORNER).toEqual(["....", "###.", "#.#.", ".##."]);
    expect(TAIL).toEqual(["....", "..##", "####", "...."]);
    expect(HEAD).toEqual(["###.", "#.##", "####", "###."]);
    expect(HEAD_OPEN).toEqual(["####", "#.#.", "##..", "####"]);
  });

  it("cell sprites are 4x4 and well-formed", () => {
    for (const b of [BODY_A, BODY_B, CORNER, TAIL, HEAD, HEAD_OPEN, FOOD]) {
      expect(shape(b)).toEqual([4, 4]);
      expect(valid(b)).toBe(true);
    }
  });

  it("is the default style, drawn as-is (no gap filling)", () => {
    expect(SNAKE_STYLE).toBe("classic");
    expect(segmentSprite(STRAIGHT, 0, false)).toEqual(HEAD);
    expect(segmentSprite(STRAIGHT, 0, true)).toEqual(HEAD_OPEN);
    expect(segmentSprite(STRAIGHT, 1, false)).toEqual(BODY_B);
    expect(segmentSprite(STRAIGHT, 2, false)).toEqual(BODY_A);
    expect(segmentSprite(STRAIGHT, 3, false)).toEqual(TAIL);
  });

  it("rotates corners and vertical runs", () => {
    const bend: BoardView = {
      ...STRAIGHT,
      dir: "U",
      snake: [
        [3, 1],
        [3, 2],
        [2, 2],
      ],
    };
    // Segment 1 joins up (head) and left (tail): CORNER rotated a half turn.
    expect(segmentSprite(bend, 1, false)).toEqual(rotate(CORNER, "D"));
    expect(segmentSprite(bend, 0, false)).toEqual(rotate(HEAD, "U"));
  });

  it("the head has an unlit eye and differs from the open mouth", () => {
    expect(HEAD[1]?.[1]).toBe(".");
    expect(HEAD_OPEN.join()).not.toBe(HEAD.join());
    expect(BODY_A.join()).not.toBe(BODY_B.join());
  });
});

describe("thick sprites", () => {
  const parts = [THICK.BODY_A, THICK.BODY_B, THICK.CORNER, THICK.TAIL, THICK.HEAD, THICK.HEAD_OPEN];

  it("cores are 3x3 and well-formed", () => {
    for (const b of parts) {
      expect(shape(b)).toEqual([3, 3]);
      expect(valid(b)).toBe(true);
    }
  });

  it("body and head are 3 dots thick, with the notch kept", () => {
    const thickness = (b: Bitmap, x: number) => b.filter((r) => r[x] === "#").length;
    expect(thickness(THICK.BODY_A, 0)).toBe(3);
    expect(thickness(THICK.BODY_B, 0)).toBe(3);
    expect(thickness(THICK.HEAD, 0)).toBe(3);
    expect(thickness(THICK.BODY_A, 1)).toBe(2);
    expect(THICK.BODY_A[0]).not.toBe(THICK.BODY_B[0]);
  });

  it("cellSprite keeps the 1-dot gap except toward a linked neighbour", () => {
    expect(cellSprite(THICK.BODY_B, { right: false, down: false })).toEqual([
      "###.",
      "###.",
      "#.#.",
      "....",
    ]);
    const linked = cellSprite(THICK.BODY_A, { right: true, down: true });
    expect(linked.map((r) => r[3]).join("")).toBe("###.");
    expect(linked[3]).toBe("###.");
  });

  it("segmentSprite in thick style links toward neighbours", () => {
    // The head links left to its neck, which the left neighbour fills: no gap fill here.
    expect(segmentSprite(STRAIGHT, 0, false, "thick")).toEqual(
      cellSprite(THICK.HEAD, { right: false, down: false }),
    );
    // A body segment links right toward the head.
    expect(segmentSprite(STRAIGHT, 2, false, "thick")).toEqual(
      cellSprite(THICK.BODY_A, { right: true, down: false }),
    );
  });

  it("a rotated core stays 3x3: vertical body is 3 wide, head nose follows its direction", () => {
    expect(rotate(THICK.BODY_A, "D")).toEqual(["###", "##.", "###"]);
    expect(shape(rotate(THICK.HEAD, "U"))).toEqual([3, 3]);
    expect(rotate(THICK.HEAD, "D")[2]).toBe(".#.");
    expect(rotate(THICK.HEAD, "U")[0]).toBe(".#.");
  });
});

describe("other sprites and rotate", () => {
  it("critter is 4x4 and digits are 3x5, 0-9", () => {
    expect(shape(CRITTER)).toEqual([4, 4]);
    expect(DIGITS).toHaveLength(10);
    for (const d of DIGITS) {
      expect(shape(d)).toEqual([3, 5]);
      expect(valid(d)).toBe(true);
    }
    expect(new Set(DIGITS.map((d) => d.join("|"))).size).toBe(10);
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
