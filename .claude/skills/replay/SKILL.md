---
name: replay
description: Bug-repro tool (docs/PLAN.md §6.3). Given a round seed and a per-tick vote log (JSON), replays the pure sim with scripts/replay.ts and prints the tick-by-tick state, events, death cause, fatal tally and final board. Use when a bug report or failing test includes a seed and votes, or to explain why a snake died.
argument-hint: <log.json> | <seed> <votes-json>
allowed-tools: Bash(pnpm replay *), Bash(node --experimental-strip-types scripts/replay.ts *)
---

# replay

Input: `$ARGUMENTS`

## 1. Get a log file

The log format (`scripts/replay.example.json` is a working example):

```json
{
  "seed": 42,
  "rules": { "wrap": false, "mode": "democracy" },
  "votes": [{ "alice": "U", "bob": "U" }, { "alice": "U" }, {}]
}
```

- `votes[i]` is the **live** vote map (expired votes already removed) passed to `step` for tick `i + 1`. Standing votes repeat on every tick they're live.
- `rules` is optional and is merged over `DEFAULT_RULES` (unknown keys are rejected).
- If you're given a path, use it. If you're given a seed and votes inline, write them to a temp file in that shape (e.g. `/tmp/replay-<seed>.json`). Don't commit it.

## 2. Run

```bash
pnpm replay <log.json>            # tick lines + death summary + final board
pnpm replay <log.json> --board    # also print the board after every tick
pnpm replay - < log.json          # read from stdin
```

`pnpm replay` is `node --experimental-strip-types scripts/replay.ts` and runs the real `packages/shared` code with no build step. The RNG stream is `mulberry32(seed)` → `createGame` → `step` per tick, the same order the room uses. A mismatch with what players saw therefore means the room deviated from that order, or the log is missing ticks.

## 3. Report

- The death line: tick, cause (`wall`/`self`), fatal direction, the fatal tally (`U/D/L/R/nonsense`) and who voted for it.
- The ticks around the problem (the last ~5 before death, or the first tick where the state looks wrong), plus the final board.
- If the snake survives the log, or there is a `note: … ignored` line, say so; that usually means the log is truncated or desynced.
- If this reproduces a bug, the fix goes in `packages/shared` (sim-engineer) with a regression test that replays this exact `(seed, votes)` pair, per CONTRIBUTING.md.
