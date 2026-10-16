import { describe, expect, it } from "vitest";
import {
  type BlameInput,
  blameReport,
  type CaptionContext,
  type CaptionLocale,
  chasingBonus,
  type PlayerRoundStats,
  pickAwards,
  pickCaption,
} from "./awards";
import { mulberry32, type Rng } from "./rng";
import { createGame, step } from "./sim";
import { recordTick } from "./stats";
import { DEFAULT_RULES, type DeathCause, type Dir, type GameState, type Tally } from "./types";

const fatal: Tally = {
  counts: { U: 0, D: 0, L: 2, R: 0 },
  nonsense: 0,
  nonsenseBy: [],
  winner: "L",
  winners: ["a", "b"],
};

const stat = (votesCast: number, votesWon: number, longestNapTicks = 0): PlayerRoundStats => ({
  votesCast,
  votesWon,
  longestNapTicks,
  napTicks: 0,
});

const votes = (entries: Record<string, Dir>) => new Map(Object.entries(entries));

describe("pickAwards", () => {
  it("names the assassins and the prophet", () => {
    const awards = pickAwards(fatal, new Map(), votes({ a: "L", b: "L", c: "U" }));
    expect(awards.find((x) => x.id === "assassin")?.players).toEqual(["a", "b"]);
    expect(awards.find((x) => x.id === "prophet")?.players).toEqual(["c"]);
  });

  it("returns at most three awards", () => {
    const stats = new Map([
      ["a", stat(10, 9)],
      ["b", stat(10, 1, 30)],
    ]);
    expect(pickAwards(fatal, stats, votes({ c: "U" })).length).toBeLessThanOrEqual(3);
  });

  it("prefers Agreeable, Contrarian and Napper over Prophet", () => {
    const stats = new Map([
      ["a", stat(10, 9)],
      ["b", stat(10, 1, 30)],
      ["c", stat(6, 3)],
    ]);
    const awards = pickAwards(fatal, stats, votes({ a: "L", b: "L", c: "U" }));
    expect(awards.map((x) => x.id)).toEqual(["assassin", "agreeable", "contrarian"]);
    expect(awards.find((x) => x.id === "contrarian")?.players).toEqual(["b"]);
  });

  it("shows the Napper alongside the Assassin when nobody qualifies for the ratio awards", () => {
    const stats = new Map([
      ["a", stat(2, 2)],
      ["c", stat(1, 0, 15)],
    ]);
    const awards = pickAwards(fatal, stats, votes({ a: "L", b: "L", c: "U" }));
    expect(awards.map((x) => x.id)).toEqual(["assassin", "napper", "prophet"]);
    expect(awards.find((x) => x.id === "napper")?.players).toEqual(["c"]);
  });

  it("follows the priority order with every award available", () => {
    const stats = new Map([
      ["a", stat(10, 9)],
      ["b", stat(10, 1, 30)],
    ]);
    const noAssassins: Tally = { ...fatal, counts: { U: 1, D: 0, L: 0, R: 0 }, winners: [] };
    const awards = pickAwards(noAssassins, stats, votes({ c: "U" }));
    expect(awards.map((x) => x.id)).toEqual(["agreeable", "contrarian", "napper"]);
  });

  it("Prophet excludes reverse (nonsense) voters", () => {
    const withNonsense: Tally = { ...fatal, nonsense: 1, nonsenseBy: ["d"] };
    const awards = pickAwards(withNonsense, new Map(), votes({ a: "L", b: "L", c: "U", d: "R" }));
    expect(awards.find((x) => x.id === "prophet")?.players).toEqual(["c"]);

    const onlyNonsense = pickAwards(withNonsense, new Map(), votes({ a: "L", b: "L", d: "R" }));
    expect(onlyNonsense.map((x) => x.id)).toEqual(["assassin"]);
  });
});

const ctx = (
  cause: DeathCause,
  length: number,
  over: Partial<CaptionContext> = {},
): CaptionContext => ({ cause, length, mode: "democracy", chasingBonus: false, ...over });

/** Every caption context, one per caption key. */
const ALL_KEYS: CaptionContext[] = [
  ctx("wall", 3),
  ctx("wall", 30),
  ctx("self", 30),
  ctx("wall", 30, { chasingBonus: true }),
  ctx("wall", 30, { mode: "chaos" }),
];
const LOCALES: CaptionLocale[] = ["en", "hinglish"];

