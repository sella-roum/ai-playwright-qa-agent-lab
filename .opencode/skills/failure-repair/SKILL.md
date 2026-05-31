---
name: failure-repair
description: Diagnose and repair failed Playwright tests using logs, screenshots, reports, and traces.
compatibility: opencode
---

# Failure Repair Skill

## Process

1. Read the test error.
2. Check screenshots, trace, and HTML report when available.
3. Classify the failure.
4. Fix the smallest responsible artifact.
5. Re-run the affected test.
6. Record the cause and fix in `.agent/known-failures.md`.
7. If the same class of failure repeats, propose a skill update.

## IndexedDB-specific failure checks

Before editing tests or app code, check whether the failure is caused by:

- Missing `?reset=1` in the test URL
- Wrong scenario dataset
- Residual IndexedDB data from a previous run
- Pseudo role state left as `閲覧者`
- Error injection or slow mode left enabled

If the lesson is reusable, update `.agent/known-failures.md` and `qa-knowledge/playwright/repair-patterns.md`.
