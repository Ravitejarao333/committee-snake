/**
 * Replay a round from `(seed, vote log)` with the pure sim (docs/PLAN.md §6.3).
 *
 *   node --experimental-strip-types scripts/replay.ts <log.json | -> [--board]
 *
 * Log format (see scripts/replay.example.json):
 *   { "seed": 42, "rules": { "wrap": true }, "votes": [{ "alice": "U" }, {}, ...] }
 *
 * - `votes[i]` is the live (non-expired) vote map passed to `step` for tick i+1.
 * - `rules` is optional and merged over DEFAULT_RULES.
 * - The RNG stream matches the room: mulberry32(seed) -> createGame -> step per tick.
 */
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import type { Cell, Dir, GameEvent, GameState, Rules } from "../packages/shared/src/index.ts";

// packages/shared uses bundler-style extensionless imports (`./sim`), which
// Node's ESM resolver rejects. Retry relative specifiers with `.ts`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!specifier.startsWith(".") || /\.[cm]?[jt]s$/.test(specifier)) throw err;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { createGame, DEFAULT_RULES, DirSchema, ModeSchema, mulberry32, step } = await import(
  "../packages/shared/src/index.ts"
);

type DeathEvent = Extract<GameEvent, { kind: "death" }>;

interface ReplayLog {
  seed: number;
  rules: Rules;
  overrides: Partial<Rules>;
  votes: Map<string, Dir>[];
}

const USAGE = "usage: node --experimental-strip-types scripts/replay.ts <log.json | -> [--board]";

const out = (line = ""): void => {
  process.stdout.write(`${line}\n`);
};

function fail(message: string): never {
  process.stderr.write(`replay: ${message}\n`);
  process.exit(1);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseRules(raw: unknown): Partial<Rules> {
  if (raw === undefined) return {};
  if (!isObject(raw)) fail("`rules` must be an object");
  const overrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in DEFAULT_RULES)) fail(`unknown rule \`${key}\``);
    const expected = typeof DEFAULT_RULES[key as keyof Rules];
    if (typeof value !== expected) fail(`rule \`${key}\` must be a ${expected}`);
    if (key === "mode" && !ModeSchema.safeParse(value).success) fail(`bad mode ${String(value)}`);
    overrides[key] = value;
  }
  return overrides as Partial<Rules>;
}

function parseVotes(raw: unknown): Map<string, Dir>[] {
  if (!Array.isArray(raw)) fail("`votes` must be an array (one vote map per tick)");
  return raw.map((tick, i) => {
    if (!isObject(tick)) fail(`votes[${i}] must be an object of player -> direction`);
    const votes = new Map<string, Dir>();
    for (const [pid, dir] of Object.entries(tick)) {
      const parsed = DirSchema.safeParse(dir);
      if (!parsed.success) fail(`votes[${i}].${pid}: ${JSON.stringify(dir)} is not U|D|L|R`);
      votes.set(pid, parsed.data);
    }
    return votes;
  });
}

function parseLog(raw: unknown): ReplayLog {
  if (!isObject(raw)) fail("log must be a JSON object");
  const { seed } = raw;
  if (typeof seed !== "number" || !Number.isInteger(seed)) fail("`seed` must be an integer");
  const overrides = parseRules(raw.rules);
  return {
    seed,
    overrides,
    rules: { ...DEFAULT_RULES, ...overrides },
    votes: parseVotes(raw.votes),
  };
}

const fmtCell = ([x, y]: Cell): string => `(${x},${y})`;

const fmtVotes = (votes: ReadonlyMap<string, Dir>): string =>
  votes.size === 0 ? "-" : [...votes].map(([pid, d]) => `${pid}:${d}`).join(" ");

function fmtEvent(e: GameEvent): string {
  switch (e.kind) {
    case "turn":
      return `turn ${e.dir}`;
    case "eat":
      return `eat ${fmtCell(e.cell)} score=${e.score}`;
    case "bonus-spawn":
      return `bonus-spawn ${fmtCell(e.cell)}`;
    case "bonus-eat":
      return `bonus-eat +${e.points}`;
    case "bonus-expire":
      return "bonus-expire";
    case "death":
      return `DEATH ${e.cause} moving ${e.fatalDir}`;
  }
}

function fmtTick(s: GameState, votes: ReadonlyMap<string, Dir>, events: GameEvent[]): string {
  const head = s.snake[0];
  const bonus = s.bonus ? ` bonus=${fmtCell(s.bonus.cell)}/${s.bonus.ttl}` : "";
  const evs = events.length > 0 ? ` | ${events.map(fmtEvent).join(", ")}` : "";
  return (
    `t=${String(s.tick).padStart(4)} ${s.dir} head=${head ? fmtCell(head) : "-"} ` +
    `len=${s.snake.length} score=${s.score} food=${fmtCell(s.food)}${bonus} ` +
    `votes[${fmtVotes(votes)}]${evs}`
  );
}

/** ASCII board: `@` head, `o` body, `*` food, `B` bonus. */
function fmtBoard(s: GameState, rules: Rules): string {
  const rows = Array.from({ length: rules.height }, () => Array<string>(rules.width).fill("."));
  const put = ([x, y]: Cell, ch: string): void => {
    const row = rows[y];
    if (row && x >= 0 && x < rules.width) row[x] = ch;
  };
  put(s.food, "*");
  if (s.bonus) put(s.bonus.cell, "B");
  for (let i = s.snake.length - 1; i >= 0; i--) {
    const cell = s.snake[i];
    if (cell) put(cell, i === 0 ? "@" : "o");
  }
  const edge = `+${"-".repeat(rules.width)}+`;
  return [edge, ...rows.map((r) => `|${r.join("")}|`), edge].join("\n");
}

function fmtDeath(d: DeathEvent, tick: number): string[] {
  const { counts, nonsense, winners } = d.tally;
  return [
    `DEATH at tick ${tick}: ${d.cause}, fatal move ${d.fatalDir}`,
    `  tally   U:${counts.U} D:${counts.D} L:${counts.L} R:${counts.R} nonsense:${nonsense}`,
    `  voted ${d.fatalDir}: ${winners.length > 0 ? winners.join(", ") : "nobody (kept going straight)"}`,
  ];
}

function readInput(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (err) {
    fail(`cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`invalid JSON in ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const args = process.argv.slice(2);
const showBoard = args.includes("--board");
const path = args.find((a) => !a.startsWith("--"));
if (!path) fail(USAGE);

const log = parseLog(readInput(path));
const rng = mulberry32(log.seed);
let state = createGame(rng, log.rules);

out(`seed=${log.seed} rules=${JSON.stringify(log.overrides)} ticks-in-log=${log.votes.length}`);
out(fmtTick(state, new Map(), []));
if (showBoard) out(fmtBoard(state, log.rules));

for (const [i, votes] of log.votes.entries()) {
  const result = step(state, votes, rng, log.rules);
  state = result.state;
  out(fmtTick(state, votes, result.events));
  if (showBoard) out(fmtBoard(state, log.rules));

  const death = result.events.find((e): e is DeathEvent => e.kind === "death");
  if (death) {
    out();
    for (const line of fmtDeath(death, state.tick)) out(line);
    if (!showBoard) out(fmtBoard(state, log.rules));
    const ignored = log.votes.length - (i + 1);
    if (ignored > 0) out(`note: ${ignored} tick(s) of votes after death were ignored`);
    process.exit(0);
  }
}

out();
out(`log ended at tick ${state.tick}; snake still alive (len=${state.snake.length})`);
if (!showBoard) out(fmtBoard(state, log.rules));
