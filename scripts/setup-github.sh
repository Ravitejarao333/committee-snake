#!/usr/bin/env bash
# One-time GitHub setup. Requires: gh (logged in), git, pnpm.
#   ./scripts/setup-github.sh <github-user-or-org> [public|private]
set -euo pipefail

OWNER="${1:?usage: $0 <owner> [public|private]}"
VISIBILITY="${2:-public}"
REPO="committee-snake"
cd "$(dirname "$0")/.."

echo "▶ Replacing CODEOWNERS / template placeholders with @$OWNER"
grep -rl Ravitejarao333 .github README.md CONTRIBUTING.md SECURITY.md 2>/dev/null \
  | xargs sed -i '' "s/Ravitejarao333/$OWNER/g" || true

if [ ! -d .git ]; then
  git init -b main
fi
pnpm install
git add -A
git commit -m "chore: bootstrap committee-snake monorepo" --no-verify || true

if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "▶ Repo $OWNER/$REPO already exists, pushing"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
else
  echo "▶ Creating repo $OWNER/$REPO ($VISIBILITY)"
  gh repo create "$OWNER/$REPO" --"$VISIBILITY" --source=. --remote=origin --push \
    --description "Classic phone Snake, except everyone votes on where it turns. Democracy was a mistake." \
    --homepage "https://committee-snake.pages.dev"
fi

echo "▶ Repo settings"
gh repo edit "$OWNER/$REPO" \
  --enable-issues --enable-discussions=false --enable-wiki=false --enable-projects=false \
  --delete-branch-on-merge --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --allow-update-branch --add-topic snake --add-topic multiplayer --add-topic cloudflare-workers \
  --add-topic durable-objects --add-topic typescript --add-topic browser-game

echo "▶ Security features"
gh api -X PATCH "repos/$OWNER/$REPO" -f security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"},"dependabot_security_updates":{"status":"enabled"}}' >/dev/null || true
gh api -X PUT "repos/$OWNER/$REPO/vulnerability-alerts" >/dev/null || true

echo "▶ Branch ruleset for main"
gh api -X POST "repos/$OWNER/$REPO/rulesets" --input - <<JSON >/dev/null
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "required_signatures" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "CI OK" },
          { "context": "Conventional Commits title" },
          { "context": "Analyze (javascript-typescript)" }
        ]
      }
    }
  ]
}
JSON

echo "▶ Labels"
for l in "bug:d73a4a" "enhancement:a2eeef" "triage:fbca04" "good first issue:7057ff" "security:b60205" "pinned:0e8a16" "dependencies:0366d6" "ci:ededed" "shared:1d76db" "server:1d76db" "client:1d76db"; do
  gh label create "${l%%:*}" --color "${l##*:}" --repo "$OWNER/$REPO" --force >/dev/null
done

echo "▶ Production environment (add Cloudflare secrets next)"
gh api -X PUT "repos/$OWNER/$REPO/environments/production" >/dev/null || true

cat <<MSG

✅ Done: https://github.com/$OWNER/$REPO

Next:
  gh secret set CLOUDFLARE_API_TOKEN  --env production --repo $OWNER/$REPO
  gh secret set CLOUDFLARE_ACCOUNT_ID --env production --repo $OWNER/$REPO

Tip: set required_approving_review_count to 1 in the ruleset once you have a collaborator.
MSG
