import type { Rng } from "./rng";
import {
  DEFAULT_RULES,
  DELTA,
  type DeathCause,
  DIRS,
  type Dir,
  type GameState,
  type Mode,
  type PlayerId,
  type Rules,
  type Tally,
  type VoteMap,
} from "./types";

export type AwardId = "assassin" | "contrarian" | "agreeable" | "napper" | "prophet";

export interface Award {
  id: AwardId;
  title: string;
  players: PlayerId[];
}

/** Per-player stats accumulated by the room over a round. */
export interface PlayerRoundStats {
  votesCast: number;
  votesWon: number;
  /** Longest run of ticks without a live vote, counted only after the player's first vote. */
  longestNapTicks: number;
  /** The current such run (0 while the player has a live vote). */
  napTicks: number;
}

/**
 * Pick at most three awards for the Blame Screen (docs/PLAN.md §3.7), in priority order:
 * Assassin, Most Agreeable, The Contrarian, Professional Napper, then The Prophet to fill.
 * Prophets are final voters who voted neither for the fatal move nor in reverse.
 */
export function pickAwards(
  fatal: Tally,
  stats: ReadonlyMap<PlayerId, PlayerRoundStats>,
  finalVotes: ReadonlyMap<PlayerId, Dir>,
): Award[] {
  const awards: Award[] = [];
  const assassins = fatal.winners;
  if (assassins.length > 0) {
    awards.push({ id: "assassin", title: "The Assassin", players: assassins });
  }

  let bestAgree = -1;
  let agreeable: PlayerId[] = [];
  let worstAgree = 2;
  let contrarian: PlayerId[] = [];
  let longestNap = 0;
  let nappers: PlayerId[] = [];
  for (const [pid, s] of stats) {
    if (s.votesCast >= 5) {
      const ratio = s.votesWon / s.votesCast;
      if (ratio > bestAgree) [bestAgree, agreeable] = [ratio, [pid]];
      else if (ratio === bestAgree) agreeable.push(pid);
      if (ratio < worstAgree) [worstAgree, contrarian] = [ratio, [pid]];
      else if (ratio === worstAgree) contrarian.push(pid);
    }
    if (s.longestNapTicks > longestNap) [longestNap, nappers] = [s.longestNapTicks, [pid]];
    else if (s.longestNapTicks === longestNap && longestNap > 0) nappers.push(pid);
  }
  if (agreeable.length > 0)
    awards.push({ id: "agreeable", title: "Most Agreeable", players: agreeable });
  if (contrarian.length > 0 && worstAgree < bestAgree) {
    awards.push({ id: "contrarian", title: "The Contrarian", players: contrarian });
  }
  if (longestNap >= 12)
    awards.push({ id: "napper", title: "Professional Napper", players: nappers });

  const prophets = savers(fatal, finalVotes);
  if (prophets.length > 0) {
    awards.push({ id: "prophet", title: "The Prophet", players: prophets });
  }

  return awards.slice(0, 3);
}

/** Final voters who voted for neither the fatal move nor its reverse. */
function savers(fatal: Tally, finalVotes: ReadonlyMap<PlayerId, Dir>): PlayerId[] {
  return [...finalVotes]
    .filter(([pid, d]) => d !== fatal.winner && !fatal.nonsenseBy.includes(pid))
    .map(([pid]) => pid);
}

export interface CaptionContext {
  cause: DeathCause;
  length: number;
  mode: Mode;
  chasingBonus: boolean;
}

export type CaptionLocale = "en" | "hinglish";
type CaptionKey = "wall-short" | "wall" | "self" | "bonus" | "chaos";

/**
 * Original lines, at most 40 ASCII characters each: the client draws them in an 8x8 pixel font
 * with no Devanagari or curly quotes.
 */
const CAPTIONS: Readonly<Record<CaptionLocale, Readonly<Record<CaptionKey, readonly string[]>>>> = {
  en: {
    "wall-short": ["Committee formed. Committee dissolved.", "A bold strategy. Briefly."],
    wall: ["The wall had one vote. The wall won.", "Majority rule meets brick."],
    self: ["Its own worst enemy. Like the committee.", "Ouroboros, but dumber."],
    bonus: ["Greed. Always greed.", "WHY WOULD YOU GO FOR THE BUG"],
    chaos: ["Nobody wanted this. That's how it won.", "Minority report."],
  },
  hinglish: {
    "wall-short": ["Committee bani. Committee gayi.", "Itni jaldi? Wah, committee, wah."],
    wall: ["Committee ne kaand kar diya.", "Deewar ko bhi vote mila tha kya?"],
    self: ["Apni hi poonch kha li. Shabaash.", "Khud ka dushman khud. Classic."],
    bonus: ["Laalach buri bala hai.", "BUG KE PEECHE KYUN BHAAGE?"],
    chaos: ["Kisi ko nahi chahiye tha. Phir bhi hua.", "Ulta pulta committee."],
  },
};

