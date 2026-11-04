import { describe, expect, it } from "vitest";
import { actionForKey, isShareKey, KEYPAD_FOR_DIR } from "./keymap";

const k = (code: string, key = "x", extra: object = {}) => actionForKey({ code, key, ...extra });

describe("actionForKey", () => {
  it("gives each hot seat its own key set", () => {
    const cases: [string, number, string][] = [
      ["ArrowUp", 0, "U"],
      ["ArrowLeft", 0, "L"],
      ["ArrowDown", 0, "D"],
      ["ArrowRight", 0, "R"],
      ["KeyW", 1, "U"],
      ["KeyA", 1, "L"],
      ["KeyS", 1, "D"],
      ["KeyD", 1, "R"],
      ["KeyI", 2, "U"],
      ["KeyJ", 2, "L"],
      ["KeyK", 2, "D"],
      ["KeyL", 2, "R"],
      // Numpad as printed: 8 up, 2 down.
      ["Numpad8", 3, "U"],
      ["Numpad4", 3, "L"],
      ["Numpad2", 3, "D"],
      ["Numpad6", 3, "R"],
      // Number row as on the phone keypad: 2 up, 8 down.
      ["Digit2", 3, "U"],
      ["Digit4", 3, "L"],
      ["Digit8", 3, "D"],
      ["Digit6", 3, "R"],
    ];
    for (const [code, seat, dir] of cases) expect(k(code)).toEqual({ kind: "vote", seat, dir });
  });

  it("uses the physical key, so AZERTY's Z on KeyW still votes up for WASD", () => {
    expect(k("KeyW", "z")).toEqual({ kind: "vote", seat: 1, dir: "U" });
  });

  it("checks `key` first for * and #, so Shift+8 mutes and Shift+3 is inert", () => {
    expect(k("Digit8", "*")).toEqual({ kind: "mute" });
    expect(k("Digit3", "#")).toEqual({ kind: "other" });
    expect(k("NumpadMultiply", "*")).toEqual({ kind: "mute" });
    expect(k("KeyM", "m")).toEqual({ kind: "mute" });
  });

  it("maps Enter and Space to start, 5 to emote and everything else to other", () => {
    expect(k("Enter", "Enter")).toEqual({ kind: "start" });
    expect(k("NumpadEnter", "Enter")).toEqual({ kind: "start" });
    expect(k("Space", " ")).toEqual({ kind: "start" });
    expect(k("Digit5")).toEqual({ kind: "emote" });
    expect(k("Numpad5")).toEqual({ kind: "emote" });
    expect(k("KeyQ", "q")).toEqual({ kind: "other" });
  });

  it("reports Ctrl/Cmd+C as copy and ignores other shortcuts", () => {
    expect(k("KeyC", "c", { ctrlKey: true })).toEqual({ kind: "copy" });
    expect(k("KeyC", "c", { metaKey: true })).toEqual({ kind: "copy" });
    expect(k("KeyC", "c", { ctrlKey: true, altKey: true })).toEqual({ kind: "ignore" });
    expect(k("KeyC", "c")).toEqual({ kind: "other" });
    expect(k("ShiftLeft", "Shift")).toEqual({ kind: "ignore" });
    expect(k("Tab", "Tab")).toEqual({ kind: "ignore" });
    expect(k("KeyR", "r", { metaKey: true })).toEqual({ kind: "ignore" });
    expect(k("ArrowUp", "ArrowUp", { ctrlKey: true })).toEqual({ kind: "ignore" });
  });

  it("S is the share key (P2 down) and nothing else is", () => {
    expect(isShareKey(k("KeyS", "s"))).toBe(true);
    expect(isShareKey(k("ArrowDown"))).toBe(false);
    expect(isShareKey(k("KeyW"))).toBe(false);
    expect(isShareKey(k("Enter", "Enter"))).toBe(false);
  });

  it("lights the phone key for each direction", () => {
    expect(KEYPAD_FOR_DIR).toEqual({ U: "2", L: "4", R: "6", D: "8" });
  });
});
