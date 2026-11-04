import { describe, expect, it } from "vitest";
import { defaultMuted } from "./audio";

describe("defaultMuted", () => {
  it("honours the stored preference, else mutes touch-only devices", () => {
    expect(defaultMuted("1", false)).toBe(true);
    expect(defaultMuted("0", true)).toBe(false);
    expect(defaultMuted(null, true)).toBe(true);
    expect(defaultMuted(null, false)).toBe(false);
    expect(defaultMuted("junk", false)).toBe(false);
  });
});
