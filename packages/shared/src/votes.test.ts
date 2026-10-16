import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";
import { createGame, step } from "./sim";
import type { Dir, GameState, PlayerId, VoteQueue } from "./types";
import { expireVotes, pushVote, settleVotes } from "./votes";

const q = (head: Dir, at = 0, pending: Dir | null = null, stale = false): VoteQueue => ({
  head: { dir: head, at },
  pending: pending ? { dir: pending, at } : null,
  stale,
});
const queues = (entries: [PlayerId, VoteQueue][]) => new Map<PlayerId, VoteQueue>(entries);
const dirs = (v: VoteQueue): [Dir, Dir | null] => [v.head.dir, v.pending?.dir ?? null];

/** Press `presses` (all inside one tick), then run `ticks` ticks the way a room does. */
function play(start: GameState, presses: Dir[], ticks: number, others = new Map<PlayerId, Dir>()) {
  const rng = mulberry32(1);
  let votes = new Map<PlayerId, VoteQueue>();
  for (const [p, d] of others) votes.set(p, pushVote(undefined, { dir: d, at: 0 }));
  let me: VoteQueue | undefined;
  for (const [i, d] of presses.entries()) me = pushVote(me, { dir: d, at: 10 + i });
  if (me) votes.set("me", me);
  let state = start;
  const turns: Dir[] = [];
  for (let t = 0; t < ticks; t++) {
    const { live } = expireVotes(votes, 100 + t);
    state = step(state, live, rng).state;
    turns.push(state.dir);
    votes = settleVotes(votes, state.dir);
  }
  return { state, turns, votes };
}

/** Heading right, `x` cells from the left wall on row 10. */
const headingRight = (x: number): GameState => ({
  ...createGame(mulberry32(1)),
  snake: [
    [x, 10],
    [x - 1, 10],
    [x - 2, 10],
  ],
  food: [0, 0],
});

describe("vote queue (ADR 0007)", () => {
  it("Up then Left inside one tick turns Up, then Left, on consecutive ticks", () => {
    expect(play(headingRight(16), ["U", "L"], 3).turns).toEqual(["U", "L", "L"]);
  });

  it("works the same when the standing vote is the current direction", () => {
    let me = pushVote(undefined, { dir: "R", at: 0 });
    me = settleVotes(queues([["me", me]]), "R").get("me") ?? me;
    expect(me.stale).toBe(true);
    me = pushVote(me, { dir: "U", at: 10 });
    me = pushVote(me, { dir: "L", at: 11 });
    expect(dirs(me)).toEqual(["U", "L"]);
  });

  it("Down then Left at the right wall is a U-turn that survives", () => {
    const { state, turns } = play(headingRight(31), ["D", "L"], 2);
    expect(turns).toEqual(["D", "L"]);
    expect(state.alive).toBe(true);
    expect(state.snake[0]).toEqual([30, 11]);
    // With a single standing vote the Down is lost and Left is a reverse: straight into the wall.
    expect(play(headingRight(31), ["L"], 1).state.cause).toBe("wall");
  });

  it("a third press replaces the pending entry", () => {
    let me = pushVote(undefined, { dir: "U", at: 0 });
    me = pushVote(me, { dir: "L", at: 1 });
    me = pushVote(me, { dir: "R", at: 2 });
    expect(dirs(me)).toEqual(["U", "R"]);
  });

  it("pressing the tail again only refreshes its timestamp", () => {
    const one = pushVote(q("U", 0), { dir: "U", at: 50 });
    expect(one).toEqual(q("U", 50));
    const two = pushVote(q("U", 0, "L"), { dir: "L", at: 50 });
    expect(dirs(two)).toEqual(["U", "L"]);
    expect(two.pending?.at).toBe(50);
    expect(two.head.at).toBe(0);
  });

  it("pressing the head again cancels the pending entry", () => {
    expect(dirs(pushVote(q("U", 0, "L"), { dir: "U", at: 5 }))).toEqual(["U", null]);
  });

  it("a press after expiry starts a fresh queue", () => {
    expect(pushVote(q("U", 0, "L"), { dir: "D", at: 4_000 })).toEqual(q("D", 4_000));
  });

  it("drops a pending entry that became the reverse of the direction taken", () => {
    // Heading right; the head U lost to R and the pending L is now a reverse: it can never win.
    const out = settleVotes(queues([["p", q("U", 0, "L")]]), "R").get("p");
    expect(out && dirs(out)).toEqual(["U", null]);
  });

  it("keeps the dropped entry's timestamp for expiry", () => {
    const v: VoteQueue = {
      head: { dir: "U", at: 0 },
      pending: { dir: "L", at: 3_000 },
      stale: false,
    };
    const settled = settleVotes(queues([["p", v]]), "R");
    expect(expireVotes(settled, 3_999).live.get("p")).toBe("U");
  });

  it("a player whose head lost keeps both entries", () => {
    const others = new Map<PlayerId, Dir>([
      ["a", "R"],
      ["b", "R"],
    ]);
    const { turns, votes } = play(headingRight(10), ["U", "D"], 1, others);
    expect(turns).toEqual(["R"]);
    const me = votes.get("me");
    expect(me && dirs(me)).toEqual(["U", "D"]);
    expect(me?.stale).toBe(false);
  });

  it("a reverse head gives way to the pending entry", () => {
    // Heading right: Left (nonsense) then Down. Left can't win, so Down goes live next tick.
    expect(play(headingRight(10), ["L", "D"], 2).turns).toEqual(["R", "D"]);
  });

  it("a winning head with nothing pending stays as a stale standing vote", () => {
    const out = settleVotes(queues([["p", q("U")]]), "U").get("p");
    expect(out).toEqual(q("U", 0, null, true));
    expect(expireVotes(queues([["p", q("U", 0, null, true)]]), 1).live.get("p")).toBe("U");
  });

  it("settleVotes does not mutate its input", () => {
    const votes = queues([["p", q("U", 0, "L")]]);
    const before = JSON.stringify([...votes]);
    settleVotes(votes, "U");
    expect(JSON.stringify([...votes])).toBe(before);
  });
});

