import { describe, expect, it } from "vitest";
import { MAX_CLIENT_MESSAGE_BYTES, parseClientMessage, ROOM_CODE_RE } from "./protocol";

describe("parseClientMessage", () => {
  it("accepts valid messages", () => {
    expect(parseClientMessage(JSON.stringify({ t: "vote", d: "U" }))).toEqual({ t: "vote", d: "U" });
    expect(parseClientMessage(JSON.stringify({ t: "hello", name: "SleepyCobra42" }))).toMatchObject({
      t: "hello",
    });
  });

  it("drops garbage, bad shapes, bad names and oversized payloads", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "vote", d: "X" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "hello", name: "a b" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "emote", e: 9 }))).toBeNull();
    expect(parseClientMessage("x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1))).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });
});

describe("ROOM_CODE_RE", () => {
  it("rejects lookalike characters", () => {
    expect(ROOM_CODE_RE.test("K7QP")).toBe(true);
    expect(ROOM_CODE_RE.test("K7Q1")).toBe(false);
    expect(ROOM_CODE_RE.test("I0OL")).toBe(false);
  });
});
