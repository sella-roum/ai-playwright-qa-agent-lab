#!/usr/bin/env bash
set -euo pipefail

BRANCH="${AGENT_BRANCH:-agent/autonomous-research}"
BASE="${AGENT_BASE_BRANCH:-main}"
STATE_FILE=".agent/state.json"
PHASE="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('${STATE_FILE}','utf8')); console.log(s.phase || '')")"
HEAD_PHASE="$(git show "HEAD:${STATE_FILE}" 2>/dev/null | node -e "let input=''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => { try { const s=JSON.parse(input || '{}'); console.log(s.phase || ''); } catch { console.log(''); } });" || true)"

BLOCKED_UNTIL_USER_REVIEW="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('${STATE_FILE}','utf8')); console.log(s.blocked_until_user_review === true ? 'true' : 'false')")"
CYCLE_ID="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('${STATE_FILE}','utf8')); console.log(s.cycle_id || '')")"
CONSECUTIVE_FAILURES="$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('${STATE_FILE}','utf8')); console.log(s.consecutive_failures || '0')")"

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
    labels="${labels},${AGENT_READY_LABEL}"
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

# === Conditional quality gate ===
# Determine if full quality gate is needed based on changed file types
CHANGED_FILES="$(git status --porcelain | awk '{print $NF}')"

NEEDS_FULL_QUALITY="false"
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  case "$file" in
    apps/*|tests/*|package.json|package-lock.json|pnpm-lock.yaml|vite.config.*|playwright.config.*|tsconfig*.json|eslint.config.*|scripts/*.mjs|scripts/*.js|.github/workflows/*)
      NEEDS_FULL_QUALITY="true"
      ;;
  esac
done <<< "$CHANGED_FILES"

if [[ "$NEEDS_FULL_QUALITY" == "true" ]]; then
  echo "Running full quality gate before pushing agent branch..."
  if ! npm run quality:check; then
    echo "Full quality gate failed. Trying automatic formatter/fixer once, then re-running..."
    npm run quality:fix || true
    npm run quality:check
  fi
else
  echo "Docs/state-only changes detected. Skipping full quality gate for this agent tick."
  npm run format:check
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

# === PR creation decision ===
# Reviewable phases: phases where intermediate agent output is useful to review
REVIEWABLE_PHASES=" PLAN_APP_CHANGE IMPLEMENT_APP EXPLORE_WITH_BROWSER WRITE_SPEC DESIGN_TESTS IMPLEMENT_PLAYWRIGHT RUN_PLAYWRIGHT REVIEW_QA_OUTPUT UPDATE_RESEARCH_MEMORY CREATE_PR REVIEW_PR FIX_PR_REVIEW RUN_PR_CHECKS MERGE_PR WAITING_FOR_MANUAL_MERGE CLEANUP_BRANCH "

HAS_BLOCKER="false"
if ls .agent/blockers/*.md >/dev/null 2>&1; then
  HAS_BLOCKER="true"
fi

SHOULD_OPEN_OR_UPDATE_PR="false"
if [[ "$REVIEWABLE_PHASES" == *" $PHASE "* ]]; then
  SHOULD_OPEN_OR_UPDATE_PR="true"
fi
if [[ "$BLOCKED_UNTIL_USER_REVIEW" == "true" || "$HAS_BLOCKER" == "true" ]]; then
  SHOULD_OPEN_OR_UPDATE_PR="true"
fi

if [[ "$SHOULD_OPEN_OR_UPDATE_PR" != "true" ]]; then
  echo "Current phase is $PHASE. Not a reviewable phase and no blocker. Skipping PR creation."
  exit 0
fi

# === PR body generation ===
PR_BODY_FILE=".agent/pr-body.md"
{
  echo "## Agent status"
  echo ""
  echo "- Current phase: ${PHASE}"
  echo "- Cycle id: ${CYCLE_ID}"
  echo "- Blocked until user review: ${BLOCKED_UNTIL_USER_REVIEW}"
  echo "- Consecutive failures: ${CONSECUTIVE_FAILURES}"
  echo ""
  echo "## Latest summary"
  echo ""
  if [[ -f .agent/latest-summary.md ]]; then
    cat .agent/latest-summary.md
  else
    echo "No latest summary available."
  fi
  echo ""
  echo "## Blockers"
  echo ""
  if ls .agent/blockers/*.md >/dev/null 2>&1; then
    for blocker_file in .agent/blockers/*.md; do
      echo "- \`${blocker_file}\`"
    done
  else
    echo "No blockers."
  fi
  echo ""
  echo "## Review focus"
  echo ""
  echo "- Verify whether the agent's current phase output is useful."
  echo "- Check blockers first if present."
  echo "- Do not merge if the branch is blocked or quality checks are failing."
} > "$PR_BODY_FILE"

# === PR creation or update ===
if command -v gh >/dev/null 2>&1; then
  ensure_agent_labels
  EXISTING_PR=$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number' || true)
  if [[ -z "$EXISTING_PR" || "$EXISTING_PR" == "null" ]]; then
    gh pr create \
      --base "$BASE" \
      --head "$BRANCH" \
      --title "chore(agent): autonomous QA research cycle" \
      --body-file "$PR_BODY_FILE" \
      --label "agent:owned" \
      --label "agent:active"
    CREATED_PR=$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number' || true)
    apply_agent_labels "$CREATED_PR"
  else
    apply_agent_labels "$EXISTING_PR"
    gh pr edit "$EXISTING_PR" --body-file "$PR_BODY_FILE" >/dev/null 2>&1 || true
    echo "Existing agent PR #$EXISTING_PR found. Updated PR body and branch."
  fi
else
  echo "gh command is not available; skipped PR creation."
fi
