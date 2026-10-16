import type { Dir } from "@committee-snake/shared";
import type { Seat } from "./seats";

interface KeyLike {
  key: string;
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type KeyAction =
  | { kind: "vote"; seat: Seat; dir: Dir }
  /** Enter / Space: join as P1 if nobody has, then start the round. */
  | { kind: "start" }
  /** Ctrl/Cmd+C: copy the Blame Screen. Outside the Blame Screen it is left to the browser. */
  | { kind: "copy" }
  | { kind: "emote" }
  | { kind: "mute" }
  /** A real key with no game meaning: still skips the Blame Screen. */
  | { kind: "other" }
  /** Modifiers, shortcuts and focus keys: the game never reacts. */
  | { kind: "ignore" };

type SeatVote = readonly [seat: Seat, dir: Dir];

/**
 * Physical-key map (`code`), so it works on any keyboard layout. One key set per hot seat:
 * P1 arrows, P2 WASD, P3 IJKL, P4 the numpad (printed arrows: 8 = up, 2 = down) or the number
 * row (phone layout, as on the on-screen keypad: 2 = up, 8 = down).
 */
const VOTE_CODES: Readonly<Record<string, SeatVote>> = {
  ArrowUp: [0, "U"],
  ArrowLeft: [0, "L"],
  ArrowDown: [0, "D"],
  ArrowRight: [0, "R"],
  KeyW: [1, "U"],
  KeyA: [1, "L"],
  KeyS: [1, "D"],
  KeyD: [1, "R"],
  KeyI: [2, "U"],
  KeyJ: [2, "L"],
  KeyK: [2, "D"],
  KeyL: [2, "R"],
  Numpad8: [3, "U"],
  Numpad4: [3, "L"],
  Numpad2: [3, "D"],
  Numpad6: [3, "R"],
  Digit2: [3, "U"],
  Digit4: [3, "L"],
  Digit8: [3, "D"],
  Digit6: [3, "R"],
};

const IGNORED_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "Tab",
  "Escape",
  "Fn",
  "NumLock",
  "Dead",
]);

export function actionForKey(e: KeyLike): KeyAction {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyC") return { kind: "copy" };
  if (e.ctrlKey || e.metaKey || e.altKey || IGNORED_KEYS.has(e.key)) return { kind: "ignore" };
  // `key` first, so Shift+8 ("*") mutes instead of voting down and Shift+3 ("#") stays inert.
  if (e.key === "*") return { kind: "mute" };
  if (e.key === "#") return { kind: "other" };
  if (e.code === "NumpadMultiply" || e.code === "KeyM") return { kind: "mute" };
  if (e.code === "Digit5" || e.code === "Numpad5") return { kind: "emote" };
  if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space")
    return { kind: "start" };
  const v = VOTE_CODES[e.code];
  return v ? { kind: "vote", seat: v[0], dir: v[1] } : { kind: "other" };
}

/** On the Blame Screen nobody votes, so WASD's S (P2 down) means SHARE there. */
export const isShareKey = (a: KeyAction): boolean =>
  a.kind === "vote" && a.seat === 1 && a.dir === "D";

/** The on-screen keypad key that represents each vote direction. */
export const KEYPAD_FOR_DIR: Readonly<Record<Dir, string>> = { U: "2", L: "4", R: "6", D: "8" };
