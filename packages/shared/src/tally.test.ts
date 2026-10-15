import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";
import { tally } from "./tally";
import type { Dir, PlayerId } from "./types";

const votes = (entries: Record<PlayerId, Dir>) => new Map(Object.entries(entries));

describe("tally – democracy", () => {
  it("majority wins", () => {
    const t = tally(votes({ a: "U", b: "U", c: "L" }), "R", "democracy", mulberry32(1));
    expect(t.winner).toBe("U");
    expect(t.winners).toEqual(["a", "b"]);
    expect(t.counts).toEqual({ U: 2, D: 0, L: 1, R: 0 });
  });

  it("reverse votes never count and are reported as nonsense", () => {
    const t = tally(votes({ a: "L", b: "L", c: "U" }), "R", "democracy", mulberry32(1));
    expect(t.winner).toBe("U");
    expect(t.nonsense).toBe(2);
    expect(t.counts.L).toBe(0);
  });

  it("keeps going straight with no votes", () => {
    const t = tally(new Map(), "D", "democracy", mulberry32(1));
    expect(t.winner).toBe("D");
    expect(t.winners).toEqual([]);
  });

  it("keeps going straight when only reverse votes exist", () => {
    const t = tally(votes({ a: "U" }), "D", "democracy", mulberry32(1));
    expect(t.winner).toBe("D");
  });

  it("tie including current direction → straight", () => {
    const t = tally(votes({ a: "U", b: "R" }), "R", "democracy", mulberry32(1));
    expect(t.winner).toBe("R");
  });

  it("tie excluding current direction → seeded RNG, deterministic", () => {
    const a = tally(votes({ a: "U", b: "D" }), "R", "democracy", mulberry32(99));
    const b = tally(votes({ a: "U", b: "D" }), "R", "democracy", mulberry32(99));
    expect(["U", "D"]).toContain(a.winner);
    expect(a.winner).toBe(b.winner);
  });
});

describe("tally – chaos", () => {
  it("least popular non-zero vote wins", () => {
    const t = tally(votes({ a: "U", b: "U", c: "U", d: "D" }), "R", "chaos", mulberry32(1));
    expect(t.winner).toBe("D");
    expect(t.winners).toEqual(["d"]);
  });

  it("ignores zero-vote directions", () => {
    const t = tally(votes({ a: "U", b: "U" }), "R", "chaos", mulberry32(1));
    expect(t.winner).toBe("U");
  });
});
