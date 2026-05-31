---
name: playwright-code-generation
description: Generate Playwright Test code from confirmed specifications and test designs.
compatibility: opencode
---

# Playwright Code Generation Skill

## Rule

Generate tests from confirmed specifications only.

## Locator priority

1. `getByRole`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText`
5. `getByTestId`
6. `locator().filter()`
7. CSS selector only when unavoidable
8. Do not use XPath unless explicitly approved

## Process

1. Read `specs/screens` and `specs/flows`.
2. Write a plain spec first.
3. Run the test.
4. Review locators.
5. Extract POM only after the test is stable.
6. Run again after POM extraction.

## IndexedDB test setup

- Use `page.goto('/?reset=1&scenario=default')` or another explicit scenario URL when test data must be deterministic.
- Wait for a stable user-facing element such as the main heading before interacting with the page.
- Do not rely on data left by previous tests.
- When validating persistence, create data through the UI and assert the resulting UI state.
- Add reusable lessons to `qa-knowledge/playwright/`.