/** All lines for one context and locale, read through `pickCaption` itself. */
const linesFor = (c: CaptionContext, locale: CaptionLocale): string[] => {
  let size = 0;
  pickCaption(
    c,
    (n) => {
      size = n;
      return 0;
    },
    locale,
  );
  return Array.from({ length: size }, (_, i) => pickCaption(c, () => i, locale));
};

describe("pickCaption", () => {
  const first = () => 0;
  it("keys on how you died", () => {
    expect(pickCaption(ctx("wall", 3), first)).toBe("Committee formed. Committee dissolved.");
    expect(pickCaption(ctx("self", 30), first)).toMatch(/worst enemy/);
    expect(pickCaption(ctx("wall", 30, { chasingBonus: true }), first)).toBe(
      "Greed. Always greed.",
    );
    expect(pickCaption(ctx("wall", 30, { mode: "chaos" }), first)).toMatch(/Nobody wanted this/);
  });

  it("defaults to English and switches to Hinglish on request", () => {
    expect(pickCaption(ctx("wall", 30), first)).toBe(pickCaption(ctx("wall", 30), first, "en"));
    expect(pickCaption(ctx("wall", 30), first, "hinglish")).toBe("Committee ne kaand kar diya.");
  });

  it("has at least two lines for every key in both packs, all distinct per pack", () => {
    for (const locale of LOCALES) {
      const all = ALL_KEYS.flatMap((c) => {
        const lines = linesFor(c, locale);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        return lines;
      });
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("every line is non-empty printable ASCII and at most 40 characters", () => {
    for (const locale of LOCALES) {
      for (const c of ALL_KEYS) {
        for (const line of linesFor(c, locale)) {
          expect(line, line).toMatch(/^[\x20-\x7e]{1,40}$/);
        }
      }
    }
  });

  it("calls pick exactly once", () => {
    let calls = 0;
    pickCaption(ctx("self", 9), (n) => {
      calls++;
      return n - 1;
    });
    expect(calls).toBe(1);
  });

  it("falls back to a fixed line if pick returns an out-of-range index", () => {
    expect(pickCaption(ctx("wall", 30), () => 99)).toBe("Game over.");
  });
});

const base = (over: Partial<GameState> = {}): GameState => ({
  ...createGame(mulberry32(1)),
  snake: [
    [5, 5],
    [4, 5],
    [3, 5],
  ],
  ...over,
});

describe("chasingBonus", () => {
  it("is false without a bonus", () => {
    expect(chasingBonus(base(), "R")).toBe(false);
  });

  it("is true when the fatal move heads toward the bonus", () => {
    const s = base({ bonus: { cell: [9, 2], ttl: 5 } });
    expect(chasingBonus(s, "R")).toBe(true);
    expect(chasingBonus(s, "U")).toBe(true);
  });

  it("is false when the fatal move heads away from the bonus", () => {
    const s = base({ bonus: { cell: [9, 2], ttl: 5 } });
    expect(chasingBonus(s, "L")).toBe(false);
    expect(chasingBonus(s, "D")).toBe(false);
  });
});

/** Wraps an Rng and counts every draw. */
const counting = (rng: Rng) => {
  const c = {
    calls: 0,
    rng: {
      next: () => {
        c.calls++;
        return rng.next();
      },
      int: (n: number) => {
        c.calls++;
        return rng.int(n);
      },
    } satisfies Rng,
  };
  return c;
};

describe("blameReport", () => {
  // Heading R into the right wall: a, b, f chose R (fatal); c chose U and e chose D (savers);
  // d chose L, the reverse, which never counts.
  const dead: GameState = {
    ...base({
      snake: [
        [31, 5],
        [30, 5],
        [29, 5],
        [28, 5],
      ],
    }),
    dir: "R",
    score: 7,
    alive: false,
    cause: "wall",
  };
  const finalVotes = votes({ a: "R", b: "R", c: "U", d: "L", e: "D", f: "R" });
  const deathTally: Tally = {
    counts: { U: 1, D: 1, L: 0, R: 3 },
    nonsense: 1,
    nonsenseBy: ["d"],
    winner: "R",
    winners: ["a", "b", "f"],
  };
  const stats = new Map([
    ["a", stat(10, 9)],
    ["b", stat(10, 2)],
    ["c", stat(3, 1)],
  ]);
  const input: BlameInput = { state: dead, fatal: deathTally, finalVotes, stats };

  it("splits voters into assassins, savers and backwards voters", () => {
    const r = blameReport(input, mulberry32(1));
    expect(r.score).toBe(7);
    expect(r.length).toBe(4);
    expect(r.cause).toBe("wall");
    expect(r.fatalDir).toBe("R");
    expect(r.assassins).toEqual(["a", "b", "f"]);
    expect(r.savers).toEqual(["c", "e"]);
    expect(r.backwards).toEqual(["d"]);
    expect(r.nonsense).toBe(1);
    expect(r.solo).toBe(false);
    expect(r.awards.map((x) => x.id)).toEqual(["assassin", "agreeable", "contrarian"]);
  });

  it("lists non-zero rows by count, ties in DIRS order, fatal row marked", () => {
    expect(blameReport(input, mulberry32(1)).rows).toEqual([
      { dir: "R", count: 3, fatal: true },
      { dir: "U", count: 1, fatal: false },
      { dir: "D", count: 1, fatal: false },
    ]);
  });

  it("is solo with one voter and then has no awards", () => {
    const r = blameReport(
      {
        ...input,
        stats: new Map([
          ["a", stat(4, 4)],
          ["b", stat(0, 0)],
        ]),
      },
      mulberry32(1),
    );
    expect(r.solo).toBe(true);
    expect(r.awards).toEqual([]);
  });

  it("treats a missing cause as a wall death", () => {
    expect(blameReport({ ...input, state: { ...dead, cause: null } }, mulberry32(1)).cause).toBe(
      "wall",
    );
  });

  it("uses the rules' mode and the locale for the caption", () => {
    const chaos = { ...DEFAULT_RULES, mode: "chaos" as const };
    const en = linesFor(ctx("wall", 4, { mode: "chaos" }), "en");
    const hi = linesFor(ctx("wall", 4, { mode: "chaos" }), "hinglish");
    expect(en).toContain(blameReport({ ...input, rules: chaos }, mulberry32(3)).caption);
    expect(hi).toContain(
      blameReport({ ...input, rules: chaos, locale: "hinglish" }, mulberry32(3)).caption,
    );
  });

  it("captions a bonus chase", () => {
    const greedy = { ...dead, bonus: { cell: [20, 5] as const, ttl: 3 } };
    const r = blameReport(
      { ...input, state: greedy, fatal: { ...deathTally, winner: "L" } },
      {
        next: () => 0,
        int: () => 0,
      },
    );
    expect(r.caption).toBe("Greed. Always greed.");
  });

  it("same seed gives the same caption; different seeds can differ", () => {
    expect(blameReport(input, mulberry32(42)).caption).toBe(
      blameReport(input, mulberry32(42)).caption,
    );
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) seen.add(blameReport(input, mulberry32(seed)).caption);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("draws from the rng exactly once", () => {
    const c = counting(mulberry32(5));
    blameReport(input, c.rng);
    expect(c.calls).toBe(1);
  });

  it("builds a report from a real game played to death", () => {
    const rng = mulberry32(2026);
    let state = createGame(rng);
    let stats = new Map<string, PlayerRoundStats>();
    const seats = ["p1", "p2", "p3"];
    let death: { tally: Tally; votes: Map<string, Dir> } | undefined;
    for (let t = 0; t < 200 && !death; t++) {
      // p1 and p2 always want Up; p3 wants Right, and naps on odd ticks.
      const live = votes(t % 2 === 0 ? { p1: "U", p2: "U", p3: "R" } : { p1: "U", p2: "U" });
      const r = step(state, live, rng);
      state = r.state;
      stats = recordTick(stats, seats, live, state.dir);
      for (const e of r.events) if (e.kind === "death") death = { tally: e.tally, votes: live };
    }
    if (!death) throw new Error("expected the snake to die");
    const c = counting(rng);
    const report = blameReport(
      { state, fatal: death.tally, finalVotes: death.votes, stats },
      c.rng,
    );
    expect(c.calls).toBe(1);
    expect(state.alive).toBe(false);
    expect(report.cause).toBe("wall");
    expect(report.fatalDir).toBe("U");
    expect(report.assassins).toEqual(["p1", "p2"]);
    expect(report.savers).toEqual(["p3"]);
    expect(report.solo).toBe(false);
    expect(report.rows[0]).toEqual({ dir: "U", count: 2, fatal: true });
    expect(report.awards[0]?.id).toBe("assassin");
    expect(report.caption.length).toBeGreaterThan(0);
  });
});
