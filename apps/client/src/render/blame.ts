import type { BlameReport, Dir, PlayerId } from "@committee-snake/shared";
import type { GlyphName } from "./sprites";

/**
 * Pure Blame Screen layout (docs/PLAN.md §3.7): the report becomes typed rows of text, then
 * `fitBlame` picks the largest Press Start 2P size (a multiple of 8 device px) that holds them.
 * Widths are in character cells: the font is 1 em per glyph, and an 8x8 glyph is 1 em too.
 */
export type Line =
  | { kind: "blank" }
  | { kind: "text"; text: string }
  | { kind: "tally"; dir: Dir; text: string; fatal: boolean }
  | { kind: "people"; glyph: GlyphName; text: string }
  | { kind: "award"; players: PlayerId[]; text: string }
  | { kind: "caption"; text: string }
  | { kind: "softkey"; text: string };

export interface BlameFit {
  /** Font size, device px (a multiple of 8). */
  size: number;
  lineH: number;
  /** Character cells per row. */
  cols: number;
  lines: Line[];
}

const WORD: Readonly<Record<Dir, string>> = { U: "UP", D: "DOWN", L: "LEFT", R: "RIGHT" };
const FATAL = "FATAL";
export const SOFTKEY = "SHARE";
/** Avatars shown per award row. */
const AWARD_AVATARS = 3;
const MAX_SIZE = 64;

/** "a, b, +N": as many names as fit in `max` characters, the rest counted. */
export function nameList(names: readonly string[], max: number): string {
  const all = names.join(", ");
  if (all.length <= max) return all;
  for (let k = names.length - 1; k >= 1; k--) {
    const s = `${names.slice(0, k).join(", ")}, +${names.length - k}`;
    if (s.length <= max) return s;
  }
  return `+${names.length}`;
}

/** Character cells a line needs. */
export function lineCols(line: Line): number {
  switch (line.kind) {
    case "blank":
      return 0;
    case "tally":
      // glyph, space, text, then " FATAL" with a cell of inverse padding either side.
      return 2 + line.text.length + (line.fatal ? FATAL.length + 3 : 0);
    case "people":
      return 2 + line.text.length;
    case "award":
      return Math.min(AWARD_AVATARS, line.players.length) + 1 + line.text.length;
    case "softkey":
      return line.text.length + 2;
    default:
      return line.text.length;
  }
}

/** The line as plain text (dev hook, smoke test and accessibility). */
export function lineText(line: Line): string {
  if (line.kind === "blank") return "";
  if (line.kind === "tally" && line.fatal) return `${line.text} ${FATAL}`;
  return line.text;
}

/** Rows for a report; `cols` caps the name lists. Captions are wrapped later by `fitBlame`. */
export function blameLines(
  r: BlameReport,
  names: ReadonlyMap<PlayerId, string>,
  cols: number,
): Line[] {
  const who = (ids: readonly PlayerId[], label: string, empty = "NOBODY"): string => {
    const list = ids.map((id) => names.get(id) ?? id.toUpperCase());
    const room = Math.max(1, cols - 2 - label.length);
    return `${label}${list.length ? nameList(list, room) : empty}`.slice(0, Math.max(1, cols - 2));
  };
  const width = Math.max(...r.rows.map((row) => WORD[row.dir].length), 0);
  const lines: Line[] = [
    { kind: "text", text: "GAME OVER" },
    { kind: "blank" },
    { kind: "text", text: `SCORE ${r.score}  LEN ${r.length}` },
    { kind: "text", text: `THE COMMITTEE CHOSE: ${WORD[r.fatalDir]}` },
    ...r.rows.map(
      (row): Line => ({
        kind: "tally",
        dir: row.dir,
        text: `${WORD[row.dir].padEnd(width)} ${row.count}`,
        fatal: row.fatal,
      }),
    ),
  ];
  if (r.nonsense > 0)
    lines.push({ kind: "people", glyph: "upside", text: `NONSENSE ${r.nonsense}` });
  lines.push({ kind: "blank" });
  if (r.solo) {
    lines.push({ kind: "text", text: "YOU DID THIS ALONE." });
  } else {
    lines.push({ kind: "people", glyph: "knife", text: who(r.assassins, "ASSASSINS: ") });
    if (r.savers.length) {
      lines.push({ kind: "people", glyph: "hands", text: who(r.savers, "TRIED TO SAVE IT: ") });
    }
    if (r.backwards.length) {
      lines.push({ kind: "people", glyph: "upside", text: who(r.backwards, "VOTED BACKWARDS: ") });
    }
    if (r.awards.length) lines.push({ kind: "blank" });
    for (const a of r.awards.slice(0, 3)) {
      const label = `${a.title.toUpperCase()}: `;
      const room = cols - Math.min(AWARD_AVATARS, a.players.length) - 1;
      lines.push({
        kind: "award",
        players: a.players.slice(0, AWARD_AVATARS),
        text: who(a.players, label).slice(0, Math.max(1, room)),
      });
    }
  }
  lines.push({ kind: "blank" }, { kind: "caption", text: r.caption });
  lines.push({ kind: "softkey", text: SOFTKEY });
  return lines;
}

/** Greedy word wrap to `cols`; a word longer than a line is cut. */
export function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.slice(0, Math.max(1, cols));
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const fits = (lines: readonly Line[], cols: number, rows: number): boolean =>
  lines.length <= rows && lines.every((l) => lineCols(l) <= cols);

/** Wrap the caption to `cols` (its rows replace the single caption row). */
const wrapCaption = (lines: readonly Line[], cols: number): Line[] =>
  lines.flatMap((l) =>
    l.kind === "caption" && l.text.length > cols
      ? wrap(l.text, cols).map((text): Line => ({ kind: "caption", text }))
      : [l],
  );

const dropThirdAward = (lines: readonly Line[]): Line[] => {
  let seen = 0;
  return lines.filter((l) => l.kind !== "award" || ++seen <= 2);
};

/**
 * Largest font size at which every row fits `w` x `h` device px, with one character cell of
 * margin each side. A caption wider than the screen wraps at any size; if the rows still don't
 * fit at 8 px, blank rows go first, then the third award.
 */
export function fitBlame(
  r: BlameReport,
  names: ReadonlyMap<PlayerId, string>,
  w: number,
  h: number,
): BlameFit {
  const measure = (size: number) => {
    const lineH = size + size / 2;
    return { size, lineH, cols: Math.floor(w / size) - 2, rows: Math.floor(h / lineH) };
  };
  for (let size = MAX_SIZE; size > 8; size -= 8) {
    const m = measure(size);
    const lines = wrapCaption(blameLines(r, names, m.cols), m.cols);
    if (fits(lines, m.cols, m.rows)) return { ...m, lines };
  }
  const m = measure(8);
  const steps = [(l: readonly Line[]) => l.filter((x) => x.kind !== "blank"), dropThirdAward];
  let lines = wrapCaption(blameLines(r, names, m.cols), m.cols);
  for (const step of steps) {
    if (fits(lines, m.cols, m.rows)) break;
    lines = step(lines);
  }
  return { ...m, lines };
}

/** The SHARE soft-key's rect, centred on the bottom edge, in device px. */
export function softkeyRect(fit: BlameFit, w: number, h: number) {
  const cw = (SOFTKEY.length + 2) * fit.size;
  return { x: Math.floor((w - cw) / 2), y: h - fit.lineH, w: cw, h: fit.lineH };
}
