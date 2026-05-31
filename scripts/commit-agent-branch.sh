#!/usr/bin/env bash
set -euo pipefail

BRANCH="${AGENT_BRANCH:-agent/autonomous-research}"
BASE="${AGENT_BASE_BRANCH:-main}"
STATE_FILE=".agent/state.json"
PHASE="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('${STATE_FILE}','utf8')); console.log(s.phase || '')")"
HEAD_PHASE="$(git show "HEAD:${STATE_FILE}" 2>/dev/null | node -e "let input=''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => { try { const s=JSON.parse(input || '{}'); console.log(s.phase || ''); } catch { console.log(''); } });" || true)"

AGENT_PR_LABELS=("agent:owned" "agent:active")
AGENT_READY_LABEL="agent:ready-to-merge"
AGENT_BLOCKED_LABEL="agent:blocked"

ensure_agent_labels() {
  if ! command -v gh >/dev/null 2>&1; then
    return 0
  fi

  gh label create "agent:owned" --color "5319e7" --description "Managed by the autonomous QA research agent" >/dev/null 2>&1 || true
  gh label create "agent:active" --color "0e8a16" --description "Currently handled by the autonomous QA research agent" >/dev/null 2>&1 || true
  gh label create "agent:blocked" --color "b60205" --description "Agent PR is blocked and needs human review" >/dev/null 2>&1 || true
  gh label create "agent:ready-to-merge" --color "1d76db" --description "Agent PR passed review and quality gates" >/dev/null 2>&1 || true
}

apply_agent_labels() {
  local pr_number="$1"
  if [[ -z "$pr_number" || "$pr_number" == "null" ]]; then
    return 0
  fi

  local labels="agent:owned,agent:active"
  if [[ "$PHASE" == "IDLE" || "$PHASE" == "MERGE_PR" || "$PHASE" == "WAITING_FOR_MANUAL_MERGE" ]]; then
    labels=",${AGENT_READY_LABEL}"
    labels="agent:owned,agent:active,agent:ready-to-merge"
  fi

  if node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('${STATE_FILE}','utf8')); process.exit(s.blocked_until_user_review ? 0 : 1)"; then
    labels="${labels},${AGENT_BLOCKED_LABEL}"
  fi

  gh pr edit "$pr_number" --add-label "$labels" >/dev/null 2>&1 || true
}

if [[ "$PHASE" == "WAITING_FOR_MANUAL_MERGE" && "$HEAD_PHASE" == "WAITING_FOR_MANUAL_MERGE" ]]; then
  echo "Agent is already waiting for manual merge on HEAD. Skipping commit to avoid noisy PR updates."
  exit 0
fi

if [[ "$PHASE" == "WAITING_FOR_MANUAL_MERGE" ]]; then
  echo "Recording the first transition into WAITING_FOR_MANUAL_MERGE so the next tick does not repeat MERGE_PR."
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to commit."
  exit 0
fi

QUALITY_COMMAND=(npm run quality:check)
QUALITY_LABEL="mandatory full quality gate"

echo "Running $QUALITY_LABEL before pushing agent branch..."
if ! "${QUALITY_COMMAND[@]}"; then
  echo "$QUALITY_LABEL failed. Trying automatic formatter/fixer once, then re-running the full gate..."
  npm run quality:fix || true
  "${QUALITY_COMMAND[@]}"
fi

git add .
git commit -m "chore(agent): advance autonomous QA research cycle"
git push --set-upstream origin "$BRANCH"

RUNTIME_AUTO_MERGE_FILE=".agent/runtime-auto-merge.json"
if [[ -f "$RUNTIME_AUTO_MERGE_FILE" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "Runtime auto-merge was requested, but gh command is not available." >&2
    exit 1
  fi

  PR_NUMBER=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('${RUNTIME_AUTO_MERGE_FILE}','utf8')); console.log(p.pr_number || '')")
  MERGE_STRATEGY=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('${RUNTIME_AUTO_MERGE_FILE}','utf8')); console.log(p.strategy || 'squash')")

  if [[ -z "$PR_NUMBER" ]]; then
    echo "Runtime auto-merge file exists but pr_number is empty." >&2
    exit 1
  fi

  case "$MERGE_STRATEGY" in
    merge) STRATEGY_FLAG="--merge" ;;
    rebase) STRATEGY_FLAG="--rebase" ;;
    *) STRATEGY_FLAG="--squash" ;;
  esac

  echo "Running auto merge for PR #$PR_NUMBER after pushing final IDLE state..."
  gh pr merge "$PR_NUMBER" "$STRATEGY_FLAG" --auto --delete-branch
  echo "Auto merge command submitted for PR #$PR_NUMBER. No additional PR will be created from this tick."
  exit 0
fi

if [[ "$PHASE" != "REVIEW_PR" && "$PHASE" != "FIX_PR_REVIEW" && "$PHASE" != "RUN_PR_CHECKS" && "$PHASE" != "MERGE_PR" && "$PHASE" != "WAITING_FOR_MANUAL_MERGE" && "$PHASE" != "CLEANUP_BRANCH" ]]; then
  echo "Current phase is $PHASE. Skipping PR creation until CREATE_PR advances to REVIEW_PR."
  exit 0
fi

if command -v gh >/dev/null 2>&1; then
  ensure_agent_labels
  EXISTING_PR=$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number' || true)
  if [[ -z "$EXISTING_PR" || "$EXISTING_PR" == "null" ]]; then
    gh pr create \
      --base "$BASE" \
      --head "$BRANCH" \
      --title "chore(agent): autonomous QA research cycle" \
      --body-file ".agent/latest-summary.md" \
      --label "agent:owned" \
      --label "agent:active"
    CREATED_PR=$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number' || true)
    apply_agent_labels "$CREATED_PR"
  else
    apply_agent_labels "$EXISTING_PR"
    echo "Existing agent PR #$EXISTING_PR found. Updating branch only; no repetitive PR comment."
  fi
else
  echo "gh command is not available; skipped PR creation."
fi
