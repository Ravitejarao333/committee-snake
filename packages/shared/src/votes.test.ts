import { describe, expect, it } from "vitest";
import type { PlayerId, StampedVote } from "./types";
import { expireVotes } from "./votes";

const stamped = (entries: [PlayerId, StampedVote][]) => new Map<PlayerId, StampedVote>(entries);

describe("expireVotes", () => {
  it("returns empty collections for an empty map", () => {
    const { live, napping } = expireVotes(new Map(), 10_000);
    expect(live.size).toBe(0);
    expect(napping.size).toBe(0);
  });

  it("keeps every fresh vote live", () => {
    const votes = stamped([
      ["a", { dir: "U", at: 1_000 }],
      ["b", { dir: "L", at: 2_000 }],
    ]);
    const { live, napping } = expireVotes(votes, 3_000);
    expect(live.size).toBe(2);
    expect(napping.size).toBe(0);
  });

  it("maps each live player to their direction", () => {
    const votes = stamped([
      ["a", { dir: "U", at: 0 }],
      ["b", { dir: "R", at: 0 }],
    ]);
    expect([...expireVotes(votes, 100).live]).toEqual([
      ["a", "U"],
      ["b", "R"],
    ]);
  });

  it("expires exactly at 4000 ms: 3999 live, 4000 napping", () => {
    const votes = stamped([["p", { dir: "D", at: 0 }]]);
    expect(expireVotes(votes, 3_999).live.get("p")).toBe("D");
    const later = expireVotes(votes, 4_000);
    expect(later.live.has("p")).toBe(false);
    expect(later.napping.has("p")).toBe(true);
  });

  it("honours a custom ttl", () => {
    const votes = stamped([["p", { dir: "U", at: 0 }]]);
    expect(expireVotes(votes, 999, 1_000).live.has("p")).toBe(true);
    expect(expireVotes(votes, 1_000, 1_000).napping.has("p")).toBe(true);
  });

  it("treats a vote stamped in the future as live", () => {
    const votes = stamped([["p", { dir: "L", at: 5_000 }]]);
    expect(expireVotes(votes, 1_000).live.get("p")).toBe("L");
  });

  it("puts exactly the expired players in napping", () => {
    const votes = stamped([
      ["fresh", { dir: "U", at: 9_000 }],
      ["old", { dir: "D", at: 1_000 }],
      ["older", { dir: "R", at: 0 }],
    ]);
    const { live, napping } = expireVotes(votes, 10_000);
    expect([...napping].sort()).toEqual(["old", "older"]);
    expect([...live.keys()]).toEqual(["fresh"]);
  });

  it("does not mutate its input", () => {
    const votes = stamped([
      ["a", { dir: "U", at: 0 }],
      ["b", { dir: "D", at: 9_000 }],
    ]);
    const before = JSON.stringify([...votes]);
    const result = expireVotes(votes, 10_000);
    expect(JSON.stringify([...votes])).toBe(before);
    expect(result.live).not.toBe(votes);
  });
});
