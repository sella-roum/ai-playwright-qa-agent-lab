export function promptForPhase(phase, state) {
  const common = `
You are running inside the ai-playwright-qa-agent-lab repository.
Current cycle: ${state.cycle_id}
Current phase: ${phase}

Always follow these rules:
- Do not put secrets, company data, personal data, or real customer data into files.
- Do not push directly to main.
- Keep the change small and targeted to the current phase.
- If browser exploration is required, use Playwright MCP browser tools, not prewritten exploration scripts.
- Separate confirmed observations from assumptions.
- Save outputs in the repository paths defined by the phase.
- The research app uses IndexedDB and has no authentication; use scenario reset URLs such as /?reset=1&scenario=default when relevant.
- Persist QA knowledge in qa-knowledge/, research findings in research/, and agent memory in .agent/.
- Do not create another PR while an agent PR is open; focus on reviewing, fixing, checking, and merging that PR.
- Before a PR can be merged, quality gates must pass: format, lint, typecheck, unit tests, repository validation, build, and Playwright tests.
`;

  const prompts = {
    SELECT_RESEARCH_TASK: `${common}
Read .agent/goals.md, .agent/memory.md, and research/experiments/001-ai-qa-agent-v0.1.md.
Select or refine the next small research task for this cycle.
Write the result to research/strategy/current-cycle-plan.md.
`,
    PLAN_APP_CHANGE: `${common}
Plan the smallest app change that supports the current research task.
Prefer app changes that increase QA knowledge coverage: IndexedDB state, CRUD, validation, pseudo roles, error injection, slow mode, search/filter/sort, or accessibility.
Do not implement it yet.
Write the plan to .agent/runs/current-app-change-plan.md.
`,
    IMPLEMENT_APP: `${common}
Implement the planned small change in apps/research-app.
Keep the app static, authentication-free, IndexedDB-based, and GitHub Pages compatible.
Do not introduce a server DB, login, token handling, or real external APIs.
After editing, ensure npm run build:research-app can pass.
Record the change in .agent/generated-app-history.md and update qa-knowledge/app-specs/ when the data model or behavior changes.
`,
    EXPLORE_WITH_BROWSER: `${common}
Use Playwright MCP browser tools to explore the research app.
Open the target URL from PLAYWRIGHT_TARGET_URL. The agent runner starts a local Vite preview server before this phase.
Use browser_snapshot first, then click/type/select tools.
Save observations to specs/observed/${state.cycle_id}.md.
Capture IndexedDB-related behavior, reset URL behavior, pseudo role behavior, and error/slow mode behavior when relevant.
Do not write tests in this phase.
`,
    WRITE_SPEC: `${common}
Read specs/observed/${state.cycle_id}.md if it exists.
Write screen and flow specifications based only on confirmed observations.
Save results under specs/screens/ and specs/flows/.
Also update qa-knowledge/app-specs/ when confirmed app behavior or data rules are reusable QA knowledge.
`,
    DESIGN_TESTS: `${common}
Read the confirmed specifications.
Design a small smoke test first.
Include test data strategy for IndexedDB reset URLs and scenario datasets.
Save the test design to research/experiments/${state.cycle_id}-test-design.md and reusable viewpoints to qa-knowledge/test-design/ when appropriate.
`,
    IMPLEMENT_PLAYWRIGHT: `${common}
Read the test design and confirmed specifications.
Implement Playwright Test code under tests/e2e/generated/.
Use IndexedDB reset URLs such as /?reset=1&scenario=default to make tests reproducible.
Prefer user-facing locators and Web First Assertions.
Do not use XPath.
Update qa-knowledge/playwright/ when you discover reusable locator, IndexedDB, or repair knowledge.
`,
    RUN_PLAYWRIGHT: `${common}
Prepare Playwright Test execution and make sure tests are runnable.
The agent runner executes npx playwright test --project=chromium after this phase.
Summarize any pre-run checks under .agent/runs/${state.cycle_id}-playwright-result.md.
`,
    REPAIR_IF_FAILED: `${common}
Inspect test-results, playwright-report, screenshots, traces, and logs if present.
Classify any failure before changing code.
Consider IndexedDB initialization, scenario dataset, pseudo role state, slow mode, and error mode as possible causes.
Apply the smallest fix and update .agent/known-failures.md and qa-knowledge/playwright/repair-patterns.md when the lesson is reusable.
`,
    REVIEW_QA_OUTPUT: `${common}
Evaluate specs, tests, locators, assertions, execution evidence, and QA knowledge updates.
Create a scorecard under research/scorecards/${state.cycle_id}.md using qa-knowledge/quality-evaluation/scorecard-template.md as the baseline.
This phase may write scorecards only; do not edit application or test code.
`,
    UPDATE_RESEARCH_MEMORY: `${common}
Update .agent/memory.md, .agent/skill-backlog.md, and the relevant qa-knowledge/ files with concrete lessons from this cycle.
Do not make large SKILL.md changes directly.
`,
    CREATE_PR: `${common}
Prepare a concise PR summary in .agent/runs/${state.cycle_id}-pr-summary.md.
The workflow script will create or update the PR only from this phase.
`,
    REVIEW_PR: `${common}
Review the current agent PR as an independent quality evaluator.
Read the diff, specs, qa-knowledge, Playwright tests, and latest execution evidence.
Create or update research/scorecards/pr-review.md.
The scorecard must include: summary, risks, required fixes, quality gate expectations, and these machine-readable lines:
- cycle_id: ${state.cycle_id}
- pr_number: ${state.current_pr || 'UNKNOWN'}
- reviewed_at: <ISO timestamp>
- merge_allowed: true or merge_allowed: false
Use merge_allowed: false when required fixes remain, when evidence is missing, when pr_number is UNKNOWN, or when quality gates should not proceed to merge.
The runner will reject stale scorecards whose cycle_id or pr_number does not match the current state.
Do not edit application or test code in this phase.
`,
    FIX_PR_REVIEW: `${common}
Fix the current agent PR based on research/scorecards/pr-review.md, failed quality checks, and PR check output.
Prefer the smallest safe change.
Run local checks where useful, but the runner will execute npm run quality:check after this phase.
Update .agent/known-failures.md and qa-knowledge/playwright/repair-patterns.md when the fix teaches a reusable lesson.
`,
    RUN_PR_CHECKS: `${common}
Prepare the current PR for quality gate execution.
Do not make broad changes.
The agent runner will execute npm run quality:check after this phase and route failures back to FIX_PR_REVIEW.
`,
    MERGE_PR: `${common}
Check whether the current agent PR is ready to merge.
Do not edit code.
The runner will merge only when quality checks pass, research/scorecards/pr-review.md contains merge_allowed: true, and AGENT_AUTO_MERGE is enabled.
`,
    WAITING_FOR_MANUAL_MERGE: `${common}
The current agent PR is ready but auto merge is disabled, or auto merge has been scheduled and the repository is waiting for required checks.
Do not edit code.
The runner will only observe PR state and will not create new commits while waiting.
`,
    CLEANUP_BRANCH: `${common}
Confirm the current PR was merged or closed, then summarize cleanup and next-cycle readiness.
Do not start a new feature in this phase.
`,
    IDLE: `${common}
Summarize current status and propose the next cycle.
Save it to .agent/runs/${state.cycle_id}-idle-summary.md.
`
  };

  return prompts[phase] || common;
}

export function agentForPhase(phase) {
  return (
    {
      SELECT_RESEARCH_TASK: 'research-director',
      PLAN_APP_CHANGE: 'research-director',
      IMPLEMENT_APP: 'app-builder',
      EXPLORE_WITH_BROWSER: 'browser-explorer',
      WRITE_SPEC: 'spec-writer',
      DESIGN_TESTS: 'test-designer',
      IMPLEMENT_PLAYWRIGHT: 'test-writer',
      RUN_PLAYWRIGHT: 'test-runner',
      REPAIR_IF_FAILED: 'repairer',
      REVIEW_QA_OUTPUT: 'quality-evaluator',
      UPDATE_RESEARCH_MEMORY: 'learner',
      CREATE_PR: 'research-director',
      REVIEW_PR: 'quality-evaluator',
      FIX_PR_REVIEW: 'repairer',
      RUN_PR_CHECKS: 'test-runner',
      MERGE_PR: 'research-director',
      WAITING_FOR_MANUAL_MERGE: 'research-director',
      CLEANUP_BRANCH: 'research-director',
      IDLE: 'research-director'
    }[phase] || 'research-director'
  );
}
