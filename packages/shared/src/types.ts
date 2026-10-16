export type Dir = "U" | "D" | "L" | "R";
export type Mode = "democracy" | "chaos";
export type Cell = readonly [x: number, y: number];
export type PlayerId = string;

export const DIRS: readonly Dir[] = ["U", "D", "L", "R"];
export const OPPOSITE: Readonly<Record<Dir, Dir>> = { U: "D", D: "U", L: "R", R: "L" };
export const DELTA: Readonly<Record<Dir, Cell>> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

export interface Rules {
  width: number;
  height: number;
  wrap: boolean;
  mode: Mode;
  /** Ticks per second at round start. */
  baseTps: number;
  /** Added every `speedEvery` food. */
  tpsStep: number;
  speedEvery: number;
  maxTps: number;
  /** A bonus critter appears every Nth food, for `bonusTtl` ticks. */
  bonusEvery: number;
  bonusTtl: number;
}

export const DEFAULT_RULES: Rules = {
  width: 32,
  height: 20,
  wrap: false,
  mode: "democracy",
  baseTps: 3,
  tpsStep: 0.25,
  speedEvery: 5,
  maxTps: 8,
  bonusEvery: 5,
  bonusTtl: 20,
};

export interface Bonus {
  cell: Cell;
  ttl: number;
}

export interface GameState {
  tick: number;
  /** Head first. */
  snake: Cell[];
  dir: Dir;
  food: Cell;
  bonus: Bonus | null;
  score: number;
  eaten: number;
  alive: boolean;
  cause: DeathCause | null;
}

export type DeathCause = "wall" | "self";

/** Live votes: player -> direction. Expired votes are removed before calling `step`. */
export type VoteMap = ReadonlyMap<PlayerId, Dir>;

/** A standing vote plus when it was cast, in the caller's clock (ms). */
export interface StampedVote {
  dir: Dir;
  at: number;
}

/** Result of `expireVotes`: votes still counting, and who has gone grey. */
export interface LiveVotes {
  live: VoteMap;
  napping: ReadonlySet<PlayerId>;
}

export interface Tally {
  counts: Record<Dir, number>;
  /** Votes for the reverse direction, shown as "nonsense" and never counted. */
  nonsense: number;
  winner: Dir;
  /** Players whose vote matched `winner`. */
  winners: PlayerId[];
}

export type GameEvent =
  | { kind: "turn"; dir: Dir }
  | { kind: "eat"; cell: Cell; score: number }
  | { kind: "bonus-spawn"; cell: Cell }
  | { kind: "bonus-eat"; points: number }
  | { kind: "bonus-expire" }
  | { kind: "death"; cause: DeathCause; fatalDir: Dir; tally: Tally };
