import { afterEach, describe, expect, it, vi } from "vitest";
import { buzz } from "./haptics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buzz", () => {
  it("is a no-op where vibrate is missing (iOS Safari)", () => {
    vi.stubGlobal("navigator", {});
    expect(buzz([12, 30, 20])).toBe(false);
  });

  it("passes the pattern through where vibrate exists", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    expect(buzz([12, 30, 20])).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([12, 30, 20]);
  });

  it("swallows a throwing vibrate", () => {
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(buzz(10)).toBe(false);
  });
});
