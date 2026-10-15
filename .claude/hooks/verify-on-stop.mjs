#!/usr/bin/env node
// Stop: refuse to finish on a red tree. Runs `pnpm typecheck && pnpm test`;
// on failure, exit 2 feeds the tail of the output back to Claude so it keeps
// working. If Claude is already continuing because of this hook and the tree
// is still red, let it stop but warn the user instead of looping forever.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let alreadyBlocked = false;
try {
  alreadyBlocked = JSON.parse(readFileSync(0, "utf8"))?.stop_hook_active === true;
} catch {
  // no/invalid stdin: treat as a normal stop
}

const run = (script) =>
  spawnSync("pnpm", ["--silent", script], {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });

for (const script of ["typecheck", "test"]) {
  const r = run(script);
  if (r.status === 0) continue;

  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-60).join("\n");
  const summary = `\`pnpm ${script}\` failed${r.error ? ` (${r.error.message})` : ""}`;

  if (alreadyBlocked) {
    process.stdout.write(
      JSON.stringify({ systemMessage: `⚠ Tree is still red: ${summary}. Run \`pnpm check\`.` }),
    );
    process.exit(0);
  }
  process.stderr.write(`${summary}. Fix it before finishing, or explain why.\n\n${tail}\n`);
  process.exit(2);
}
process.exit(0);
