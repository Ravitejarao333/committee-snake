import type { Dir } from "@committee-snake/shared";

interface KeyLike {
  key: string;
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type KeyAction =
  | { kind: "vote"; dir: Dir }
  | { kind: "emote" }
  | { kind: "mute" }
  /** A real key with no game meaning: still starts a round from the lobby. */
  | { kind: "other" }
  /** Modifiers, shortcuts and focus keys: the game never reacts. */
  | { kind: "ignore" };

/**
 * Physical-key map (`code`), so it works on any keyboard layout. The number row
 * follows the phone (2 = up, 8 = down); the numpad follows its printed arrows
 * (8 = up, 2 = down).
 */
const VOTE_CODES: Readonly<Record<string, Dir>> = {
  ArrowUp: "U",
  KeyW: "U",
  Digit2: "U",
  Numpad8: "U",
  ArrowDown: "D",
  KeyS: "D",
  Digit8: "D",
  Numpad2: "D",
  ArrowLeft: "L",
  KeyA: "L",
  Digit4: "L",
  Numpad4: "L",
  ArrowRight: "R",
  KeyD: "R",
  Digit6: "R",
  Numpad6: "R",
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
  if (e.ctrlKey || e.metaKey || e.altKey || IGNORED_KEYS.has(e.key)) return { kind: "ignore" };
  // `key` first, so Shift+8 ("*") mutes instead of voting down and Shift+3 ("#") stays inert.
  if (e.key === "*") return { kind: "mute" };
  if (e.key === "#") return { kind: "other" };
  if (e.code === "NumpadMultiply" || e.code === "KeyM") return { kind: "mute" };
  if (e.code === "Digit5" || e.code === "Numpad5") return { kind: "emote" };
  const dir = VOTE_CODES[e.code];
  return dir ? { kind: "vote", dir } : { kind: "other" };
}

/** The on-screen keypad key that represents each vote direction. */
export const KEYPAD_FOR_DIR: Readonly<Record<Dir, string>> = { U: "2", L: "4", R: "6", D: "8" };
