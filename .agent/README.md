# Agent directory

This directory contains the AI agent's state, memory, blockers, and operational metadata.

## State file

`.agent/state.json` tracks the current phase, cycle, and blocking state.

```json
{
  "phase": "SELECT_RESEARCH_TASK",
  "cycle_id": "cycle-0001",
  "blocked_until_user_review": false,
  "consecutive_failures": 0
}
```

## Memory and learning

- `memory.md`: Persistent agent memory across cycles
- `skill-backlog.md`: Skill improvement candidates
- `model-scoreboard.md`: Model performance records
- `goals.md`: Research goals
- `rules.md`: Agent operational rules
- `known-failures.md`: Known failure patterns

## Blocker records

`.agent/blockers/` contains markdown files that describe why the agent stopped.
When a blocker exists, the agent branch creates or updates a PR so that a human can review the failure.

## App roadmap

- `app-roadmap.md`: Planned improvements for the research app
- `qa-roadmap.md`: Planned QA test coverage expansion
- `generated-app-history.md`: Record of app changes by cycle

## Directives

`.agent/directives/` contains per-cycle or per-phase instructions for the agent.

## Agent Tick PR visibility

Agent Tick creates or updates an agent PR once a reviewable phase starts, such as planning, browser exploration, specification writing, test design, or Playwright implementation.

The initial task-selection phase may not create a PR unless a blocker is recorded.

If the agent times out or becomes blocked, the blocker is committed under `.agent/blockers/` and the agent PR is created or updated so that a human can review the failure.

## Agent Tick quality gates

Agent Tick uses a lightweight check for documentation, state, and blocker-only updates.

Full quality checks are still required when application code, tests, scripts, package files, Playwright config, TypeScript config, or workflow files change.

The PR Check workflow remains the final full quality gate before merge.
