import { describe, expect, it } from "vitest";
import { defaultMuted, EDGE_MS, GAIN, SOUNDS } from "./audio";

const total = (name: keyof typeof SOUNDS): number => SOUNDS[name].reduce((s, n) => s + n.ms, 0);

describe("SOUNDS (docs/PLAN.md §2.4)", () => {
  it("vote blip is 30 ms at 880 Hz and the turn tick is 20 ms at 440 Hz", () => {
    expect(SOUNDS.vote).toEqual([{ hz: 880, ms: 30 }]);
    expect(SOUNDS.turn).toEqual([{ hz: 440, ms: 20 }]);
  });

  it("eat is a two-note up chirp, 660 then 990 Hz", () => {
    expect(SOUNDS.eat.map((n) => n.hz)).toEqual([660, 990]);
    expect(total("eat")).toBe(120);
  });

  it("bonus is 3 rapid 1320 Hz beeps, 40 ms on / 40 ms off", () => {
    expect(SOUNDS.bonus.filter((n) => n.hz === 1320)).toHaveLength(3);
    expect(SOUNDS.bonus.every((n) => n.ms === 40)).toBe(true);
    expect(SOUNDS.bonus.map((n) => n.hz)).toEqual([1320, 0, 1320, 0, 1320]);
  });

  it("death descends over 4 notes, and the blame dun is low", () => {
    const hz = SOUNDS.death.map((n) => n.hz);
    expect(hz).toEqual([494, 440, 392, 330]);
    expect(SOUNDS.death.map((n) => n.ms)).toEqual([150, 150, 150, 300]);
    expect(SOUNDS.dun).toEqual([{ hz: 110, ms: 250 }]);
  });

  it("every note is long enough for the click-free attack and release", () => {
    for (const notes of Object.values(SOUNDS)) {
      for (const n of notes) expect(n.ms).toBeGreaterThan(2 * EDGE_MS);
    }
    expect(GAIN).toBeLessThanOrEqual(0.1);
  });
});

describe("defaultMuted", () => {
  it("honours the stored preference, else mutes touch-only devices", () => {
    expect(defaultMuted("1", false)).toBe(true);
    expect(defaultMuted("0", true)).toBe(false);
    expect(defaultMuted(null, true)).toBe(true);
    expect(defaultMuted(null, false)).toBe(false);
    expect(defaultMuted("junk", false)).toBe(false);
  });
});
