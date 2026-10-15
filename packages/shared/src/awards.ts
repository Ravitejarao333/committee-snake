import type { DeathCause, Dir, Mode, PlayerId, Tally } from "./types";

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
  longestNapTicks: number;
}

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

  const prophets = [...finalVotes]
    .filter(([pid, d]) => d !== fatal.winner && !assassins.includes(pid))
    .map(([pid]) => pid);
  if (prophets.length > 0) {
    awards.push({ id: "prophet", title: "The Prophet", players: prophets });
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
  }
  if (agreeable.length > 0) awards.push({ id: "agreeable", title: "Most Agreeable", players: agreeable });
  if (contrarian.length > 0 && worstAgree < bestAgree) {
    awards.push({ id: "contrarian", title: "The Contrarian", players: contrarian });
  }
  if (longestNap >= 12) awards.push({ id: "napper", title: "Professional Napper", players: nappers });

  return awards.slice(0, 3);
}

export interface CaptionContext {
  cause: DeathCause;
  length: number;
  mode: Mode;
  chasingBonus: boolean;
}

const CAPTIONS: Record<string, string[]> = {
  "wall-short": ["Committee formed. Committee dissolved.", "A bold strategy. Briefly."],
  wall: ["The wall had one vote. The wall won.", "Majority rule meets brick."],
  self: ["The snake was its own worst enemy. Like the committee.", "Ouroboros, but dumber."],
  bonus: ["Greed. Always greed.", "WHY WOULD YOU GO FOR THE BUG"],
  chaos: ["Nobody wanted this. That's how it won.", "Minority report."],
};

export function pickCaption(ctx: CaptionContext, pick: (n: number) => number): string {
  const key = ctx.mode === "chaos"
    ? "chaos"
    : ctx.chasingBonus
      ? "bonus"
      : ctx.cause === "wall" && ctx.length < 5
        ? "wall-short"
        : ctx.cause;
  const list = CAPTIONS[key] ?? CAPTIONS.wall ?? [];
  return list[pick(list.length)] ?? "Game over.";
}
