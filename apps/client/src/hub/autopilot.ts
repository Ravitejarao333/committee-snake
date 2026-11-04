import {
  DIRS,
  type Dir,
  type GameState,
  mulberry32,
  OPPOSITE,
  type Rng,
  type Rules,
  step,
  type VoteMap,
} from "@committee-snake/shared";

/**
 * The hub's demo snake: a one-voter committee that heads for the food. It never predicts
 * movement itself; it asks the real sim (`step`) what each move would do, on a throwaway rng
 * so the round's own stream stays untouched.
 */
const vote = (d: Dir): VoteMap => new Map([["bot", d]]);
const peek = (s: GameState, d: Dir, rules: Rules): GameState =>
  step(s, vote(d), mulberry32(s.tick), rules).state;
const forward = (d: Dir): Dir[] => DIRS.filter((e) => e !== OPPOSITE[d]);

/** Pick the next vote: survive this tick, keep a way out the tick after, then get closer. */
export function choose(s: GameState, rng: Rng, rules: Rules): Dir {
  let best: Dir[] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const d of forward(s.dir)) {
    const next = peek(s, d, rules);
    const head = next.snake[0];
    if (!next.alive || !head) continue;
    const trapped = !forward(d).some((e) => peek(next, e, rules).alive);
    const dist = Math.abs(head[0] - s.food[0]) + Math.abs(head[1] - s.food[1]);
    const score = (trapped ? 1000 : 0) + dist;
    if (score < bestScore) {
      bestScore = score;
      best = [d];
    } else if (score === bestScore) best.push(d);
  }
  return best[rng.int(best.length)] ?? s.dir;
}
