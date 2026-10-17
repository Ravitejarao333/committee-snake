import { describe, expect, it } from "vitest";
import { type PlayerRoundStats, pickAwards } from "./awards";
import { recordTick } from "./stats";
import type { Dir, PlayerId, Tally } from "./types";

type Stats = Map<PlayerId, PlayerRoundStats>;
type Tick = [live: Record<PlayerId, Dir>, taken: Dir];
const votes = (entries: Record<PlayerId, Dir>) => new Map(Object.entries(entries));

/** Run `recordTick` over a script of (live votes, direction taken) ticks. */
const play = (seats: PlayerId[], ticks: Tick[], from: Stats = new Map()) =>
  ticks.reduce<Stats>((s, [live, dir]) => recordTick(s, seats, votes(live), dir), from);

const repeat = (n: number, tick: Tick): Tick[] => Array.from({ length: n }, () => tick);

describe("recordTick", () => {
  it("counts votes cast and won", () => {
    const s = play(
      ["a", "b"],
      [
        [{ a: "U", b: "L" }, "U"],
        [{ a: "U", b: "L" }, "U"],
        [{ a: "R", b: "L" }, "L"],
      ],
    );
    expect(s.get("a")).toEqual({ votesCast: 3, votesWon: 2, longestNapTicks: 0, napTicks: 0 });
    expect(s.get("b")).toEqual({ votesCast: 3, votesWon: 1, longestNapTicks: 0, napTicks: 0 });
  });

  it("grows the nap streak while the seat has no live vote and resets it on a vote", () => {
    const s = play(
      ["a"],
      [[{ a: "U" }, "U"], ...repeat(3, [{}, "U"]), [{ a: "L" }, "L"], [{}, "L"]],
    );
    expect(s.get("a")).toEqual({ votesCast: 2, votesWon: 2, longestNapTicks: 3, napTicks: 1 });
  });

  it("keeps the longest streak, not the latest", () => {
    const s = play(
      ["a"],
      [[{ a: "U" }, "U"], ...repeat(2, [{}, "U"]), [{ a: "U" }, "U"], [{}, "U"], [{ a: "U" }, "U"]],
    );
    expect(s.get("a")?.longestNapTicks).toBe(2);
    expect(s.get("a")?.napTicks).toBe(0);
  });

  it("a seat that never voted accrues no nap", () => {
    const s = play(["a", "b"], repeat(20, [{ a: "U" }, "U"]));
    expect(s.get("b")).toEqual({ votesCast: 0, votesWon: 0, longestNapTicks: 0, napTicks: 0 });
  });

  it("a late joiner's ticks before their first vote don't count as napping", () => {
    // b is seated from the start but first presses on tick 15, then stays active.
    const s = play(
      ["a", "b"],
      [...repeat(15, [{ a: "U" }, "U"]), ...repeat(5, [{ a: "U", b: "U" }, "U"])],
    );
    expect(s.get("b")).toEqual({ votesCast: 5, votesWon: 5, longestNapTicks: 0, napTicks: 0 });

    const fatal: Tally = {
      counts: { U: 2, D: 0, L: 0, R: 0 },
      nonsense: 0,
      nonsenseBy: [],
      winner: "U",
      winners: ["a", "b"],
    };
    const awards = pickAwards(fatal, s, votes({ a: "U", b: "U" }));
    expect(awards.some((x) => x.id === "napper")).toBe(false);
  });

  it("does not mutate its input and carries over players who left their seat", () => {
    const before: Stats = new Map([
      ["a", { votesCast: 1, votesWon: 1, longestNapTicks: 0, napTicks: 0 }],
      ["gone", { votesCast: 4, votesWon: 1, longestNapTicks: 2, napTicks: 2 }],
    ]);
    const snapshot = structuredClone([...before]);
    const after = recordTick(before, ["a"], votes({}), "U");
    expect([...before]).toEqual(snapshot);
    expect(after).not.toBe(before);
    expect(after.get("a")).toEqual({ votesCast: 1, votesWon: 1, longestNapTicks: 1, napTicks: 1 });
    expect(after.get("gone")).toEqual(before.get("gone"));
  });
});
