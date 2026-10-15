# Security Policy

## Supported versions

Only the latest release on `main` is supported. The game has no accounts and stores no personal data beyond a nickname and a random session token in your browser's `localStorage`.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting:

**https://github.com/Ravitejarao333/committee-snake/security/advisories/new**

or email **raviteja.rao@softwareone.com** with the subject `committee-snake security`.

You'll get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for anything confirmed. Credit is given in the release notes unless you prefer otherwise.

## In scope

- Anything that lets a client control the game beyond casting one vote (the server is authoritative; if you can bypass that, we want to know).
- Message-handling bugs in `apps/server` (zod bypass, oversized payloads, resource exhaustion per room).
- Nickname filter bypasses that allow abusive content.
- Supply-chain issues in our dependencies or workflows.

## Out of scope

- "The committee voted badly." That's the game.
- Rate-limit tuning that doesn't lead to denial of service.

## Automated protections

CodeQL on every PR and weekly, Dependabot (grouped weekly updates + security updates), dependency review on PRs, secret scanning with push protection, and signed commits required on `main`.
