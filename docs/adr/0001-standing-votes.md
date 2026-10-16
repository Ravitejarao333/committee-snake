# 0001. Standing votes with 4-second expiry

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The game ticks 3–8 times per second. Humans cannot vote on every tick; a per-tick vote would make the snake feel random rather than funny, and would reward button-mashing.

## Decision

A player's vote **stays** until they change it. It **expires 4 seconds** after their last key press, at which point the seat is shown as "napping" and no longer counts. Votes for the reverse of the current direction never count and are displayed separately as "nonsense".

## Consequences

Steering feels intentional and the tally bars become the main animation. AFK players cannot silently steer. The 4-second value is a tunable and is the first thing to adjust if the M2 hot-seat test isn't funny.

Refined by [ADR 0007](0007-two-deep-vote-queue.md): the standing vote is now the head of a two-deep queue, so a second quick press is kept, not overwritten.
