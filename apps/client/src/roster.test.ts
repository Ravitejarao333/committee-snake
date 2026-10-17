import { pushVote, type VoteQueue } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { keyVoters, rosterEntries } from "./roster";
import { claim, type Seats } from "./seats";

const seats: Seats = [0, 1, 2, 3].reduce<Seats>((s, i) => claim(s, i as 0 | 1 | 2 | 3, 0), []);

describe("roster", () => {
  it("shows head and pending votes, and sleeps seats without a live vote", () => {
    let q: VoteQueue = pushVote(undefined, { dir: "U", at: 0 });
    q = pushVote(q, { dir: "L", at: 10 });
    const votes = new Map([["p1", q]]);
    const live = new Map([["p1", "U" as const]]);
    const r = rosterEntries(seats, votes, live);
    expect(r[0]).toEqual({ id: "p1", name: "ARROWS", head: "U", pending: "L", asleep: false });
    expect(r[1]).toEqual({ id: "p2", name: "WASD", head: null, pending: null, asleep: true });
    expect(r).toHaveLength(4);
  });

  it("puts each seat's dot on its live key, in seat order, capped", () => {
    const live = new Map([
      ["p3", "U" as const],
      ["p1", "U" as const],
      ["p2", "D" as const],
    ]);
    expect(keyVoters(seats, live)).toEqual({ U: ["p1", "p3"], D: ["p2"], L: [], R: [] });
    expect(keyVoters(seats, live, 1).U).toEqual(["p1"]);
  });
});
