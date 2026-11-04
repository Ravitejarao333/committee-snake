import { describe, expect, it } from "vitest";
import worker, { movedTo } from "./redirect";

describe("old-host redirect", () => {
  it("keeps the path and query and swaps only the Worker name", () => {
    expect(movedTo("https://committee-snake.ravitejarao333.workers.dev/glass?x=1#99")).toBe(
      "https://cheap-thrills.ravitejarao333.workers.dev/glass?x=1#99",
    );
    expect(movedTo("https://committee-snake.someone.workers.dev/")).toBe(
      "https://cheap-thrills.someone.workers.dev/",
    );
  });

  it("always lands on https without a port", () => {
    expect(movedTo("http://committee-snake.a.workers.dev:8080/snake")).toBe(
      "https://cheap-thrills.a.workers.dev/snake",
    );
  });

  it("answers every request with a 301", () => {
    const res = worker.fetch(new Request("https://committee-snake.a.workers.dev/room/ABCD"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://cheap-thrills.a.workers.dev/room/ABCD");
  });
});
