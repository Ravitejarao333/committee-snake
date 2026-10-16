// Fails the client build if the shipped JS exceeds the 40 KB budget (docs/PLAN.md).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = 40 * 1024;
const dir = join(import.meta.dirname, "..", "dist", "assets");
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
let raw = 0;
let gz = 0;
for (const f of files) {
  const buf = readFileSync(join(dir, f));
  raw += buf.length;
  gz += gzipSync(buf, { level: 9 }).length;
}
const line = `client JS: ${raw} bytes (${gz} gzip) in ${files.length} file(s); budget ${BUDGET}`;
if (raw > BUDGET) {
  console.error(`${line}\nOVER BUDGET by ${raw - BUDGET} bytes`);
  process.exit(1);
}
process.stdout.write(`${line}\n`);
