import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";
import { bonusPoints, createGame, currentTps, step } from "./sim";
import { DEFAULT_RULES, type Dir, type GameState, type Rules } from "./types";

const none = new Map<string, Dir>();
const one = (d: Dir) => new Map([["p", d]]);

const run = (state: GameState, dirs: Dir[], rules: Rules = DEFAULT_RULES, seed = 1) => {
  const rng = mulberry32(seed);
  let s = state;
  for (const d of dirs) s = step(s, one(d), rng, rules).state;
  return s;
};

describe("createGame", () => {
  it("starts in the middle, length 3, heading right, food not on snake", () => {
    const g = createGame(mulberry32(1));
    expect(g.snake).toHaveLength(3);
    expect(g.dir).toBe("R");
    expect(g.snake[0]).toEqual([16, 10]);
    expect(g.snake.some((c) => c[0] === g.food[0] && c[1] === g.food[1])).toBe(false);
  });
});

describe("step – movement", () => {
  it("moves one cell per tick and keeps length", () => {
    const g = createGame(mulberry32(1));
    const { state, events } = step(g, none, mulberry32(1));
    expect(state.tick).toBe(1);
    expect(state.snake[0]).toEqual([17, 10]);
    expect(state.snake).toHaveLength(3);
    expect(events.find((e) => e.kind === "turn")).toBeUndefined();
  });

  it("turns toward the winning vote and emits a turn event", () => {
    const g = createGame(mulberry32(1));
    const { state, events } = step(g, one("U"), mulberry32(1));
    expect(state.dir).toBe("U");
    expect(state.snake[0]).toEqual([16, 9]);
    expect(events).toContainEqual({ kind: "turn", dir: "U" });
  });

  it("does nothing once dead", () => {
    const g = { ...createGame(mulberry32(1)), alive: false };
    expect(step(g, one("U"), mulberry32(1))).toEqual({ state: g, events: [] });
  });
});

describe("step – death", () => {
  it("dies on the wall with the fatal tally attached", () => {
    const g = createGame(mulberry32(1));
    let s = g;
    const rng = mulberry32(1);
    let death: ReturnType<typeof step>["events"][number] | undefined;
    for (let i = 0; i < 40 && !death; i++) {
      const r = step(s, one("R"), rng);
      s = r.state;
      death = r.events.find((e) => e.kind === "death");
    }
    expect(death).toMatchObject({ kind: "death", cause: "wall", fatalDir: "R" });
    expect(s.alive).toBe(false);
    expect(s.cause).toBe("wall");
    expect(s.snake[0]![0]).toBe(DEFAULT_RULES.width - 1);
  });

  it("wraps instead of dying when walls are off", () => {
    const rules = { ...DEFAULT_RULES, wrap: true };
    const s = run(createGame(mulberry32(1), rules), Array(20).fill("R"), rules);
    expect(s.alive).toBe(true);
    expect(s.snake[0]![0]).toBe((16 + 20) % rules.width);
  });

  it("dies when eating its own body", () => {
    // Grow to length 5 artificially, then loop back into itself.
    const g = createGame(mulberry32(1));
    const long: GameState = {
      ...g,
      snake: [
        [16, 10],
        [15, 10],
        [14, 10],
        [13, 10],
        [12, 10],
      ],
      food: [0, 0],
    };
    const s = run(long, ["U", "L", "D"]);
    expect(s.alive).toBe(false);
    expect(s.cause).toBe("self");
  });

  it("does not count the vacating tail as a collision", () => {
    const g = createGame(mulberry32(1));
    const square: GameState = {
      ...g,
      snake: [
        [16, 10],
        [16, 11],
        [15, 11],
        [15, 10],
      ],
      dir: "U",
      food: [0, 0],
    };
    // Head moves L onto [15,10], which is the tail and is vacated this tick.
    const r = step(square, one("L"), mulberry32(1));
    expect(r.state.alive).toBe(true);
  });
});

describe("step – food, growth, speed", () => {
  it("grows by one, scores, and respawns food off the snake", () => {
    const g: GameState = { ...createGame(mulberry32(1)), food: [17, 10] };
    const { state, events } = step(g, none, mulberry32(1));
    expect(state.snake).toHaveLength(4);
    expect(state.score).toBe(1);
    expect(state.eaten).toBe(1);
    expect(events).toContainEqual({ kind: "eat", cell: [17, 10], score: 1 });
    expect(state.snake.some((c) => c[0] === state.food[0] && c[1] === state.food[1])).toBe(false);
  });

  it("speed ramps +0.25 tps per 5 food and caps at 8", () => {
    const g = createGame(mulberry32(1));
    expect(currentTps(g)).toBe(3);
    expect(currentTps({ ...g, eaten: 4 })).toBe(3);
    expect(currentTps({ ...g, eaten: 5 })).toBe(3.25);
    expect(currentTps({ ...g, eaten: 500 })).toBe(8);
  });

  it("spawns a bonus on every 5th food, which expires after its ttl", () => {
    const g: GameState = { ...createGame(mulberry32(1)), food: [17, 10], eaten: 4 };
    const r = step(g, none, mulberry32(1));
    expect(r.state.bonus).not.toBeNull();
    expect(r.state.bonus?.ttl).toBe(DEFAULT_RULES.bonusTtl);
    expect(r.events.some((e) => e.kind === "bonus-spawn")).toBe(true);

    // Steer away from the bonus; after ttl ticks it is gone.
    const rules = { ...DEFAULT_RULES, wrap: true };
    let s = r.state;
    let expired = false;
    for (let i = 0; i < DEFAULT_RULES.bonusTtl + 1 && s.alive; i++) {
      const out = step(s, none, mulberry32(i), rules);
      s = out.state;
      if (out.events.some((e) => e.kind === "bonus-expire")) expired = true;
    }
    expect(expired || !s.alive).toBe(true);
  });

  it("bonus is worth 50 fresh, decaying to 5", () => {
    expect(bonusPoints(DEFAULT_RULES.bonusTtl)).toBe(50);
    expect(bonusPoints(1)).toBe(5);
    expect(bonusPoints(10)).toBe(25);
  });
});

describe("property: random committees", () => {
  it("never overlaps itself while alive, food never on snake, replay is deterministic", () => {
    const GAMES = 300;
    for (let seed = 1; seed <= GAMES; seed++) {
      const rngA = mulberry32(seed);
      const rngB = mulberry32(seed);
      const voteRng = mulberry32(seed * 7919);
      let a = createGame(mulberry32(seed));
      let b = createGame(mulberry32(seed));
      const dirs: Dir[] = ["U", "D", "L", "R"];
      for (let t = 0; t < 400 && a.alive; t++) {
        const votes = new Map<string, Dir>();
        const n = voteRng.int(6);
        for (let i = 0; i < n; i++) votes.set(`p${i}`, dirs[voteRng.int(4)] as Dir);
        a = step(a, votes, rngA).state;
        b = step(b, votes, rngB).state;
        if (a.alive) {
          const keys = a.snake.map(([x, y]) => `${x},${y}`);
          expect(new Set(keys).size).toBe(keys.length);
          expect(keys).not.toContain(`${a.food[0]},${a.food[1]}`);
        }
      }
      expect(a).toEqual(b);
    }
  });
});
