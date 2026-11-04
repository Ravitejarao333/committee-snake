import { describe, expect, it } from "vitest";
import { checkPages, type Manifest, pageFiles } from "./budget.ts";

const manifest: Manifest = {
  "index.html": { file: "assets/hub.js", imports: ["_shared.js"] },
  "snake.html": { file: "assets/snake.js", imports: ["_shared.js", "_snake-only.js"] },
  "glass.html": { file: "assets/glass.js", dynamicImports: ["src/glass/prize.ts"] },
  "_shared.js": { file: "assets/shared.js", imports: ["_snake-only.js"] },
  "_snake-only.js": { file: "assets/snake-only.js", imports: ["_shared.js"] },
  "src/glass/prize.ts": { file: "assets/prize.js" },
};
const SIZES: Record<string, number> = {
  "assets/hub.js": 100,
  "assets/snake.js": 300,
  "assets/glass.js": 200,
  "assets/shared.js": 50,
  "assets/snake-only.js": 20,
  "assets/prize.js": 40,
};
const size = (f: string) => ({ raw: SIZES[f] ?? 0, gzip: Math.round((SIZES[f] ?? 0) / 2) });
const ALL = Object.keys(SIZES);

describe("pageFiles", () => {
  it("follows static imports transitively, through cycles, once each", () => {
    expect(pageFiles(manifest, "snake.html")).toEqual([
      "assets/snake.js",
      "assets/shared.js",
      "assets/snake-only.js",
    ]);
  });

  it("counts dynamic imports", () => {
    expect(pageFiles(manifest, "glass.html")).toEqual(["assets/glass.js", "assets/prize.js"]);
  });

  it("is empty for a missing entry", () => {
    expect(pageFiles(manifest, "nope.html")).toEqual([]);
  });
});

describe("checkPages", () => {
  const budgets = { "index.html": 200, "snake.html": 400, "glass.html": 300 };

  it("counts a shared chunk toward every page that loads it", () => {
    const { pages, errors } = checkPages(manifest, budgets, ALL, size);
    expect(errors).toEqual([]);
    const raw = Object.fromEntries(pages.map((p) => [p.page, p.raw]));
    // hub reaches shared.js, which imports snake-only.js.
    expect(raw).toEqual({ "index.html": 170, "snake.html": 370, "glass.html": 240 });
    expect(pages.find((p) => p.page === "glass.html")?.gzip).toBe(120);
  });

  it("names the page that is over budget", () => {
    const { errors } = checkPages(manifest, { ...budgets, "snake.html": 369 }, ALL, size);
    expect(errors).toEqual(["snake.html: 370 bytes is over its 369 budget"]);
  });

  it("fails a budgeted page missing from the manifest and a page with no budget", () => {
    const { errors } = checkPages(
      manifest,
      { "index.html": 200, "glass.html": 300, "glass2.html": 1 },
      ALL,
      size,
    );
    expect(errors).toContain("glass2.html: not in the build manifest");
    expect(errors).toContain("snake.html: no budget set");
  });

  it("fails JS that no budgeted page loads", () => {
    const { errors } = checkPages(manifest, budgets, [...ALL, "assets/stray.js"], size);
    expect(errors).toEqual(["assets/stray.js: not loaded by any budgeted page"]);
  });
});
