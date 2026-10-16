import { NICKNAME_RE } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { AUTO_START_MS, autoStartAt, claim, lobbyText, type Seats, seatIds } from "./seats";

describe("seats", () => {
  it("claims seats with key-set names, kept in seat order", () => {
    let s: Seats = [];
    s = claim(s, 2, 10);
    s = claim(s, 0, 20);
    s = claim(s, 3, 30);
    s = claim(s, 1, 40);
    expect(seatIds(s)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(s.map((x) => x.name)).toEqual(["ARROWS", "WASD", "IJKL", "NUMPAD"]);
    for (const x of s) expect(NICKNAME_RE.test(x.name)).toBe(true);
  });

  it("claim is idempotent and keeps the first claim time", () => {
    const once = claim([], 1, 100);
    const twice = claim(once, 1, 900);
    expect(twice).toBe(once);
    expect(twice[0]?.claimedAt).toBe(100);
  });

  it("lobby text counts players and offers Enter or a tap", () => {
    expect(lobbyText([], false)).toEqual([
      "COMMITTEE SNAKE",
      "",
      "PRESS A KEY TO JOIN.",
      "ENTER TO START",
    ]);
    expect(lobbyText(claim([], 0, 0), false)[2]).toBe("1 PLAYER. PRESS A KEY TO JOIN.");
    const three = claim(claim(claim([], 0, 0), 1, 0), 2, 0);
    expect(lobbyText(three, false)).toEqual([
      "COMMITTEE SNAKE",
      "",
      "3 PLAYERS. PRESS A KEY TO JOIN.",
      "ENTER TO START",
    ]);
    expect(lobbyText(three, true)[3]).toBe("TAP SCREEN TO START");
  });

  it("auto-starts 5 s after the second claim", () => {
    expect(autoStartAt([], 0)).toBeNull();
    const one = claim([], 0, 1000);
    expect(autoStartAt(one, 0)).toBeNull();
    const two = claim(one, 3, 2500);
    expect(autoStartAt(two, 0)).toBe(2500 + AUTO_START_MS);
    // A third claim doesn't push the start back.
    expect(autoStartAt(claim(two, 1, 4000), 0)).toBe(2500 + AUTO_START_MS);
  });

  it("auto-starts 5 s after lobby entry when seats carried over", () => {
    const two = claim(claim([], 0, 10), 1, 20);
    expect(autoStartAt(two, 60_000)).toBe(60_000 + AUTO_START_MS);
  });
});
