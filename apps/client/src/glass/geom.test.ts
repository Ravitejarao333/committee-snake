import { describe, expect, it } from "vitest";
import { contains } from "./geom";

describe("contains", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it("finds points inside a polygon and rejects ones outside", () => {
    expect(contains(square, { x: 5, y: 5 })).toBe(true);
    expect(contains(square, { x: 11, y: 5 })).toBe(false);
    expect(contains(square, { x: 5, y: -1 })).toBe(false);
  });
  it("handles a concave polygon", () => {
    const ell = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(contains(ell, { x: 7, y: 7 })).toBe(false);
    expect(contains(ell, { x: 2, y: 7 })).toBe(true);
  });
});
