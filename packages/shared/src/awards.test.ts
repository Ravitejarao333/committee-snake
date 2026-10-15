import { describe, expect, it } from "vitest";
import { pickAwards, pickCaption } from "./awards";
import type { Tally } from "./types";

const fatal: Tally = { counts: { U: 0, D: 0, L: 2, R: 0 }, nonsense: 0, winner: "L", winners: ["a", "b"] };

describe("pickAwards", () => {
  it("names the assassins and the prophet", () => {
    const awards = pickAwards(
      fatal,
      new Map(),
      new Map([
        ["a", "L"],
        ["b", "L"],
        ["c", "U"],
      ]),
    );
    expect(awards.find((x) => x.id === "assassin")?.players).toEqual(["a", "b"]);
    expect(awards.find((x) => x.id === "prophet")?.players).toEqual(["c"]);
  });

  it("returns at most three awards", () => {
    const stats = new Map([
      ["a", { votesCast: 10, votesWon: 9, longestNapTicks: 0 }],
      ["b", { votesCast: 10, votesWon: 1, longestNapTicks: 30 }],
    ]);
    expect(pickAwards(fatal, stats, new Map([["c", "U"]])).length).toBeLessThanOrEqual(3);
  });
});

describe("pickCaption", () => {
  const first = () => 0;
  it("keys on how you died", () => {
    expect(pickCaption({ cause: "wall", length: 3, mode: "democracy", chasingBonus: false }, first)).toBe(
      "Committee formed. Committee dissolved.",
    );
    expect(pickCaption({ cause: "self", length: 30, mode: "democracy", chasingBonus: false }, first)).toMatch(
      /worst enemy/,
    );
    expect(pickCaption({ cause: "wall", length: 30, mode: "democracy", chasingBonus: true }, first)).toBe(
      "Greed. Always greed.",
    );
    expect(pickCaption({ cause: "wall", length: 30, mode: "chaos", chasingBonus: false }, first)).toMatch(
      /Nobody wanted this/,
    );
  });
});
