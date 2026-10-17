import type { BlameReport } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import {
  blameLines,
  blameSpeech,
  fitBlame,
  lineCols,
  lineText,
  nameList,
  softkeyRect,
  wrap,
} from "./blame";

const NAMES = new Map([
  ["p1", "ARROWS"],
  ["p2", "WASD"],
  ["p3", "IJKL"],
  ["p4", "NUMPAD"],
]);

const REPORT: BlameReport = {
  score: 48,
  length: 21,
  cause: "wall",
  fatalDir: "L",
  rows: [
    { dir: "L", count: 2, fatal: true },
    { dir: "U", count: 1, fatal: false },
  ],
  nonsense: 1,
  assassins: ["p1", "p2"],
  savers: ["p3"],
  backwards: ["p4"],
  awards: [
    { id: "assassin", title: "The Assassin", players: ["p1", "p2"] },
    { id: "agreeable", title: "Most Agreeable", players: ["p3"] },
    { id: "napper", title: "Professional Napper", players: ["p4"] },
  ],
  caption: "A deliberately long caption so that it has to wrap on the narrow phone screen.",
  solo: false,
};

const texts = (r: BlameReport, cols = 60) => blameLines(r, NAMES, cols).map(lineText);

describe("blameLines", () => {
  it("lists the score, the choice, the tally and who did it", () => {
    expect(texts(REPORT)).toEqual([
      "GAME OVER",
      "",
      "SCORE 48  LEN 21",
      "THE COMMITTEE CHOSE: LEFT",
      "LEFT 2 FATAL",
      "UP   1",
      "NONSENSE 1",
      "",
      "ASSASSINS: ARROWS, WASD",
      "TRIED TO SAVE IT: IJKL",
      "VOTED BACKWARDS: NUMPAD",
      "",
      "THE ASSASSIN: ARROWS, WASD",
      "MOST AGREEABLE: IJKL",
      "PROFESSIONAL NAPPER: NUMPAD",
      "",
      REPORT.caption,
      "SHARE",
    ]);
  });

  it("says NOBODY with no assassins and omits empty save/backwards rows", () => {
    const t = texts({ ...REPORT, assassins: [], savers: [], backwards: [], nonsense: 0 });
    expect(t).toContain("ASSASSINS: NOBODY");
    expect(t.some((x) => x.startsWith("TRIED TO SAVE IT"))).toBe(false);
    expect(t.some((x) => x.startsWith("VOTED BACKWARDS"))).toBe(false);
    expect(t.some((x) => x.startsWith("NONSENSE"))).toBe(false);
  });

  it("solo: one line instead of the people and awards", () => {
    const t = texts({ ...REPORT, solo: true, awards: [], savers: [], backwards: [] });
    expect(t).toContain("YOU DID THIS ALONE.");
    expect(t.some((x) => x.startsWith("ASSASSINS") || x.startsWith("THE ASSASSIN"))).toBe(false);
    expect(t.at(-1)).toBe("SHARE");
  });

  it("truncates long name lists to a, b, +N", () => {
    expect(nameList(["ARROWS", "WASD", "IJKL"], 40)).toBe("ARROWS, WASD, IJKL");
    expect(nameList(["ARROWS", "WASD", "IJKL", "NUMPAD"], 16)).toBe("ARROWS, WASD, +2");
    expect(nameList(["ARROWS", "WASD"], 3)).toBe("+2");
    const narrow = blameLines(REPORT, NAMES, 20);
    for (const l of narrow) {
      if (l.kind === "people" || l.kind === "award") expect(lineCols(l)).toBeLessThanOrEqual(20);
    }
  });
});

describe("fitBlame", () => {
  const check = (w: number, h: number) => {
    const f = fitBlame(REPORT, NAMES, w, h);
    expect(f.size % 8).toBe(0);
    expect(Number.isInteger(f.lineH)).toBe(true);
    expect(f.lines.length * f.lineH).toBeLessThanOrEqual(h);
    for (const l of f.lines) expect(lineCols(l)).toBeLessThanOrEqual(f.cols);
    expect((f.cols + 2) * f.size).toBeLessThanOrEqual(w);
    return f;
  };

  it("fits the 1366x768 LCD (612x442 at dpr 1)", () => {
    const f = check(612, 442);
    expect(f.size).toBe(8);
    expect(f.lines.filter((l) => l.kind === "award")).toHaveLength(3);
  });

  it("fits 390x844 @3 (1116x806 dev) at 24 dev px, wrapping the caption", () => {
    const f = check(1116, 806);
    expect(f.size).toBe(24);
    expect(f.lines.filter((l) => l.kind === "caption").length).toBeGreaterThan(1);
    expect(f.lines.map(lineText)).toContain("ASSASSINS: ARROWS, WASD");
  });

  it("drops blank rows, then the third award, on a tiny screen", () => {
    const f = fitBlame(REPORT, NAMES, 400, 170);
    expect(f.size).toBe(8);
    expect(f.lines.some((l) => l.kind === "blank")).toBe(false);
    expect(f.lines.filter((l) => l.kind === "award")).toHaveLength(2);
  });

  it("puts the SHARE soft-key on the bottom edge, centred", () => {
    const f = fitBlame(REPORT, NAMES, 612, 442);
    const r = softkeyRect(f, 612, 442);
    expect(r.y + r.h).toBe(442);
    expect(r.x * 2 + r.w).toBe(612);
  });
});

describe("wrap", () => {
  it("wraps on spaces and cuts over-long words", () => {
    expect(wrap("the wall had one vote", 10)).toEqual(["the wall", "had one", "vote"]);
    expect(wrap("abcdefghijk", 4)).toEqual(["abcd"]);
  });
});

describe("blameSpeech", () => {
  it("reads every row once, with no softkey and no doubled stops", () => {
    expect(blameSpeech({ ...REPORT, caption: "Greed. Always greed." }, NAMES)).toBe(
      "GAME OVER. SCORE 48 LEN 21. THE COMMITTEE CHOSE: LEFT. LEFT 2 FATAL. UP 1. NONSENSE 1. " +
        "ASSASSINS: ARROWS, WASD. TRIED TO SAVE IT: IJKL. VOTED BACKWARDS: NUMPAD. " +
        "THE ASSASSIN: ARROWS, WASD. MOST AGREEABLE: IJKL. PROFESSIONAL NAPPER: NUMPAD. " +
        "Greed. Always greed. Press S or tap SHARE to share.",
    );
  });
});
