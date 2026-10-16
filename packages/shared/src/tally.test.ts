import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";
import { countVotes, tally } from "./tally";
import type { Dir, PlayerId } from "./types";

const votes = (entries: Record<PlayerId, Dir>) => new Map(Object.entries(entries));

describe("tally – democracy", () => {
  it("majority wins", () => {
    const t = tally(votes({ a: "U", b: "U", c: "D" }), "R", "democracy", mulberry32(1));
    expect(t.winner).toBe("U");
    expect(t.winners).toEqual(["a", "b"]);
    expect(t.counts).toEqual({ U: 2, D: 1, L: 0, R: 0 });
  });

  it("reverse votes never count and are reported as nonsense", () => {
    const t = tally(votes({ a: "L", b: "L", c: "U" }), "R", "democracy", mulberry32(1));
    expect(t.winner).toBe("U");
    expect(t.nonsense).toBe(2);
    expect(t.nonsenseBy).toEqual(["a", "b"]);
    expect(t.counts.L).toBe(0);
  });

  it("keeps going straight with no votes", () => {
    const t = tally(new Map(), "D", "democracy", mulberry32(1));
    expect(t.winner).toBe("D");
    expect(t.winners).toEqual([]);
  });

  it("keeps going straight when only reverse votes exist", () => {
    const t = tally(votes({ a: "U" }), "D", "democracy", mulberry32(1));
    expect(t.winner).toBe("D");
  });

  it("tie including current direction → straight", () => {
    const t = tally(votes({ a: "U", b: "R" }), "R", "democracy", mulberry32(1));
    expect(t.winner).toBe("R");
  });

  it("tie excluding current direction → seeded RNG, deterministic", () => {
    const a = tally(votes({ a: "U", b: "D" }), "R", "democracy", mulberry32(99));
    const b = tally(votes({ a: "U", b: "D" }), "R", "democracy", mulberry32(99));
    expect(["U", "D"]).toContain(a.winner);
    expect(a.winner).toBe(b.winner);
  });
});

describe("tally – chaos", () => {
  it("least popular non-zero vote wins", () => {
    const t = tally(votes({ a: "U", b: "U", c: "U", d: "D" }), "R", "chaos", mulberry32(1));
    expect(t.winner).toBe("D");
    expect(t.winners).toEqual(["d"]);
  });

  it("ignores zero-vote directions", () => {
    const t = tally(votes({ a: "U", b: "U" }), "R", "chaos", mulberry32(1));
    expect(t.winner).toBe("U");
  });
});

describe("countVotes", () => {
  const cases: [Record<PlayerId, Dir>, Dir][] = [
    [{ a: "U", b: "U", c: "D" }, "R"],
    [{ a: "L", b: "L", c: "U" }, "R"],
    [{}, "D"],
    [{ a: "U" }, "D"],
    [{ a: "U", b: "R" }, "R"],
    [{ a: "U", b: "D" }, "R"],
    [{ a: "U", b: "U", c: "U", d: "D" }, "R"],
  ];

  it("matches tally's counts, nonsense and winners for the same votes", () => {
    for (const [entries, current] of cases) {
      const v = votes(entries);
      const c = countVotes(v, current);
      for (const mode of ["democracy", "chaos"] as const) {
        const t = tally(v, current, mode, mulberry32(99));
        expect(c.counts).toEqual(t.counts);
        expect(c.nonsense).toBe(t.nonsense);
        expect(c.nonsenseBy).toEqual(t.nonsenseBy);
        expect(c.byDir[t.winner]).toEqual(t.winners);
      }
    }
  });

  it("keeps insertion order in byDir and nonsenseBy", () => {
    const c = countVotes(votes({ z: "U", m: "L", a: "U", q: "L", b: "D" }), "R");
    expect(c.byDir).toEqual({ U: ["z", "a"], D: ["b"], L: [], R: [] });
    expect(c.nonsenseBy).toEqual(["m", "q"]);
    expect(c.nonsense).toBe(2);
  });

  it("never draws from an rng (it doesn't take one), and tally draws only on an open tie", () => {
    let draws = 0;
    const rng = mulberry32(7);
    const spy = {
      next: rng.next,
      int: (n: number) => {
        draws++;
        return rng.int(n);
      },
    };
    tally(votes({ a: "U", b: "U", c: "D" }), "R", "democracy", spy);
    tally(votes({ a: "U", b: "R" }), "R", "democracy", spy);
    expect(draws).toBe(0);
    tally(votes({ a: "U", b: "D" }), "R", "democracy", spy);
    expect(draws).toBe(1);
  });
});
