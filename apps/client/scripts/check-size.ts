// Fails the client build if any page's JS exceeds its budget (ADR 0008). Run after `vite build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { checkPages, type Manifest } from "./budget.ts";

const KB = 1024;
/** Raw (minified, not gzipped) JS bytes per HTML entry. */
const BUDGETS: Record<string, number> = {
  "index.html": 15 * KB,
  "snake.html": 40 * KB,
};

const dist = join(import.meta.dirname, "..", "dist");
const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8")) as Manifest;
const allJs = readdirSync(join(dist, "assets"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => `assets/${f}`);
const { pages, errors } = checkPages(manifest, BUDGETS, allJs, (file) => {
  const buf = readFileSync(join(dist, file));
  return { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
});

for (const p of pages) {
  process.stdout.write(
    `${p.page.padEnd(12)} ${String(p.raw).padStart(6)} bytes (${p.gzip} gzip) ` +
      `in ${p.files.length} file(s); budget ${p.budget}\n`,
  );
}
if (errors.length) {
  for (const e of errors) process.stderr.write(`OVER BUDGET: ${e}\n`);
  process.exit(1);
}
