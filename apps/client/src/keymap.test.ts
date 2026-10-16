import { describe, expect, it } from "vitest";
import { actionForKey, KEYPAD_FOR_DIR } from "./keymap";

const k = (code: string, key = "x", extra: object = {}) => actionForKey({ code, key, ...extra });

describe("actionForKey", () => {
  it("maps arrows, WASD, number row and numpad to votes", () => {
    const cases: [string, string][] = [
      ["ArrowUp", "U"],
      ["KeyW", "U"],
      ["Digit2", "U"],
      ["Numpad8", "U"],
      ["ArrowDown", "D"],
      ["KeyS", "D"],
      ["Digit8", "D"],
      ["Numpad2", "D"],
      ["ArrowLeft", "L"],
      ["KeyA", "L"],
      ["Digit4", "L"],
      ["Numpad4", "L"],
      ["ArrowRight", "R"],
      ["KeyD", "R"],
      ["Digit6", "R"],
      ["Numpad6", "R"],
    ];
    for (const [code, dir] of cases) expect(k(code)).toEqual({ kind: "vote", dir });
  });

  it("uses the physical key, so AZERTY's Z on KeyW still votes up", () => {
    expect(k("KeyW", "z")).toEqual({ kind: "vote", dir: "U" });
  });

  it("checks `key` first for * and #, so Shift+8 mutes and Shift+3 is inert", () => {
    expect(k("Digit8", "*")).toEqual({ kind: "mute" });
    expect(k("Digit3", "#")).toEqual({ kind: "other" });
    expect(k("NumpadMultiply", "*")).toEqual({ kind: "mute" });
    expect(k("KeyM", "m")).toEqual({ kind: "mute" });
  });

  it("maps 5 to emote and everything else to other", () => {
    expect(k("Digit5")).toEqual({ kind: "emote" });
    expect(k("Numpad5")).toEqual({ kind: "emote" });
    expect(k("Enter", "Enter")).toEqual({ kind: "other" });
    expect(k("Space", " ")).toEqual({ kind: "other" });
  });

  it("ignores modifiers, shortcuts and focus keys", () => {
    expect(k("ShiftLeft", "Shift")).toEqual({ kind: "ignore" });
    expect(k("Tab", "Tab")).toEqual({ kind: "ignore" });
    expect(k("KeyR", "r", { metaKey: true })).toEqual({ kind: "ignore" });
    expect(k("ArrowUp", "ArrowUp", { ctrlKey: true })).toEqual({ kind: "ignore" });
  });

  it("lights the phone key for each direction", () => {
    expect(KEYPAD_FOR_DIR).toEqual({ U: "2", L: "4", R: "6", D: "8" });
  });
});