function captionKey(ctx: CaptionContext): CaptionKey {
  if (ctx.mode === "chaos") return "chaos";
  if (ctx.chasingBonus) return "bonus";
  if (ctx.cause === "wall" && ctx.length < 5) return "wall-short";
  return ctx.cause;
}

/**
 * Pick a caption keyed to how the round ended. `pick(n)` must return an integer in [0, n); it is
 * called exactly once, so a round RNG passed as `(n) => rng.int(n)` makes exactly one draw.
 */
export function pickCaption(
  ctx: CaptionContext,
  pick: (n: number) => number,
  locale: CaptionLocale = "en",
): string {
  const key = captionKey(ctx);
  const list = CAPTIONS[locale][key];
  return list[pick(list.length)] ?? "Game over.";
}

/**
 * True iff a bonus critter is on the board and the fatal move took the head one cell closer
 * to it (Manhattan distance). `state` is the death state from `step`: the snake hasn't moved.
 */
export function chasingBonus(state: GameState, fatalDir: Dir): boolean {
  const head = state.snake[0];
  if (!state.bonus || !head) return false;
  const [bx, by] = state.bonus.cell;
  const [dx, dy] = DELTA[fatalDir];
  const before = Math.abs(head[0] - bx) + Math.abs(head[1] - by);
  const after = Math.abs(head[0] + dx - bx) + Math.abs(head[1] + dy - by);
  return after < before;
}

export interface BlameRow {
  dir: Dir;
  count: number;
  /** This row is the direction the committee chose. */
  fatal: boolean;
}

export interface BlameReport {
  score: number;
  length: number;
  cause: DeathCause;
  fatalDir: Dir;
  /** Directions with at least one counted vote, count descending, ties in `DIRS` order. */
  rows: BlameRow[];
  nonsense: number;
  /** Voted for the fatal move. */
  assassins: PlayerId[];
  /** Voted for some other, valid direction ("Tried to save it"). */
  savers: PlayerId[];
  /** Voted the reverse direction, which can never count ("Voted backwards"). */
  backwards: PlayerId[];
  /** Empty when `solo`. */
  awards: Award[];
  caption: string;
  /** Fewer than two players voted this round. */
  solo: boolean;
}

export interface BlameInput {
  /** The dead state returned by `step` on the death tick. */
  state: GameState;
  /** The `tally` from the death event. */
  fatal: Tally;
  /** The live votes passed to that final `step`. */
  finalVotes: VoteMap;
  /** Round stats, including the death tick (`recordTick`). */
  stats: ReadonlyMap<PlayerId, PlayerRoundStats>;
  rules?: Rules;
  locale?: CaptionLocale;
}

/**
 * Everything the Blame Screen shows (docs/PLAN.md §3.7). Draws from `rng` exactly once, for the
 * caption; call it once per round, after the death step, with the round's RNG (ADR 0005).
 */
export function blameReport(input: BlameInput, rng: Rng): BlameReport {
  const { state, fatal, finalVotes, stats, rules = DEFAULT_RULES, locale = "en" } = input;
  const cause = state.cause ?? "wall";
  const fatalDir = fatal.winner;

  const rows = DIRS.filter((d) => fatal.counts[d] > 0)
    .map((dir) => ({ dir, count: fatal.counts[dir], fatal: dir === fatalDir }))
    .sort((a, b) => b.count - a.count);

  let voters = 0;
  for (const s of stats.values()) if (s.votesCast > 0) voters++;
  const solo = voters < 2;

  const caption = pickCaption(
    {
      cause,
      length: state.snake.length,
      mode: rules.mode,
      chasingBonus: chasingBonus(state, fatalDir),
    },
    (n) => rng.int(n),
    locale,
  );

  return {
    score: state.score,
    length: state.snake.length,
    cause,
    fatalDir,
    rows,
    nonsense: fatal.nonsense,
    assassins: [...fatal.winners],
    savers: savers(fatal, finalVotes),
    backwards: [...fatal.nonsenseBy],
    awards: solo ? [] : pickAwards(fatal, stats, finalVotes),
    caption,
    solo,
  };
}
