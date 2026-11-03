---
name: kickoff
description: Session start. Prints milestone status from README, live /health, open PRs (with check status) and issues, the last 6 workflow runs, the latest CI/Deploy/Release results and the next milestone with its docs/PLAN.md §7 row, in under 30 lines. Run first in every new session; context does not carry over between sessions.
allowed-tools: Bash(git *), Bash(gh *), Bash(curl *), Bash(grep *), Bash(awk *), Bash(test *), Bash(echo *), Bash(tr *)
---

# kickoff

Read-only. Don't fix, merge or edit anything here; report, then wait for instructions.

## 1. Gather

Run this block from the repo root in **one** Bash call:

```bash
git fetch -q --prune
echo "BRANCH $(git branch --show-current) ($(test -z "$(git status --porcelain)" && echo clean || echo dirty)), origin/main $(git log -1 --format='%h %s' origin/main)"
echo "MILESTONES $(grep -E '^\| M[0-9]' README.md | awk -F'|' '{gsub(/ /,"",$2); s=$4; gsub(/^ +| +$/,"",s); printf "%s %s  ", $2, (s==""?"-":s)}')"
echo "LIVE $(curl -s -m 10 -w ' HTTP %{http_code}' https://committee-snake.ravitejarao333.workers.dev/health || echo 'unreachable')"
echo "PRS (open, max 8)"
gh pr list --state open --limit 8 --json number,title,statusCheckRollup -q '.[] | "  #\(.number) \(.title) [\([.statusCheckRollup[] | select((.conclusion // .state) as $c | ["SUCCESS","SKIPPED","NEUTRAL"] | index($c) | not) | .name] | if length == 0 then "green" else "not green: " + join(", ") end)]"'
echo "ISSUES (open, max 5)"
gh issue list --state open --limit 5 --json number,title -q '.[] | "  #\(.number) \(.title)"'
echo "RUNS (last 6)"
gh run list --limit 6 --json workflowName,conclusion,status,headBranch,event,createdAt -q '.[] | "  \(.conclusion // .status) \(.workflowName) \(.headBranch) \(.event) \(.createdAt[:10])"'
echo "LATEST $(for w in ci.yml deploy.yml release-please.yml; do gh run list --workflow "$w" --branch main --limit 1 --json conclusion,status,createdAt -q ".[] | \"$w \(.conclusion // .status) \(.createdAt[:10])\""; done | tr "\n" " ")"
```

## 2. Next milestone

The next milestone is the first README Milestones row whose status is not ✅. Print its row from `docs/PLAN.md` §7 (`grep -E '^\| \*\*M<n>\*\*' docs/PLAN.md`) and any open issue whose title starts with `M<n>:`.

## 3. Report

Print the block output verbatim, then:

```
NEXT M<n> <goal>. Done when: <PLAN.md §7 "Done when" cell> (docs/PLAN.md §7)
```

Keep the whole report under 30 lines. If `gh` list commands hit their limits, add `(+more: gh pr list)`. Add at most one line of flags, only for:

- `LIVE` not `HTTP 200`
- a `failure` on `main` in `LATEST`. Release fails while the repo setting "Allow GitHub Actions to create and approve pull requests" is off, which is a known state and the user's call
- a dirty tree, or a branch other than `main`
