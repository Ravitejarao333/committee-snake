import {
  createGame,
  DEFAULT_RULES,
  DELTA,
  type Dir,
  type GameState,
  mulberry32,
  OPPOSITE,
  step,
} from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { choose } from "./autopilot";

function play(seed: number, ticks: number): { state: GameState; dirs: Dir[] } {
  const rng = mulberry32(seed);
  let state = createGame(rng);
  const dirs: Dir[] = [];
  for (let i = 0; i < ticks && state.alive; i++) {
    const d = choose(state, rng, DEFAULT_RULES);
    dirs.push(d);
    state = step(state, new Map([["bot", d]]), rng).state;
  }
  return { state, dirs };
}

describe("hub autopilot", () => {
  it("never votes the reverse of the current direction", () => {
    const rng = mulberry32(3);
    let state = createGame(rng);
    for (let i = 0; i < 100 && state.alive; i++) {
      const d = choose(state, rng, DEFAULT_RULES);
      expect(d).not.toBe(OPPOSITE[state.dir]);
      state = step(state, new Map([["bot", d]]), rng).state;
    }
  });

  it("eats food and survives a demo-length round on several seeds", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state } = play(seed, 150);
      expect(state.eaten).toBeGreaterThanOrEqual(5);
    }
  });

  it("steers away from a wall it is about to hit", () => {
    const rng = mulberry32(1);
    const base = createGame(rng);
    const [dx] = DELTA.R;
    // Head on the right wall, heading right: going straight is fatal.
    const state: GameState = {
      ...base,
      dir: "R",
      snake: [
        [31, 10],
        [31 - dx, 10],
        [31 - 2 * dx, 10],
      ],
      food: [0, 0],
    };
    expect(["U", "D"]).toContain(choose(state, rng, DEFAULT_RULES));
  });

  it("keeps a small preview board going for a while", () => {
    const rules = { ...DEFAULT_RULES, width: 16, height: 10 };
    const rng = mulberry32(1);
    let state = createGame(rng, rules);
    for (let i = 0; i < 60 && state.alive; i++) {
      state = step(state, new Map([["bot", choose(state, rng, rules)]]), rng, rules).state;
    }
    expect(state.tick).toBeGreaterThanOrEqual(30);
    expect(state.eaten).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic for a seed", () => {
    expect(play(9, 80).dirs).toEqual(play(9, 80).dirs);
  });
});
