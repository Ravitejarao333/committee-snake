#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): format + safe-fix the one file just edited.
// Never blocks: leftover diagnostics go back to Claude as additionalContext.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let filePath;
try {
  filePath = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof filePath !== "string" || !existsSync(filePath)) process.exit(0);

const rel = relative(root, filePath);
if (rel.startsWith("..") || isAbsolute(rel)) process.exit(0); // outside the repo

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "biome",
    "check",
    "--write",
    "--no-errors-on-unmatched",
    "--files-ignore-unknown=true",
    "--colors=off",
    rel,
  ],
  { cwd: root, encoding: "utf8", timeout: 20_000 },
);

if (result.status !== 0 && result.status !== null) {
  const output = `${result.stderr}${result.stdout}`.trim().split("\n").slice(-40).join("\n");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Biome left diagnostics in ${rel} it could not auto-fix:\n${output}`,
      },
    }),
  );
}
process.exit(0);
