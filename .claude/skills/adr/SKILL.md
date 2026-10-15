---
name: adr
description: Create the next-numbered Architecture Decision Record from docs/adr/0000-template.md and add it to the index table in docs/adr/README.md. Use when a change makes a design decision that is expensive to reverse, or alters a decision in docs/PLAN.md §10.
argument-hint: <decision title>
allowed-tools: Bash(ls docs/adr*), Bash(date *)
---

# adr

Title: `$ARGUMENTS` (if empty, ask for a one-line decision title).

1. **Number:** list `docs/adr/` and take the highest `NNNN-*.md` plus one, zero-padded to 4 digits (`0000-template.md` is not a record).
2. **Filename:** `docs/adr/NNNN-<kebab-case-title>.md`, lowercase ASCII only, short (e.g. `0005-json-over-websocket.md`).
3. **Content:** copy `docs/adr/0000-template.md` exactly and fill it in:
   - `# NNNN. <Title>` (sentence case, matching the existing ADRs)
   - `**Status:** Proposed`, unless the user says it is already accepted
   - `**Date:**` today, `YYYY-MM-DD`
   - *Context*, *Decision* and *Consequences* from the conversation. Keep each to a few sentences like 0001–0004, and cite `docs/PLAN.md §x.y` where relevant. Don't invent rationale; if something's unknown, leave a `TODO:` and say so.
4. **Index:** append a row to the table in `docs/adr/README.md`, in number order:
   `| [NNNN](NNNN-<slug>.md) | <one-line decision> | Proposed |`
5. **Superseding:** if this replaces an earlier ADR, don't delete or rewrite that one. Set its status to `Superseded by NNNN` (in the file and the README row). If PLAN.md §10 changes too, update that table in the same commit.
6. Show the new file and the README diff, then suggest the commit `docs: add ADR NNNN <title>`. Biome doesn't check Markdown, so match the existing ADRs' formatting by hand.
