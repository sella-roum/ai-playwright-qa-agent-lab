import { existsSync } from 'node:fs';

const required = [
  'apps/research-app/package.json',
  'apps/research-app/src/main.tsx',
  'playwright.config.ts',
  '.agent/state.json',
  '.opencode/skills/browser-exploration/SKILL.md',
  'opencode.json',
  'tests/e2e/smoke/research-app-smoke.spec.ts',
  'qa-knowledge/README.md',
  'qa-knowledge/playwright/indexeddb-test-strategy.md',
  'qa-knowledge/quality-evaluation/scorecard-template.md',
  '.opencode/skills/pr-quality-cycle/SKILL.md',
  'tests/unit/agent-lib.test.mjs',
  'scripts/record-agent-tick-timeout.mjs',
  'scripts/commit-agent-branch.sh',
  '.github/workflows/agent-tick.yml',
  'eslint.config.js',
  'vitest.config.ts'
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error('Missing required files:');
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

console.log('Repository structure is valid.');
