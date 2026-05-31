---
name: test-design
description: Design smoke and regression tests from confirmed specifications.
compatibility: opencode
---

# Test Design Skill

## Process

1. Read confirmed screen and flow specs.
2. Choose the smallest valuable smoke path first.
3. Identify normal, empty, validation, and error states.
4. Prioritize tests by user impact and maintenance cost.
5. Save the design under `research/experiments/`.

## QA knowledge output

When a test design contains reusable knowledge, update the relevant file under `qa-knowledge/`.
For example:

- IndexedDB setup: `qa-knowledge/playwright/indexeddb-test-strategy.md`
- Locator rules: `qa-knowledge/playwright/locator-guidelines.md`
- QA viewpoints: `qa-knowledge/test-design/viewpoints.md`
- Quality scorecards: `qa-knowledge/quality-evaluation/scorecard-template.md`
