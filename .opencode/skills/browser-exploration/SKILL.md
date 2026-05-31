---
name: browser-exploration
description: Explore the web app with Playwright MCP browser tools before writing specifications or tests.
compatibility: opencode
---

# Browser Exploration Skill

## Rule

Do not write Playwright Test code before browser exploration.

## Process

1. Open the target URL.
2. Capture a browser snapshot.
3. List visible headings, landmarks, buttons, links, inputs, tables, dialogs, and messages.
4. Choose one interaction at a time.
5. Use click, type, select, and wait tools to operate the UI.
6. Capture another snapshot after every operation.
7. Record observed behavior, not guessed behavior.
8. Separate confirmed facts from assumptions.
9. Save the result under `specs/observed/`.

## IndexedDB research app notes

- The app has no authentication; do not invent login flows.
- Prefer reset URLs such as `/?reset=1&scenario=default` before exploration when a clean state is needed.
- Explore scenario datasets: `default`, `empty`, `large`, `validation`, `error`, and `slow` when the research task requires them.
- Observe pseudo role behavior through the in-app role selector, not through real login.
- Record data persistence and reset behavior in `specs/observed/` and reusable findings in `qa-knowledge/`.
