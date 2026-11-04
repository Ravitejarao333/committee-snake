import { describe, expect, it } from "vitest";
import {
  FLASH_MS,
  flashAlpha,
  SHAKE_MS,
  SLOWMO_MS,
  SLOWMO_SCALE,
  shakeAmp,
  timeScaleAt,
} from "./fx";

describe("glass fx envelopes", () => {
  it("shakes up to 6 px times strength, decaying to nothing in 40 ms", () => {
    expect(SHAKE_MS).toBe(40);
    expect(shakeAmp(0, 1)).toBeCloseTo(6);
    expect(shakeAmp(0, 0.5)).toBeCloseTo(3);
    expect(shakeAmp(20, 1)).toBeLessThan(shakeAmp(10, 1));
    expect(shakeAmp(SHAKE_MS, 1)).toBe(0);
    expect(shakeAmp(-1, 1)).toBe(0);
  });

  it("slows time to 0.4 for 300 ms, then runs at full speed", () => {
    expect(timeScaleAt(0)).toBe(SLOWMO_SCALE);
    expect(timeScaleAt(SLOWMO_MS - 1)).toBe(0.4);
    expect(timeScaleAt(SLOWMO_MS)).toBe(1);
    expect(timeScaleAt(Number.POSITIVE_INFINITY)).toBe(1);
    expect(timeScaleAt(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it("flashes bright and fades out in 120 ms", () => {
    expect(flashAlpha(0)).toBeGreaterThan(0.8);
    expect(flashAlpha(FLASH_MS / 2)).toBeLessThan(flashAlpha(0));
    expect(flashAlpha(FLASH_MS)).toBe(0);
  });
});
