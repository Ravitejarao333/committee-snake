import { describe, expect, it } from "vitest";
import {
  advance,
  BLAME_MS,
  COUNTDOWN_MS,
  canSkip,
  canStart,
  countdown,
  countdownDigit,
  dying,
  lobby,
  powerAt,
  visibleAt,
} from "./phase";

describe("phase machine", () => {
  it("lobby waits for a key", () => {
    expect(advance(lobby(0), 1e9).name).toBe("lobby");
    expect(canStart(lobby(0))).toBe(true);
    expect(canStart({ name: "blame", since: 0 })).toBe(false);
    expect(canStart(countdown(0))).toBe(false);
    expect(canStart({ name: "playing", since: 0 })).toBe(false);
  });

  it("countdown lasts power-on + 3 x 700 ms, then plays", () => {
    expect(COUNTDOWN_MS).toBe(2400);
    expect(advance(countdown(1000), 3399).name).toBe("countdown");
    const p = advance(countdown(1000), 3400);
    expect(p).toEqual({ name: "playing", since: 3400 });
    expect(advance(p, 1e9)).toBe(p);
  });

  it("shows 3-2-1 after the power-on ramp", () => {
    const c = countdown(0);
    expect(countdownDigit(c, 299)).toBeNull();
    expect(countdownDigit(c, 300)).toBe(3);
    expect(countdownDigit(c, 999)).toBe(3);
    expect(countdownDigit(c, 1000)).toBe(2);
    expect(countdownDigit(c, 1700)).toBe(1);
    expect(countdownDigit(c, 2399)).toBe(1);
    expect(countdownDigit(dying(0), 10)).toBeNull();
  });

  it("powers the LCD on from 0 to 1 over 300 ms", () => {
    const c = countdown(0);
    expect(powerAt(c, 0)).toBe(0);
    expect(powerAt(c, 150)).toBe(0.5);
    expect(powerAt(c, 300)).toBe(1);
    expect(powerAt(c, -5)).toBe(0);
    expect(powerAt(lobby(0), 0)).toBe(1);
  });

  it("dying freezes 600 ms and blinks 3 times (100 off / 100 on)", () => {
    const d = dying(0);
    const seen = [0, 50, 100, 150, 200, 300, 400, 500, 599].map((t) => visibleAt(d, t));
    expect(seen).toEqual([false, false, true, true, false, true, false, true, true]);
    expect(advance(d, 599).name).toBe("dying");
    expect(advance(d, 600)).toEqual({ name: "blame", since: 600 });
    expect(visibleAt({ name: "playing", since: 0 }, 50)).toBe(true);
  });

  it("blame shows 6 s then returns to the lobby; skippable after 1.5 s", () => {
    const b = { name: "blame", since: 1000 } as const;
    expect(BLAME_MS).toBe(6000);
    expect(advance(b, 6999)).toBe(b);
    expect(advance(b, 7000)).toEqual({ name: "lobby", since: 7000 });
    expect(canSkip(b, 2499)).toBe(false);
    expect(canSkip(b, 2500)).toBe(true);
    expect(canSkip(lobby(0), 1e9)).toBe(false);
  });
});
