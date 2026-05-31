#!/usr/bin/env bash
set -euo pipefail

BRANCH="${AGENT_BRANCH:-agent/autonomous-research}"

git fetch origin "$BRANCH" || true
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git switch "$BRANCH"
  git pull --rebase origin "$BRANCH" || true
else
  git switch -c "$BRANCH"
fi
