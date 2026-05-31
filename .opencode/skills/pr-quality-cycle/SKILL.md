---
name: pr-quality-cycle
description: Review, repair, verify, and merge autonomous agent PRs without creating excessive PRs.
compatibility: opencode
---

# PR quality cycle

## Rules

- Keep at most one active agent PR.
- Do not start a new research cycle while an agent PR is open.
- Treat quality gate failures as repair input, not as permission to create another PR.
- Do not mark a PR as merge-ready unless format, lint, typecheck, unit tests, repository validation, build, and Playwright tests are expected to pass.
- If the same PR check class fails repeatedly, stop and request human review.

## Review checklist

1. Read the PR diff and cycle summary.
2. Verify the app change, specs, tests, qa-knowledge updates, and research scorecard are consistent.
3. Check locator quality, IndexedDB reset strategy, and flaky risk.
4. Write `research/scorecards/pr-review.md`.
5. Include `merge_allowed: true` only when no blocking concerns remain.