describe("expireVotes", () => {
  it("returns empty collections for an empty map", () => {
    const { live, napping } = expireVotes(new Map(), 10_000);
    expect(live.size).toBe(0);
    expect(napping.size).toBe(0);
  });

  it("maps each live player to the head of their queue", () => {
    const votes = queues([
      ["a", q("U", 0, "L")],
      ["b", q("R", 0)],
    ]);
    expect([...expireVotes(votes, 100).live]).toEqual([
      ["a", "U"],
      ["b", "R"],
    ]);
  });

  it("expires exactly at 4000 ms: 3999 live, 4000 napping", () => {
    const votes = queues([["p", q("D", 0)]]);
    expect(expireVotes(votes, 3_999).live.get("p")).toBe("D");
    const later = expireVotes(votes, 4_000);
    expect(later.live.has("p")).toBe(false);
    expect(later.napping.has("p")).toBe(true);
  });

  it("runs the expiry clock from the most recent press in the queue", () => {
    const v: VoteQueue = {
      head: { dir: "U", at: 0 },
      pending: { dir: "L", at: 3_000 },
      stale: false,
    };
    const votes = queues([["p", v]]);
    expect(expireVotes(votes, 6_999).live.get("p")).toBe("U");
    expect(expireVotes(votes, 7_000).napping.has("p")).toBe(true);
  });

  it("honours a custom ttl", () => {
    const votes = queues([["p", q("U", 0)]]);
    expect(expireVotes(votes, 999, 1_000).live.has("p")).toBe(true);
    expect(expireVotes(votes, 1_000, 1_000).napping.has("p")).toBe(true);
  });

  it("treats a vote stamped in the future as live", () => {
    expect(expireVotes(queues([["p", q("L", 5_000)]]), 1_000).live.get("p")).toBe("L");
  });

  it("puts exactly the expired players in napping", () => {
    const votes = queues([
      ["fresh", q("U", 9_000)],
      ["old", q("D", 1_000)],
      ["older", q("R", 0)],
    ]);
    const { live, napping } = expireVotes(votes, 10_000);
    expect([...napping].sort()).toEqual(["old", "older"]);
    expect([...live.keys()]).toEqual(["fresh"]);
  });

  it("does not mutate its input", () => {
    const votes = queues([
      ["a", q("U", 0)],
      ["b", q("D", 9_000, "L")],
    ]);
    const before = JSON.stringify([...votes]);
    const result = expireVotes(votes, 10_000);
    expect(JSON.stringify([...votes])).toBe(before);
    expect(result.live).not.toBe(votes);
  });
});
