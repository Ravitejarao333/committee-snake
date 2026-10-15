import { MAX_CLIENT_MESSAGE_BYTES } from "@committee-snake/shared";
import { describe, expect, it } from "vitest";
import { withinByteCap } from "./limits";

describe("withinByteCap", () => {
  it("accepts ASCII up to the cap and rejects one byte over", () => {
    expect(withinByteCap("x".repeat(MAX_CLIENT_MESSAGE_BYTES))).toBe(true);
    expect(withinByteCap("x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1))).toBe(false);
  });

  it("counts UTF-8 bytes, not UTF-16 units", () => {
    // "é" is 1 UTF-16 unit but 2 UTF-8 bytes; "🐍" is 2 units and 4 bytes.
    expect(withinByteCap("é".repeat(MAX_CLIENT_MESSAGE_BYTES / 2))).toBe(true);
    expect(withinByteCap("é".repeat(MAX_CLIENT_MESSAGE_BYTES / 2 + 1))).toBe(false);
    expect(withinByteCap("🐍".repeat(MAX_CLIENT_MESSAGE_BYTES / 4 + 1))).toBe(false);
  });

  it("measures binary frames by byteLength", () => {
    expect(withinByteCap(new ArrayBuffer(MAX_CLIENT_MESSAGE_BYTES))).toBe(true);
    expect(withinByteCap(new ArrayBuffer(MAX_CLIENT_MESSAGE_BYTES + 1))).toBe(false);
  });
});
