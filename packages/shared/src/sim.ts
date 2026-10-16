import type { Rng } from "./rng";
import { tally } from "./tally";
import {
  type Cell,
  DEFAULT_RULES,
  DELTA,
  type GameEvent,
  type GameState,
  type Rules,
  type VoteMap,
} from "./types";

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

const sameCell = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

/** Pick a random empty cell, not within `margin` cells of the head. */
export function spawnCell(
  state: Pick<GameState, "snake">,
  rules: Rules,
  rng: Rng,
  margin = 2,
): Cell {
  const head = state.snake[0];
  const occupied = new Set(state.snake.map(([x, y]) => y * rules.width + x));
  const free: Cell[] = [];
  for (let y = 0; y < rules.height; y++) {
    for (let x = 0; x < rules.width; x++) {
      if (occupied.has(y * rules.width + x)) continue;
      if (head && Math.abs(head[0] - x) <= margin && Math.abs(head[1] - y) <= margin) continue;
      free.push([x, y]);
    }
  }
  if (free.length === 0) {
    throw new Error("Board is full: the committee has won, somehow.");
  }
  return free[rng.int(free.length)] as Cell;
}

/** A fresh round: 3-segment snake in the middle, heading right. */
export function createGame(rng: Rng, rules: Rules = DEFAULT_RULES): GameState {
  const cx = Math.floor(rules.width / 2);
  const cy = Math.floor(rules.height / 2);
  const snake: Cell[] = [
    [cx, cy],
    [cx - 1, cy],
    [cx - 2, cy],
  ];
  const state: GameState = {
    tick: 0,
    snake,
    dir: "R",
    food: [0, 0],
    bonus: null,
    score: 0,
    eaten: 0,
    alive: true,
    cause: null,
  };
  state.food = spawnCell(state, rules, rng);
  return state;
}

/** Current speed in ticks per second, derived from food eaten. */
export function currentTps(state: GameState, rules: Rules = DEFAULT_RULES): number {
  const steps = Math.floor(state.eaten / rules.speedEvery);
  return Math.min(rules.maxTps, rules.baseTps + steps * rules.tpsStep);
}

/** Milliseconds until the next tick at the current speed (raw float, e.g. 333.33… at 3 tps). */
export function nextTickDelayMs(state: GameState, rules: Rules = DEFAULT_RULES): number {
  return 1000 / currentTps(state, rules);
}

/** Bonus value: 50 points if grabbed instantly, decaying to 5. */
export function bonusPoints(ttl: number, rules: Rules = DEFAULT_RULES): number {
  return Math.max(5, Math.round((ttl / rules.bonusTtl) * 50));
}

/**
 * Advance the game by exactly one tick. Pure: no clocks, no sockets, no
 * randomness except `rng`. Order matters and mirrors docs/PLAN.md §3.1.
 */
export function step(
  state: GameState,
  votes: VoteMap,
  rng: Rng,
  rules: Rules = DEFAULT_RULES,
): StepResult {
  if (!state.alive) return { state, events: [] };
  const events: GameEvent[] = [];

  // 1. Tally
  const t = tally(votes, state.dir, rules.mode, rng);
  const dir = t.winner;
  if (dir !== state.dir) events.push({ kind: "turn", dir });

  // 2. Move
  const head = state.snake[0] as Cell;
  const [dx, dy] = DELTA[dir];
  let nx = head[0] + dx;
  let ny = head[1] + dy;
  if (rules.wrap) {
    nx = (nx + rules.width) % rules.width;
    ny = (ny + rules.height) % rules.height;
  }
  const newHead: Cell = [nx, ny];

  // 3. Collision. The tail cell is vacated this tick unless we grow, so it is
  //    only a collision if we are about to eat.
  const eating = sameCell(newHead, state.food);
  const outOfBounds = nx < 0 || ny < 0 || nx >= rules.width || ny >= rules.height;
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const hitSelf = body.some((c) => sameCell(c, newHead));
  if (outOfBounds || hitSelf) {
    const cause = outOfBounds ? "wall" : "self";
    events.push({ kind: "death", cause, fatalDir: dir, tally: t });
    return {
      state: { ...state, tick: state.tick + 1, dir, alive: false, cause },
      events,
    };
  }

  const snake = [newHead, ...(eating ? state.snake : state.snake.slice(0, -1))];
  let { food, bonus, score, eaten } = state;
  let bonusSpawnedNow = false;

  // 4. Food
  if (eating) {
    eaten++;
    score += 1;
    events.push({ kind: "eat", cell: newHead, score });
    food = spawnCell({ snake }, rules, rng);
    if (eaten % rules.bonusEvery === 0 && !bonus) {
      const cell = spawnCell({ snake: [...snake, food] }, rules, rng);
      bonus = { cell, ttl: rules.bonusTtl };
      bonusSpawnedNow = true;
      events.push({ kind: "bonus-spawn", cell });
    }
  }

  // 5. Bonus (a critter spawned this tick starts counting down next tick)
  if (bonus && !bonusSpawnedNow) {
    if (sameCell(newHead, bonus.cell)) {
      const points = bonusPoints(bonus.ttl, rules);
      score += points;
      events.push({ kind: "bonus-eat", points });
      bonus = null;
    } else if (bonus.ttl <= 1) {
      events.push({ kind: "bonus-expire" });
      bonus = null;
    } else {
      bonus = { ...bonus, ttl: bonus.ttl - 1 };
    }
  }

  return {
    state: { ...state, tick: state.tick + 1, snake, dir, food, bonus, score, eaten },
    events,
  };
}
