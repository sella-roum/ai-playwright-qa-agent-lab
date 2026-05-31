---
name: app-generation
description: Build and evolve the static research app used by the AI QA agent.
compatibility: opencode
---

# App Generation Skill

## Goal

Create small, testable UI changes in `apps/research-app` so the AI QA agent can practice exploration, specification writing, Playwright implementation, and repair.

## Process

1. Read `.agent/app-roadmap.md` and the current research issue.
2. Choose one small UI behavior to add or refine.
3. Keep the app static and GitHub Pages compatible.
4. Do not add real credentials, company data, personal data, or external service calls.
5. Build the app after changes.
6. Record what changed in `.agent/generated-app-history.md` or the current run log.
