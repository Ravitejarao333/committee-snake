import {
  createGame,
  expireVotes,
  mulberry32,
  nextTickDelayMs,
  type PlayerId,
  pushVote,
  step,
  type VoteQueue,
} from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { runDueTicks } from "./scheduler";

const FRAME = 1000 / 60;

/** A solo round wired the way game.ts does it: keydown writes the map, the tick reads it. */
function solo() {
  const rng = mulberry32(1);
  let state = createGame(rng);
  const votes = new Map<PlayerId, VoteQueue>();
  return {
    press: (dir: "U" | "D", at: number) => votes.set("me", pushVote(votes.get("me"), { dir, at })),
    frame(nextAt: number, now: number) {
      return runDueTicks(nextAt, now, () => {
        state = step(state, expireVotes(votes, now).live, rng).state;
        return nextTickDelayMs(state);
      });
    },
    get state() {
      return state;
    },
  };
}

/** A tick callback that always returns `delay`, counting its calls. */
function every(delay: number) {
  const c = {
    calls: 0,
    tick: (): number => {
      c.calls++;
      return delay;
    },
  };
  return c;
}

describe("runDueTicks", () => {
  it("does nothing before the tick is due", () => {
    const c = every(100);
    expect(runDueTicks(1000, 999, c.tick)).toBe(1000);
    expect(c.calls).toBe(0);
  });

  it("a press in the last 16 ms before a tick counts for that tick", () => {
    const g = solo();
    const nextAt = 1000;
    // The frame just before the tick is due: no tick yet.
    expect(g.frame(nextAt, nextAt - FRAME + 1)).toBe(nextAt);
    g.press("U", nextAt - 1);
    // The first frame at or after the due time runs the tick with that press.
    g.frame(nextAt, nextAt + FRAME - 1);
    expect(g.state.dir).toBe("U");
  });

  it("a press stamped after the frame's rAF time (same frame) still counts", () => {
    const g = solo();
    // keydown runs before rAF callbacks, but performance.now() there can exceed the rAF stamp.
    g.press("D", 1003);
    g.frame(1000, 1000);
    expect(g.state.dir).toBe("D");
  });

  it("keeps a fixed step and catches up at most `max` ticks per frame", () => {
    const c = every(100);
    expect(runDueTicks(0, 1000 - 1, c.tick, 3)).toBe(300);
    expect(c.calls).toBe(3);
  });

  it("stops when the round ends", () => {
    let n = 0;
    expect(runDueTicks(0, 500, () => (n++ === 0 ? 100 : null))).toBe(100);
    expect(n).toBe(2);
  });

  it("resyncs after a long stall instead of fast-forwarding", () => {
    const c = every(100);
    expect(runDueTicks(0, 5_000, c.tick)).toBe(5_100);
    expect(c.calls).toBe(1);
  });
});
