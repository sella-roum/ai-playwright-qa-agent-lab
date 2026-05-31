import { readFile, writeFile } from 'node:fs/promises';
import {
  append,
  ensureDir,
  incrementCycleId,
  nextPhase,
  nowIso,
  readJson,
  runCommandAllowFailure,
  safeStamp,
  startCommand,
  todayUtc,
  waitForUrl,
  writeJson
} from './agent-lib.mjs';
import { agentForPhase, promptForPhase } from './agent-prompts.mjs';

const statePath = '.agent/state.json';
const state = await readJson(statePath);
const startedAt = nowIso();
const stamp = safeStamp(startedAt);
let phase = state.phase || 'SELECT_RESEARCH_TASK';
let agent = agentForPhase(phase);
let prompt;
const runDir = `.agent/runs/${stamp}`;
await ensureDir(runDir);
await ensureDir('specs/observed');
await ensureDir('research/scorecards');
await ensureDir('research/external-updates');
await ensureDir('.agent/knowledge');

const command = process.env.AGENT_COMMAND || 'run-next';
const supportedCommands = new Set(['run-next', 'pause', 'resume', 'refresh-knowledge', 'summarize']);
if (!supportedCommands.has(command)) {
  throw new Error(
    `Unsupported AGENT_COMMAND: ${command}. Supported commands: ${Array.from(supportedCommands).join(', ')}`
  );
}

const dryRun =
  process.env.AGENT_DRY_RUN === '1' || !process.env.OPENCODE_ZEN_API_KEY || process.env.AGENT_ENABLE_OPENCODE !== '1';
let currentModel = 'not-used';
let status = 'success';
let details = '';
let nextPhaseOverride = null;
let shouldAdvancePhase = true;
let skipPersistentWrites = false;

try {
  resetDailyCounterIfNeeded(state);

  if (command === 'pause') {
    state.mode = 'paused';
    details = 'Agent paused by command.';
    shouldAdvancePhase = false;
  } else if (command === 'resume') {
    state.mode = 'active';
    clearBlockedState(state);
    details = 'Agent resumed by command.';
    shouldAdvancePhase = false;
  } else if (command === 'refresh-knowledge') {
    currentModel = resolveModelForAgent('knowledge-updater', { dryRun });
    ({ details } = await runKnowledgeUpdate({ state, runDir, dryRun, model: currentModel }));
    shouldAdvancePhase = false;
  } else if (command === 'summarize') {
    details = await writeStatusSummary({ state, runDir });
    shouldAdvancePhase = false;
  } else if (state.mode === 'paused') {
    details = 'Agent is paused. No phase was executed.';
    shouldAdvancePhase = false;
  } else if (state.blocked_until_user_review) {
    details =
      'Agent is blocked until user review. Use workflow_dispatch command=resume after reviewing the PR or failure evidence.';
    shouldAdvancePhase = false;
    skipPersistentWrites = true;
  } else if (phase === 'WAITING_FOR_MANUAL_MERGE') {
    const result = await waitForManualMerge({ state, runDir, dryRun });
    details += result.details;
    nextPhaseOverride = result.nextPhaseOverride;
    shouldAdvancePhase = result.shouldAdvancePhase;
    skipPersistentWrites = result.skipPersistentWrites;
  } else {
    const openAgentPr = await getOpenAgentPr(state);
    if (openAgentPr) {
      state.current_pr = openAgentPr.number;
      state.current_pr_url = openAgentPr.url;
      if (!isPrPhase(phase)) {
        const readyResult = await evaluateExistingPrReadiness(state);
        await writeFile(`${runDir}/existing-pr-readiness.json`, `${JSON.stringify(readyResult, null, 2)}\n`, 'utf8');

        if (readyResult.ready) {
          if (isAutoMergeEnabled(state)) {
            const mergeResult = await submitAutoMergeForReadyPr({ state, runDir, dryRun });
            details += `${mergeResult.details}\n`;
          } else {
            details += `Existing agent PR #${openAgentPr.number} is already quality-reviewed and ready for manual merge. Waiting without starting a new cycle or updating persistent files.\n`;
          }
          shouldAdvancePhase = false;
          skipPersistentWrites = true;
        } else {
          phase = 'REVIEW_PR';
          state.phase = phase;
          details += `Existing agent PR #${openAgentPr.number} found. Focusing on PR review/check/merge instead of starting a new cycle. Readiness reason: ${readyResult.reason || 'not ready'}\n`;
        }
      }
    }

    if (skipPersistentWrites) {
      // Existing PR is already ready for manual merge or auto-merge was submitted.
      // Do not start a new cycle and do not write noisy state changes.
    } else if (isDailyLimitReached(state) && !isPrPhase(phase)) {
      details += `Daily work limit reached: ${state.work_count_today}/${state.max_work_count_per_day}.`;
      shouldAdvancePhase = false;
    } else if (await isOpenPrLimitReached(state, openAgentPr)) {
      details += `Open PR limit reached: ${state.open_pr_limit}. No new cycle was started.`;
      shouldAdvancePhase = false;
    } else {
      agent = agentForPhase(phase);
      prompt = promptForPhase(phase, state);
      await writeFile(`${runDir}/prompt.md`, prompt, 'utf8');

      if (dryRun) {
        details += await runDryPhase(phase, state, runDir);
        if (phase === 'RUN_PLAYWRIGHT') {
          if (process.env.AGENT_DRY_RUN_FORCE_PLAYWRIGHT_FAIL === '1') {
            nextPhaseOverride = await handlePlaywrightFailure(state, runDir, 'Dry run forced Playwright failure.');
          } else {
            markPlaywrightPassed(state);
            nextPhaseOverride = 'REVIEW_QA_OUTPUT';
          }
        } else if (phase === 'REPAIR_IF_FAILED') {
          nextPhaseOverride = 'RUN_PLAYWRIGHT';
        } else if (phase === 'REVIEW_PR') {
          nextPhaseOverride = 'RUN_PR_CHECKS';
        } else if (phase === 'RUN_PR_CHECKS') {
          nextPhaseOverride = await handleQualityCheckResult(state, runDir, {
            ok: process.env.AGENT_DRY_RUN_FORCE_QUALITY_FAIL !== '1',
            stdout: 'Dry run quality check.',
            stderr: 'Dry run forced quality failure.'
          });
        } else if (phase === 'FIX_PR_REVIEW') {
          nextPhaseOverride = 'RUN_PR_CHECKS';
        } else if (phase === 'MERGE_PR') {
          const result = await attemptMergePr({ state, runDir, dryRun: true });
          details += `\n${result.details}`;
          nextPhaseOverride = result.nextPhaseOverride;
          shouldAdvancePhase = result.shouldAdvancePhase;
        } else if (phase === 'WAITING_FOR_MANUAL_MERGE') {
          const result = await waitForManualMerge({ state, runDir, dryRun: true });
          details += `
${result.details}`;
          nextPhaseOverride = result.nextPhaseOverride;
          shouldAdvancePhase = result.shouldAdvancePhase;
          skipPersistentWrites = result.skipPersistentWrites;
        } else if (phase === 'CLEANUP_BRANCH') {
          const result = await cleanupMergedPr({ state, runDir, dryRun: true });
          details += `\n${result.details}`;
          nextPhaseOverride = result.nextPhaseOverride;
          shouldAdvancePhase = result.shouldAdvancePhase;
        }
      } else if (phase === 'MERGE_PR') {
        const result = await attemptMergePr({ state, runDir, dryRun: false });
        details += result.details;
        nextPhaseOverride = result.nextPhaseOverride;
        shouldAdvancePhase = result.shouldAdvancePhase;
      } else if (phase === 'WAITING_FOR_MANUAL_MERGE') {
        const result = await waitForManualMerge({ state, runDir, dryRun: false });
        details += result.details;
        nextPhaseOverride = result.nextPhaseOverride;
        shouldAdvancePhase = result.shouldAdvancePhase;
        skipPersistentWrites = result.skipPersistentWrites;
      } else if (phase === 'CLEANUP_BRANCH') {
        const result = await cleanupMergedPr({ state, runDir, dryRun: false });
        details += result.details;
        nextPhaseOverride = result.nextPhaseOverride;
        shouldAdvancePhase = result.shouldAdvancePhase;
      } else {
        const model = resolveModelForAgent(agent, { dryRun });
        currentModel = model;
        const result = await runOpenCodePhase({ phase, agent, model, prompt, runDir, state });
        details += result.details;
        nextPhaseOverride = result.nextPhaseOverride || null;
      }
    }
  }
} catch (error) {
  status = 'failed';
  shouldAdvancePhase = false;
  state.consecutive_failures = (state.consecutive_failures || 0) + 1;
  details =
    error instanceof Error ? `${details}\n${error.message}\n${error.stack || ''}` : `${details}\n${String(error)}`;
}

if (status === 'success' && state.mode !== 'paused' && shouldAdvancePhase) {
  state.consecutive_failures = 0;
  const next = nextPhaseOverride || nextPhase(phase);

  if (phase === 'CLEANUP_BRANCH') {
    completeCycle(state, details);
    details += `\n\nCompleted ${state.previous_cycle_id}. Next cycle id is ${state.cycle_id}.`;
  }

  state.phase = next;
  state.last_work_at = startedAt;
  state.work_count_today = (state.work_count_today || 0) + 1;
  state.work_count_date = todayUtc();
}

if (!skipPersistentWrites) {
  state.last_tick_at = startedAt;

  if ((state.consecutive_failures || 0) >= (state.max_consecutive_failures || 3)) {
    state.mode = 'paused';
    details += `

Agent paused because consecutive_failures reached ${state.consecutive_failures}.`;
  }
}

const summary = `# Agent Tick

- Started: ${startedAt}
- Phase: ${phase}
- Next phase: ${state.phase}
- Cycle: ${state.cycle_id}
- Current PR: ${state.current_pr || 'none'}
- Agent: ${agent}
- Model: ${currentModel}
- Command: ${command}
- Dry run: ${dryRun}
- Status: ${status}
- Repair attempts: ${state.repair_attempts || 0}/${state.max_repair_attempts || 3}
- PR review attempts: ${state.pr_review_attempts || 0}/${state.max_pr_review_attempts || 3}
- Auto merge enabled: ${isAutoMergeEnabled(state)}
- Blocked until user review: ${Boolean(state.blocked_until_user_review)}
- Persistent writes skipped: ${skipPersistentWrites}

## Details

${details}
`;

if (!skipPersistentWrites) {
  await writeJson(statePath, state);
  await writeFile(`${runDir}/summary.md`, summary, 'utf8');
  await writeFile('.agent/latest-summary.md', summary, 'utf8');
  await append(
    '.agent/memory.md',
    `
## ${startedAt} ${phase}

- Status: ${status}
- Dry run: ${dryRun}
- Next phase: ${state.phase}
- Cycle: ${state.cycle_id}
- Current PR: ${state.current_pr || 'none'}
- Repair attempts: ${state.repair_attempts || 0}/${state.max_repair_attempts || 3}
- PR review attempts: ${state.pr_review_attempts || 0}/${state.max_pr_review_attempts || 3}

`
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await append(
    process.env.GITHUB_STEP_SUMMARY,
    `
${summary}
`
  );
}

function modelEnvNameForAgent(agent) {
  const suffix = String(agent || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `AGENT_MODEL_${suffix}` : 'AGENT_MODEL_DEFAULT';
}

function resolveModelForAgent(agent, { dryRun = false } = {}) {
  const specificEnvName = modelEnvNameForAgent(agent);
  const specificModel = process.env[specificEnvName]?.trim();
  const defaultModel = process.env.AGENT_MODEL_DEFAULT?.trim();
  const model = specificModel || defaultModel;

  if (model) {
    return model;
  }

  const message = `No model configured for agent "${agent}". Set ${specificEnvName} or AGENT_MODEL_DEFAULT in GitHub Repository Variables. Model names are intentionally not hardcoded in this repository.`;
  if (dryRun) {
    return `not-configured: ${specificEnvName} or AGENT_MODEL_DEFAULT`;
  }
  throw new Error(message);
}

async function runDryPhase(phase, state, runDir) {
  const message = `Dry run executed for ${phase}. Set OPENCODE_ZEN_API_KEY and AGENT_ENABLE_OPENCODE=1 to run OpenCode Zen.`;
  const cycle = state.cycle_id || 'cycle-0001';

  const dryOutputs = {
    SELECT_RESEARCH_TASK: [
      `research/strategy/current-cycle-plan.md`,
      `# Current Cycle Plan\n\nDry run selected Research 001 for ${cycle}.\n`
    ],
    PLAN_APP_CHANGE: [
      `.agent/runs/current-app-change-plan.md`,
      `# App Change Plan\n\nDry run: keep current IndexedDB app unchanged and proceed to exploration.\n`
    ],
    IMPLEMENT_APP: [`.agent/generated-app-history.md`, `\n## ${nowIso()}\n\nDry run: no app change.\n`],
    EXPLORE_WITH_BROWSER: [
      `specs/observed/${cycle}.md`,
      `# Observed Log: ${cycle}\n\nDry run placeholder. In live mode, browser-explorer must use Playwright MCP browser_snapshot and click tools against PLAYWRIGHT_TARGET_URL.\n`
    ],
    WRITE_SPEC: [
      `specs/screens/qa-scenario-list.md`,
      `# Screen Spec: QA Scenario List\n\nDry run placeholder based on current app.\n`
    ],
    DESIGN_TESTS: [
      `research/experiments/${cycle}-test-design.md`,
      `# Test Design: ${cycle}\n\nDry run: smoke test should verify search, detail modal, validation, and IndexedDB reset.\n`
    ],
    IMPLEMENT_PLAYWRIGHT: [
      `tests/e2e/generated/${cycle}.spec.ts`,
      `import { test, expect } from '@playwright/test';\n\ntest('generated placeholder for ${cycle}', async ({ page }) => {\n  await page.goto('/?reset=1&scenario=default');\n  await expect(page.getByRole('heading', { name: 'QA Scenario Lab' })).toBeVisible();\n});\n`
    ],
    RUN_PLAYWRIGHT: [
      `.agent/runs/${cycle}-playwright-result.md`,
      `# Playwright Result\n\nDry run did not execute tests.\n`
    ],
    REPAIR_IF_FAILED: [
      `.agent/known-failures.md`,
      `\n## ${nowIso()}\n\nDry run: repair attempt ${state.repair_attempts || 0}/${state.max_repair_attempts || 3}.\n`
    ],
    REVIEW_QA_OUTPUT: [`research/scorecards/${cycle}.md`, `# Scorecard: ${cycle}\n\nDry run scorecard.\n`],
    UPDATE_RESEARCH_MEMORY: [`.agent/skill-backlog.md`, `\n## ${nowIso()}\n\nDry run: no skill update proposed.\n`],
    CREATE_PR: [`.agent/runs/${cycle}-pr-summary.md`, `# PR Summary\n\nDry run completed research cycle ${cycle}.\n`],
    REVIEW_PR: [
      `research/scorecards/pr-review.md`,
      `# PR Review\n\n- cycle_id: ${cycle}\n- pr_number: ${state.current_pr || '1'}\n- reviewed_at: ${nowIso()}\n- merge_allowed: true\n- Dry run review passed.\n`
    ],
    FIX_PR_REVIEW: [
      `.agent/known-failures.md`,
      `\n## ${nowIso()}\n\nDry run: PR review fix attempt ${state.pr_review_attempts || 0}/${state.max_pr_review_attempts || 3}.\n`
    ],
    RUN_PR_CHECKS: [`.agent/runs/${cycle}-quality-check.md`, `# Quality Check\n\nDry run quality check placeholder.\n`],
    MERGE_PR: [`.agent/runs/${cycle}-merge.md`, `# Merge\n\nDry run merge placeholder.\n`],
    CLEANUP_BRANCH: [`.agent/runs/${cycle}-cleanup.md`, `# Cleanup\n\nDry run cleanup placeholder.\n`],
    IDLE: [`.agent/runs/${cycle}-idle-summary.md`, `# Idle Summary\n\nReady for the next cycle.\n`]
  };

  if (phase === 'REVIEW_PR' && !state.current_pr) {
    state.current_pr = 1;
  }

  const output = dryOutputs[phase];
  if (output) {
    await ensureDir(output[0].split('/').slice(0, -1).join('/'));
    if (
      phase === 'IMPLEMENT_APP' ||
      phase === 'REPAIR_IF_FAILED' ||
      phase === 'UPDATE_RESEARCH_MEMORY' ||
      phase === 'FIX_PR_REVIEW'
    ) {
      await append(output[0], output[1]);
    } else {
      await writeFile(output[0], output[1], 'utf8');
    }
  }

  await writeFile(`${runDir}/dry-run.md`, message, 'utf8');
  return message;
}

async function runOpenCodePhase({ phase, agent, model, prompt, runDir, state }) {
  let preview = null;
  const env = {
    ...process.env,
    OPENCODE_API_KEY: process.env.OPENCODE_API_KEY || process.env.OPENCODE_ZEN_API_KEY || '',
    OPENCODE_ZEN_API_KEY: process.env.OPENCODE_ZEN_API_KEY || ''
  };

  try {
    if (phase === 'EXPLORE_WITH_BROWSER') {
      preview = await startResearchAppPreview(runDir);
      env.PLAYWRIGHT_TARGET_URL = preview.url;
      state.current_target_url = preview.url;
      prompt = `${prompt}\n\nTarget URL for this exploration: ${preview.url}\nOpen this URL with Playwright MCP browser tools.\n`;
      await writeFile(`${runDir}/prompt.md`, prompt, 'utf8');
    }

    await runOpenCode({ phase, agent, model, prompt, runDir, env });
    let details = `OpenCode executed for phase ${phase} with agent ${agent}.`;

    if (phase === 'IMPLEMENT_APP') {
      const result = await runFullQualityGateWithInlineRepair({
        state,
        runDir,
        model,
        phase,
        reason:
          'The app implementation phase changed the research app. Full quality gate must pass before this state can be pushed.'
      });
      return {
        details: `${details}

${result.details}`
      };
    }

    if (phase === 'IMPLEMENT_PLAYWRIGHT' || phase === 'RUN_PLAYWRIGHT' || phase === 'REPAIR_IF_FAILED') {
      const result = await runFullQualityGateWithInlineRepair({
        state,
        runDir,
        model,
        phase,
        reason: 'Playwright code, tests, or repair changes must pass the full quality gate before push.'
      });
      markPlaywrightPassed(state);
      return {
        details: `${details}

${result.details}

Playwright implementation and repair were verified in this workflow. The next phase is REVIEW_QA_OUTPUT.`,
        nextPhaseOverride: 'REVIEW_QA_OUTPUT'
      };
    }

    if (phase === 'REVIEW_PR') {
      return {
        details: `${details}

PR review completed. The next phase is RUN_PR_CHECKS.`,
        nextPhaseOverride: 'RUN_PR_CHECKS'
      };
    }

    if (phase === 'FIX_PR_REVIEW') {
      const result = await runFullQualityGateWithInlineRepair({
        state,
        runDir,
        model,
        phase,
        reason: 'PR review fixes must pass the full quality gate before push.'
      });
      return {
        details: `${details}

${result.details}

PR review fix completed and verified. The next phase is RUN_PR_CHECKS.`,
        nextPhaseOverride: 'RUN_PR_CHECKS'
      };
    }

    if (phase === 'RUN_PR_CHECKS') {
      const result = await runFullQualityGateWithInlineRepair({
        state,
        runDir,
        model,
        phase,
        reason: 'PR quality checks must pass before merge evaluation.'
      });
      const next = await handleQualityCheckResult(state, runDir, result);
      details += `

${result.details}

Quality gate completed. OK: ${result.ok}. Next phase: ${next}.`;
      return { details, nextPhaseOverride: next };
    }

    return { details };
  } finally {
    if (preview) {
      const output = preview.getOutput();
      await writeFile(`${runDir}/preview-stdout.txt`, output.stdout || '', 'utf8');
      await writeFile(`${runDir}/preview-stderr.txt`, output.stderr || '', 'utf8');
      await preview.stop();
    }
  }
}

async function runOpenCode({ agent, model, prompt, runDir, env, outputPrefix = 'opencode' }) {
  const cli = process.env.OPENCODE_CLI || 'npx -y opencode-ai@latest';
  const parts = cli.split(' ').filter(Boolean);
  const command = parts[0];
  const args = [...parts.slice(1), 'run', '--model', model, '--agent', agent, '--dir', '.', prompt];
  const heartbeatMs = Number(process.env.AGENT_OPENCODE_HEARTBEAT_MS || 60_000);
  const intervalMs = Number.isFinite(heartbeatMs) && heartbeatMs > 0 ? heartbeatMs : 60_000;
  const child = startCommand(command, args, { env });
  const stopHeartbeat = startHeartbeat(
    `[agent-tick] OpenCode is still running (agent=${agent}, model=${model})`,
    intervalMs
  );

  console.log(`[agent-tick] OpenCode start: agent=${agent}, model=${model}, at=${nowIso()}`);
  child.child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk.toString());
  });
  child.child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk.toString());
  });

  const { code, signal } = await new Promise((resolve, reject) => {
    child.child.once('error', reject);
    child.child.once('close', (exitCode, exitSignal) => {
      resolve({ code: typeof exitCode === 'number' ? exitCode : 1, signal: exitSignal });
    });
  });
  stopHeartbeat();

  const { stdout, stderr } = child.getOutput();
  await writeFile(`${runDir}/${outputPrefix}-stdout.txt`, stdout || '', 'utf8');
  await writeFile(`${runDir}/${outputPrefix}-stderr.txt`, stderr || '', 'utf8');

  if (signal) {
    throw new Error(`OpenCode process was terminated by signal: ${signal}`);
  }
  if (code !== 0) {
    throw new Error(`OpenCode process exited with non-zero code: ${code}`);
  }
  console.log(`[agent-tick] OpenCode end: agent=${agent}, model=${model}, at=${nowIso()}`);
  return { stdout, stderr };
}

function startHeartbeat(message, intervalMs) {
  let stopped = false;
  let timer = null;

  const tick = () => {
    if (stopped) return;
    console.log(`${message} at=${nowIso()}`);
    timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

async function runFullQualityGateWithInlineRepair({ state, runDir, model, phase, reason }) {
  const maxAttempts = Number(state.max_inline_quality_repair_attempts || state.max_repair_attempts || 3);
  let result = await runFullQualityCheck({ runDir, label: `quality-${phase}-initial` });
  if (result.ok) {
    state.last_quality_status = 'passed';
    state.last_quality_passed_at = nowIso();
    return {
      ok: true,
      ...result,
      details: `Full quality gate passed before push for ${phase}.`
    };
  }

  let attempts = 0;
  let details = `Full quality gate failed before push for ${phase}. Inline repair is required. Reason: ${reason}`;

  while (!result.ok && attempts < maxAttempts) {
    attempts += 1;
    state.repair_attempts = Number(state.repair_attempts || 0) + 1;
    await append(
      '.agent/known-failures.md',
      `\n## ${nowIso()} Full quality gate failed before push\n\n- Cycle: ${state.cycle_id || 'cycle-0001'}\n- Phase: ${phase}\n- Inline repair attempt: ${attempts}/${maxAttempts}\n- Total repair attempts: ${state.repair_attempts}/${state.max_repair_attempts || 3}\n- Run directory: ${runDir}\n\n### Reason\n\n${reason}\n\n### stderr\n\n\`\`\`\n${result.stderr || result.message || ''}\n\`\`\`\n\n`
    );

    const repairPrompt = `${promptForPhase(phase === 'FIX_PR_REVIEW' || phase === 'RUN_PR_CHECKS' ? 'FIX_PR_REVIEW' : 'REPAIR_IF_FAILED', state)}\n\nThe mandatory full quality gate failed before the branch could be pushed.\nYou must repair the repository inside this same workflow run.\nDo not relax or skip checks. Do not remove tests to make the gate pass.\n\nOriginal phase: ${phase}\nReason: ${reason}\nAttempt: ${attempts}/${maxAttempts}\n\nQuality gate stderr:\n\`\`\`\n${result.stderr || result.message || ''}\n\`\`\`\n\nQuality gate stdout:\n\`\`\`\n${result.stdout || ''}\n\`\`\`\n`;

    await writeFile(`${runDir}/inline-repair-${attempts}-prompt.md`, repairPrompt, 'utf8');
    await runOpenCode({
      agent: 'repairer',
      model,
      prompt: repairPrompt,
      runDir,
      env: {
        ...process.env,
        OPENCODE_API_KEY: process.env.OPENCODE_API_KEY || process.env.OPENCODE_ZEN_API_KEY || '',
        OPENCODE_ZEN_API_KEY: process.env.OPENCODE_ZEN_API_KEY || ''
      },
      outputPrefix: `inline-repair-${attempts}`
    });

    result = await runFullQualityCheck({ runDir, label: `quality-${phase}-repair-${attempts}` });
  }

  if (!result.ok) {
    await blockAndRestoreSafeState({
      state,
      runDir,
      phase,
      attempts,
      maxAttempts,
      reason,
      stdout: result.stdout || '',
      stderr: result.stderr || result.message || ''
    });
    throw new Error(
      `Full quality gate failed after ${attempts}/${maxAttempts} inline repair attempts. Broken changes were reverted and a blocker record was prepared for human review.`
    );
  }

  state.last_quality_status = 'passed';
  state.last_quality_passed_at = nowIso();
  clearBlockedState(state);
  return {
    ok: true,
    ...result,
    details: `${details}\n\nInline repair succeeded after ${attempts} attempt(s). Full quality gate passed before push.`
  };
}

async function blockAndRestoreSafeState({ state, runDir, phase, attempts, maxAttempts, reason, stdout, stderr }) {
  const blockedAt = nowIso();
  const blockerId = safeStamp(blockedAt);
  const cycle = state.cycle_id || 'cycle-0001';
  const blockerPath = `.agent/blockers/${cycle}-${blockerId}.md`;

  const blocker = `# Agent Blocker: Full quality gate failed

- Blocked at: ${blockedAt}
- Cycle: ${cycle}
- Phase: ${phase}
- Attempts: ${attempts}/${maxAttempts}
- Current PR: ${state.current_pr || 'none'}
- Run directory: ${runDir}

## Reason

${reason}

## Result

The mandatory full quality gate did not pass after inline repair attempts.
Broken working-tree changes were reverted before creating this blocker record so the branch can safely preserve the human-review state without pushing failing application or test code.

## stdout

    ${stdout || ''}

## stderr

    ${stderr || ''}
`;

  await runCommandAllowFailure('git', ['reset', '--hard', 'HEAD']);
  await runCommandAllowFailure('git', ['clean', '-fd', '--', '.']);
  await ensureDir(runDir);

  state.last_quality_status = 'failed';
  state.last_quality_failed_at = blockedAt;
  state.blocked_until_user_review = true;
  state.blocked_reason = `Full quality gate failed in ${phase} after ${attempts}/${maxAttempts} inline repair attempt(s).`;
  state.blocked_at = blockedAt;
  state.blocker_path = blockerPath;

  await ensureDir('.agent/blockers');
  await writeFile(blockerPath, blocker, 'utf8');
  await writeFile(
    `${runDir}/quality-blocked.md`,
    `# Full quality gate blocked push\n\n- Phase: ${phase}\n- Attempts: ${attempts}/${maxAttempts}\n- Cycle: ${cycle}\n- Blocker: ${blockerPath}\n\nBroken changes were reverted. Only the blocker state should be committed.\n`,
    'utf8'
  );
}

async function runFullQualityCheck({ runDir, label }) {
  const result = await runCommandAllowFailure('npm', ['run', 'quality:check'], { env: process.env });
  await writeFile(`${runDir}/${label}-stdout.txt`, result.stdout || '', 'utf8');
  await writeFile(`${runDir}/${label}-stderr.txt`, result.stderr || result.message || '', 'utf8');
  await writeFile(
    `.agent/runs/${state.cycle_id || 'cycle-0001'}-${label}.md`,
    `# Full Quality Gate: ${label}\n\n- OK: ${result.ok}\n- Exit code: ${result.code ?? 0}\n\n## stdout\n\n\`\`\`\n${result.stdout || ''}\n\`\`\`\n\n## stderr\n\n\`\`\`\n${result.stderr || result.message || ''}\n\`\`\`\n`,
    'utf8'
  );
  return result;
}

async function startResearchAppPreview(runDir) {
  const build = await runCommandAllowFailure('npm', ['run', 'build:research-app'], { env: process.env });
  await writeFile(`${runDir}/preview-build-stdout.txt`, build.stdout || '', 'utf8');
  await writeFile(`${runDir}/preview-build-stderr.txt`, build.stderr || '', 'utf8');
  if (!build.ok) throw new Error(`Failed to build research app before exploration: ${build.stderr || build.message}`);

  const url = process.env.PLAYWRIGHT_TARGET_URL || 'http://127.0.0.1:4173';
  const preview = startCommand('npm', ['run', 'preview:research-app'], { env: process.env });
  await waitForUrl(url, { timeoutMs: 60_000 });
  return { ...preview, url };
}

async function runKnowledgeUpdate({ state, runDir, dryRun, model }) {
  const knowledgePhase = 'REFRESH_KNOWLEDGE';
  const knowledgeAgent = 'knowledge-updater';
  const knowledgePrompt = `You are running inside the ai-playwright-qa-agent-lab repository.\n\nRefresh external knowledge for the AI QA research agent.\nFocus on Playwright, Playwright MCP, OpenCode agents/skills/tools, GitHub Actions, and AI browser-agent QA practices.\nSave a concise dated update under research/external-updates/.\nUpdate .agent/knowledge/latest-summary.md and propose only concrete skill improvements in .agent/skill-backlog.md.\nDo not edit SKILL.md directly.\n`;
  await writeFile(`${runDir}/prompt.md`, knowledgePrompt, 'utf8');

  if (dryRun) {
    const message =
      'Dry run knowledge refresh. Set OPENCODE_ZEN_API_KEY and AGENT_ENABLE_OPENCODE=1 to run knowledge-updater.';
    await writeFile(
      `research/external-updates/${todayUtc()}-dry-run.md`,
      `# External Update ${todayUtc()}\n\n${message}\n`,
      'utf8'
    );
    state.knowledge_update = state.knowledge_update || {};
    state.knowledge_update.last_light_update_at = startedAt;
    return { details: message };
  }

  await runOpenCode({
    phase: knowledgePhase,
    agent: knowledgeAgent,
    model,
    prompt: knowledgePrompt,
    runDir,
    env: process.env
  });
  state.knowledge_update = state.knowledge_update || {};
  state.knowledge_update.last_light_update_at = startedAt;
  return { details: 'External knowledge refresh executed.' };
}

async function handlePlaywrightFailure(state, runDir, reason) {
  state.repair_attempts = Number(state.repair_attempts || 0) + 1;
  state.last_playwright_status = 'failed';
  state.last_playwright_failed_at = nowIso();
  const maxRepairAttempts = Number(state.max_repair_attempts || 3);
  const nextAction = state.repair_attempts >= maxRepairAttempts ? 'REVIEW_QA_OUTPUT' : 'REPAIR_IF_FAILED';

  if (nextAction === 'REVIEW_QA_OUTPUT') {
    state.blocked_until_user_review = true;
  }

  await append(
    '.agent/known-failures.md',
    `\n## ${nowIso()} Playwright test failed\n\n- Cycle: ${state.cycle_id || 'cycle-0001'}\n- Repair attempts: ${state.repair_attempts}/${maxRepairAttempts}\n- Next action: ${nextAction}\n- Run directory: ${runDir}\n\n### Reason\n\n${reason}\n\n`
  );
  return nextAction;
}

async function handleQualityCheckResult(state, runDir, result) {
  await writeFile(`${runDir}/quality-check-stdout.txt`, result.stdout || '', 'utf8');
  await writeFile(`${runDir}/quality-check-stderr.txt`, result.stderr || result.message || '', 'utf8');
  await writeFile(
    `.agent/runs/${state.cycle_id || 'cycle-0001'}-quality-check.md`,
    `# Quality Check\n\n- OK: ${result.ok}\n- Exit code: ${result.code ?? 0}\n\n## stdout\n\n\`\`\`\n${result.stdout || ''}\n\`\`\`\n\n## stderr\n\n\`\`\`\n${result.stderr || result.message || ''}\n\`\`\`\n`,
    'utf8'
  );

  if (result.ok) {
    const reviewGate = await readPrReviewGate(state);
    await writeFile(`${runDir}/pr-review-gate.json`, `${JSON.stringify(reviewGate, null, 2)}\n`, 'utf8');

    if (!reviewGate.valid) {
      state.pr_review_attempts = Number(state.pr_review_attempts || 0) + 1;
      state.last_pr_check_status = 'passed_review_blocked';
      state.last_pr_check_passed_at = nowIso();
      const max = Number(state.max_pr_review_attempts || 3);
      const reason =
        reviewGate.reason ||
        (!reviewGate.exists
          ? 'research/scorecards/pr-review.md was not found.'
          : 'research/scorecards/pr-review.md is not valid for the current cycle and PR.');

      await append(
        '.agent/known-failures.md',
        `\n## ${nowIso()} PR review gate blocked merge\n\n- Cycle: ${state.cycle_id || 'cycle-0001'}\n- Attempts: ${state.pr_review_attempts}/${max}\n- Reason: ${reason}\n- Run directory: ${runDir}\n\n`
      );

      if (state.pr_review_attempts >= max) {
        await blockPrReviewGate({
          state,
          runDir,
          reason,
          gate: reviewGate,
          attempts: state.pr_review_attempts,
          maxAttempts: max
        });
        return 'REVIEW_PR';
      }
      return reviewGate.exists ? 'FIX_PR_REVIEW' : 'REVIEW_PR';
    }

    state.pr_review_attempts = 0;
    state.last_pr_check_status = 'passed';
    state.last_pr_check_passed_at = nowIso();
    clearBlockedState(state);
    return 'MERGE_PR';
  }

  state.pr_review_attempts = Number(state.pr_review_attempts || 0) + 1;
  state.last_pr_check_status = 'failed';
  state.last_pr_check_failed_at = nowIso();
  const max = Number(state.max_pr_review_attempts || 3);
  if (state.pr_review_attempts >= max) {
    await append(
      '.agent/known-failures.md',
      `\n## ${nowIso()} PR quality gate blocked\n\n- Cycle: ${state.cycle_id || 'cycle-0001'}\n- Attempts: ${state.pr_review_attempts}/${max}\n- Run directory: ${runDir}\n\nQuality gate failed repeatedly. Human review is required.\n`
    );
    await blockPrReviewGate({
      state,
      runDir,
      reason: 'PR quality gate failed repeatedly after AI repair attempts.',
      gate: { exists: true, path: 'quality:check', valid: false },
      attempts: state.pr_review_attempts,
      maxAttempts: max,
      stdout: result.stdout || '',
      stderr: result.stderr || result.message || ''
    });
    return 'REVIEW_PR';
  }

  return 'FIX_PR_REVIEW';
}

async function blockPrReviewGate({ state, runDir, reason, gate, attempts, maxAttempts, stdout = '', stderr = '' }) {
  const blockedAt = nowIso();
  const cycle = state.cycle_id || 'cycle-0001';
  const pr = state.current_pr || 'none';
  const blockerId = safeStamp(blockedAt);
  const blockerPath = `.agent/blockers/${cycle}-pr-review-${blockerId}.md`;

  await ensureDir('.agent/blockers');
  const blocker = `# Agent Blocker: PR review or quality gate requires human review

- Blocked at: ${blockedAt}
- Cycle: ${cycle}
- Current PR: ${pr}
- Attempts: ${attempts}/${maxAttempts}
- Run directory: ${runDir}
- Gate path: ${gate?.path || 'unknown'}
- Gate valid: ${Boolean(gate?.valid)}

## Reason

${reason}

## Gate details

\`\`\`json
${JSON.stringify(gate || {}, null, 2)}
\`\`\`

## stdout

\`\`\`
${stdout || ''}
\`\`\`

## stderr

\`\`\`
${stderr || ''}
\`\`\`
`;

  await writeFile(blockerPath, blocker, 'utf8');
  await writeFile(
    `${runDir}/pr-review-blocked.md`,
    `# PR review blocked

- Cycle: ${cycle}
- Current PR: ${pr}
- Attempts: ${attempts}/${maxAttempts}
- Blocker: ${blockerPath}
- Reason: ${reason}
`,
    'utf8'
  );

  state.blocked_until_user_review = true;
  state.blocked_reason = reason;
  state.blocked_at = blockedAt;
  state.blocker_path = blockerPath;
}

async function readPrReviewGate(state, options = {}) {
  const path = 'research/scorecards/pr-review.md';
  const expectedCycle = options.expectedCycle || state.cycle_id || 'cycle-0001';
  const expectedPr = options.expectedPr || (state.current_pr ? String(state.current_pr) : null);

  try {
    const content = await readFile(path, 'utf8');
    const mergeMatch = content.match(/^\s*-?\s*merge_allowed\s*:\s*(true|false)\s*$/im);
    const cycleMatch = content.match(/^\s*-?\s*cycle_id\s*:\s*([^\n\r]+)\s*$/im);
    const prMatch = content.match(/^\s*-?\s*pr_number\s*:\s*([^\n\r]+)\s*$/im);
    const reviewedAtMatch = content.match(/^\s*-?\s*reviewed_at\s*:\s*([^\n\r]+)\s*$/im);

    const mergeAllowed = mergeMatch ? mergeMatch[1].toLowerCase() === 'true' : null;
    const cycleId = cycleMatch ? cycleMatch[1].trim() : null;
    const prNumber = prMatch ? prMatch[1].trim().replace(/^#/, '') : null;
    const reviewedAt = reviewedAtMatch ? reviewedAtMatch[1].trim() : null;
    const cycleMatches = cycleId === expectedCycle;
    const prMatches = expectedPr ? prNumber === expectedPr : false;
    const metadataComplete = Boolean(cycleId && prNumber && reviewedAt);

    let reason = null;
    if (mergeAllowed !== true) reason = 'PR review did not grant merge_allowed: true.';
    if (!metadataComplete) reason = 'PR review is missing cycle_id, pr_number, or reviewed_at metadata.';
    if (!cycleMatches)
      reason = `PR review cycle_id (${cycleId || 'missing'}) does not match current cycle (${expectedCycle}).`;
    if (!prMatches)
      reason = `PR review pr_number (${prNumber || 'missing'}) does not match current PR (${expectedPr || 'missing'}).`;

    return {
      exists: true,
      mergeAllowed,
      path,
      cycleId,
      prNumber,
      reviewedAt,
      expectedCycle,
      expectedPr,
      cycleMatches,
      prMatches,
      metadataComplete,
      valid: mergeAllowed === true && metadataComplete && cycleMatches && prMatches,
      reason
    };
  } catch {
    return {
      exists: false,
      mergeAllowed: null,
      path,
      expectedCycle,
      expectedPr,
      valid: false,
      reason: 'research/scorecards/pr-review.md was not found.'
    };
  }
}

function markPlaywrightPassed(state) {
  state.repair_attempts = 0;
  state.last_playwright_status = 'passed';
  state.last_playwright_passed_at = nowIso();
  clearBlockedState(state);
}

async function writeStatusSummary({ state, runDir }) {
  const message = `# Agent Status\n\n- Mode: ${state.mode}\n- Phase: ${state.phase}\n- Cycle: ${state.cycle_id}\n- Current PR: ${state.current_pr || 'none'}\n- Work count today: ${state.work_count_today || 0}/${state.max_work_count_per_day || 'unlimited'}\n- Repair attempts: ${state.repair_attempts || 0}/${state.max_repair_attempts || 3}\n- PR review attempts: ${state.pr_review_attempts || 0}/${state.max_pr_review_attempts || 3}\n- Consecutive failures: ${state.consecutive_failures || 0}/${state.max_consecutive_failures || 3}\n- Blocked until user review: ${Boolean(state.blocked_until_user_review)}\n- Auto merge enabled: ${isAutoMergeEnabled(state)}\n- Last tick: ${state.last_tick_at || 'none'}\n- Last work: ${state.last_work_at || 'none'}\n`;
  await writeFile(`${runDir}/status-summary.md`, message, 'utf8');
  await writeFile('.agent/latest-status.md', message, 'utf8');
  return 'Status summary written to .agent/latest-status.md.';
}

function clearBlockedState(state) {
  state.blocked_until_user_review = false;
  delete state.blocked_reason;
  delete state.blocked_at;
  delete state.blocker_path;
}

function resetDailyCounterIfNeeded(state) {
  const today = todayUtc();
  if (state.work_count_date !== today) {
    state.work_count_date = today;
    state.work_count_today = 0;
  }
}

function isDailyLimitReached(state) {
  const max = Number(state.max_work_count_per_day || 0);
  if (!max) return false;
  return Number(state.work_count_today || 0) >= max;
}

async function getOpenAgentPr(state) {
  if (!process.env.GH_TOKEN) return null;
  const branch = state.current_branch || process.env.AGENT_BRANCH || 'agent/autonomous-research';

  const labeledResult = await runCommandAllowFailure('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--label',
    'agent:owned',
    '--json',
    'number,url,headRefName,baseRefName,labels'
  ]);
  if (labeledResult.ok && labeledResult.stdout.trim()) {
    const prs = JSON.parse(labeledResult.stdout || '[]');
    const branchMatch = prs.find((pr) => pr.headRefName === branch);
    return branchMatch || prs[0] || null;
  }

  // Migration fallback: if an older agent PR exists without labels, detect it by branch
  // and attach the agent labels so future ticks use label-based ownership only.
  const branchResult = await runCommandAllowFailure('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'open',
    '--json',
    'number,url,headRefName,baseRefName,labels'
  ]);
  if (!branchResult.ok || !branchResult.stdout.trim()) return null;
  const branchPrs = JSON.parse(branchResult.stdout || '[]');
  const pr = branchPrs[0] || null;
  if (pr?.number) {
    await ensureAgentPrLabels(pr.number, ['agent:owned', 'agent:active']);
  }
  return pr;
}

async function getOpenAgentPrCount() {
  if (!process.env.GH_TOKEN) return 0;
  const result = await runCommandAllowFailure('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--label',
    'agent:owned',
    '--json',
    'number'
  ]);
  if (!result.ok) return 0;
  return JSON.parse(result.stdout || '[]').length;
}

async function isOpenPrLimitReached(state, openAgentPr) {
  if (openAgentPr) return false;
  const limit = Number(state.open_pr_limit || 0);
  if (!limit || !process.env.GH_TOKEN) return false;
  const count = await getOpenAgentPrCount();
  return Number.isFinite(count) && count >= limit && (state.phase === 'SELECT_RESEARCH_TASK' || state.phase === 'IDLE');
}

async function ensureAgentPrLabels(prNumber, labels) {
  if (!process.env.GH_TOKEN || !prNumber || !labels?.length) return;
  await runCommandAllowFailure('gh', ['pr', 'edit', String(prNumber), '--add-label', labels.join(',')]);
}

function isPrPhase(phase) {
  return new Set([
    'REVIEW_PR',
    'FIX_PR_REVIEW',
    'RUN_PR_CHECKS',
    'MERGE_PR',
    'WAITING_FOR_MANUAL_MERGE',
    'CLEANUP_BRANCH'
  ]).has(phase);
}

function isAutoMergeEnabled(state) {
  return process.env.AGENT_AUTO_MERGE === '1' || state.auto_merge_enabled === true;
}

async function evaluateExistingPrReadiness(state) {
  const expectedCycle = state.previous_cycle_id || state.last_manual_merge_ready_completed_cycle || state.cycle_id;
  const gate = await readPrReviewGate(state, { expectedCycle });
  const qualityPassed = state.last_pr_check_status === 'passed' || Boolean(state.last_pr_check_passed_at);
  const finalStatePrepared =
    state.phase === 'IDLE' &&
    Boolean(
      state.previous_cycle_id || state.last_manual_merge_ready_completed_cycle || state.last_auto_merge_completed_cycle
    );

  const ready = gate.valid && qualityPassed && finalStatePrepared;
  let reason = null;
  if (!finalStatePrepared) reason = 'The agent branch does not yet contain a final IDLE state for a completed cycle.';
  if (!qualityPassed) reason = 'The last PR quality check has not passed yet.';
  if (!gate.valid) reason = gate.reason || 'The PR review gate is not valid for this PR.';

  return {
    ready,
    reason,
    qualityPassed,
    finalStatePrepared,
    gate
  };
}

async function submitAutoMergeForReadyPr({ state, runDir, dryRun }) {
  const pr = state.current_pr;
  const mergeStrategy = state.merge_strategy || 'squash';
  const completedCycle = state.previous_cycle_id || state.last_manual_merge_ready_completed_cycle || state.cycle_id;

  if (!pr) {
    return { details: 'Auto merge requested for a ready PR, but current_pr is not set.' };
  }

  if (dryRun || !process.env.GH_TOKEN) {
    await writeFile(
      `${runDir}/ready-pr-auto-merge-dry-run.md`,
      `# Ready PR auto-merge dry run\n\nWould submit auto-merge for PR #${pr}.\n`,
      'utf8'
    );
    return { details: `Dry run would submit auto-merge for already-ready PR #${pr}.` };
  }

  const strategyFlag = mergeStrategy === 'merge' ? '--merge' : mergeStrategy === 'rebase' ? '--rebase' : '--squash';
  const result = await runCommandAllowFailure('gh', [
    'pr',
    'merge',
    String(pr),
    strategyFlag,
    '--auto',
    '--delete-branch'
  ]);
  await writeFile(`${runDir}/ready-pr-auto-merge-stdout.txt`, result.stdout || '', 'utf8');
  await writeFile(`${runDir}/ready-pr-auto-merge-stderr.txt`, result.stderr || result.message || '', 'utf8');

  if (!result.ok) {
    return {
      details: `Auto-merge submission for ready PR #${pr} failed. The agent will keep waiting. ${result.stderr || result.message || ''}`
    };
  }

  state.last_auto_merge_submitted_at = nowIso();
  state.last_auto_merge_submitted_pr = pr;
  state.last_auto_merge_completed_cycle = completedCycle;
  return { details: `Auto-merge submitted for already-ready PR #${pr}. Waiting for GitHub to merge it.` };
}

async function attemptMergePr({ state, runDir, dryRun }) {
  const pr = state.current_pr || (await getOpenAgentPr(state))?.number;
  if (!pr) {
    return {
      details: 'No current PR found. Moving to cleanup.',
      nextPhaseOverride: 'CLEANUP_BRANCH',
      shouldAdvancePhase: true
    };
  }
  state.current_pr = pr;

  if (!isAutoMergeEnabled(state)) {
    const completedCycle = state.cycle_id || 'cycle-0001';
    await writeFile(
      `${runDir}/manual-merge-ready.md`,
      `# Manual merge ready\n\n- PR: #${pr}\n- Completed cycle: ${completedCycle}\n\nAGENT_AUTO_MERGE is not enabled. The agent prepared the branch with a final IDLE state so that a human merge will not put a transient WAITING_FOR_MANUAL_MERGE phase on main. Future ticks will detect this PR as ready and wait without creating noisy commits.\n`,
      'utf8'
    );
    prepareFinalStateBeforeManualMerge(state, pr);
    return {
      details: `Auto merge is disabled. Prepared final IDLE state for ${completedCycle}. PR #${pr} is ready for human review and manual merge.`,
      nextPhaseOverride: 'IDLE',
      shouldAdvancePhase: true
    };
  }

  const mergeStrategy = state.merge_strategy || 'squash';

  if (dryRun) {
    await writeFile(
      `${runDir}/merge-dry-run.md`,
      `# Merge dry run\n\nWould prepare final state and merge PR #${pr} after pushing the branch.\n`,
      'utf8'
    );
    const completedCycle = state.cycle_id || 'cycle-0001';
    prepareFinalStateBeforeAutoMerge(state, pr, mergeStrategy);
    return {
      details: `Dry run prepared final IDLE state for ${completedCycle} and would merge PR #${pr} after pushing it.`,
      nextPhaseOverride: 'IDLE',
      shouldAdvancePhase: true
    };
  }

  const completedCycle = state.cycle_id || 'cycle-0001';
  const runtimeMergeRequest = {
    pr_number: pr,
    strategy: mergeStrategy,
    requested_at: nowIso(),
    completed_cycle: completedCycle,
    delete_branch: true
  };
  await writeFile('.agent/runtime-auto-merge.json', `${JSON.stringify(runtimeMergeRequest, null, 2)}\n`, 'utf8');
  await writeFile(
    `${runDir}/merge-prepared.md`,
    `# Auto merge prepared\n\n- PR: #${pr}\n- Completed cycle: ${completedCycle}\n- Strategy: ${mergeStrategy}\n\nThe workflow will first push the final IDLE state to the agent branch. After that push, scripts/commit-agent-branch.sh will run gh pr merge for this PR. This prevents the merged main branch from inheriting a transient MERGE_PR or WAITING_FOR_MANUAL_MERGE state.\n`,
    'utf8'
  );
  prepareFinalStateBeforeAutoMerge(state, pr, mergeStrategy);
  return {
    details: `Prepared final IDLE state for ${completedCycle}. PR #${pr} will be auto-merged after the final state is pushed.`,
    nextPhaseOverride: 'IDLE',
    shouldAdvancePhase: true
  };
}

function prepareFinalStateBeforeAutoMerge(state, pr, mergeStrategy) {
  const completedCycle = state.cycle_id || 'cycle-0001';
  completeCycle(state);
  state.last_auto_merge_prepared_at = nowIso();
  state.last_auto_merge_prepared_pr = pr;
  state.last_auto_merge_completed_cycle = completedCycle;
  state.last_auto_merge_strategy = mergeStrategy;
  state.current_pr = null;
  state.current_pr_url = null;
  state.branch_cleanup_required = false;
}

function prepareFinalStateBeforeManualMerge(state, pr) {
  const completedCycle = state.cycle_id || 'cycle-0001';
  completeCycle(state);
  state.last_manual_merge_ready_at = nowIso();
  state.last_manual_merge_ready_pr = pr;
  state.last_manual_merge_ready_completed_cycle = completedCycle;
  state.current_pr = null;
  state.current_pr_url = null;
  state.branch_cleanup_required = false;
}

async function waitForManualMerge({ state, runDir: _runDir, dryRun }) {
  const pr = state.current_pr || (await getOpenAgentPr(state))?.number;
  if (!pr) {
    return {
      details: 'No current PR is recorded while waiting for merge. Moving to cleanup.',
      nextPhaseOverride: 'CLEANUP_BRANCH',
      shouldAdvancePhase: true,
      skipPersistentWrites: false
    };
  }

  state.current_pr = pr;

  if (dryRun || !process.env.GH_TOKEN) {
    const assumeMerged = process.env.AGENT_DRY_RUN_ASSUME_MERGED === '1';
    if (assumeMerged) {
      state.current_pr = null;
      state.current_pr_url = null;
      state.branch_cleanup_required = false;
      const completedCycle = state.cycle_id || 'cycle-0001';
      completeCycle(state);
      return {
        details: `Dry run assumes PR #${pr} was merged. Completed ${completedCycle}; next cycle id is ${state.cycle_id}. Returning to IDLE without creating a cleanup PR.`,
        nextPhaseOverride: 'IDLE',
        shouldAdvancePhase: true,
        skipPersistentWrites: false
      };
    }
    return {
      details: `Waiting for PR #${pr} to be merged. No persistent files will be updated on this tick.`,
      nextPhaseOverride: 'WAITING_FOR_MANUAL_MERGE',
      shouldAdvancePhase: false,
      skipPersistentWrites: true
    };
  }

  const result = await runCommandAllowFailure('gh', ['pr', 'view', String(pr), '--json', 'state,mergedAt,url']);
  if (!result.ok) {
    return {
      details: `Could not verify PR #${pr}. Waiting without creating a new commit.`,
      nextPhaseOverride: 'WAITING_FOR_MANUAL_MERGE',
      shouldAdvancePhase: false,
      skipPersistentWrites: true
    };
  }

  const data = JSON.parse(result.stdout || '{}');
  if (data.state === 'MERGED' || data.mergedAt) {
    state.current_pr = null;
    state.current_pr_url = null;
    state.branch_cleanup_required = false;
    const completedCycle = state.cycle_id || 'cycle-0001';
    completeCycle(state);
    return {
      details: `PR #${pr} is merged. Completed ${completedCycle}; next cycle id is ${state.cycle_id}. Returning to IDLE without creating a cleanup PR.`,
      nextPhaseOverride: 'IDLE',
      shouldAdvancePhase: true,
      skipPersistentWrites: false
    };
  }

  if (data.state === 'CLOSED') {
    state.current_pr = null;
    state.current_pr_url = null;
    state.branch_cleanup_required = false;
    return {
      details: `PR #${pr} is closed without merge. Returning to IDLE for human-directed recovery.`,
      nextPhaseOverride: 'IDLE',
      shouldAdvancePhase: true,
      skipPersistentWrites: false
    };
  }

  return {
    details: `PR #${pr} is still open. Waiting without creating a new commit.`,
    nextPhaseOverride: 'WAITING_FOR_MANUAL_MERGE',
    shouldAdvancePhase: false,
    skipPersistentWrites: true
  };
}

async function cleanupMergedPr({ state, runDir, dryRun }) {
  const pr = state.current_pr;
  if (!pr) {
    return {
      details: 'No current PR is recorded. Completing cleanup.',
      nextPhaseOverride: 'IDLE',
      shouldAdvancePhase: true
    };
  }

  if (dryRun || !process.env.GH_TOKEN) {
    await writeFile(
      `${runDir}/cleanup-dry-run.md`,
      `# Cleanup dry run\n\nWould verify PR #${pr} and clear branch state.\n`,
      'utf8'
    );
    state.current_pr = null;
    state.current_pr_url = null;
    state.branch_cleanup_required = false;
    return { details: `Dry run cleanup completed for PR #${pr}.`, nextPhaseOverride: 'IDLE', shouldAdvancePhase: true };
  }

  const result = await runCommandAllowFailure('gh', ['pr', 'view', String(pr), '--json', 'state,mergedAt,url']);
  await writeFile(`${runDir}/cleanup-pr-view.txt`, result.stdout || result.stderr || result.message || '', 'utf8');
  if (!result.ok) {
    return {
      details: `Could not verify PR #${pr}. Keeping cleanup phase.`,
      nextPhaseOverride: 'CLEANUP_BRANCH',
      shouldAdvancePhase: false
    };
  }

  const data = JSON.parse(result.stdout || '{}');
  if (data.state !== 'MERGED' && !data.mergedAt) {
    return {
      details: `PR #${pr} is not merged yet. Waiting before cleanup.`,
      nextPhaseOverride: 'CLEANUP_BRANCH',
      shouldAdvancePhase: false
    };
  }

  state.current_pr = null;
  state.current_pr_url = null;
  state.branch_cleanup_required = false;
  return { details: `PR #${pr} is merged. Cleanup completed.`, nextPhaseOverride: 'IDLE', shouldAdvancePhase: true };
}

function completeCycle(state) {
  const previousCycle = state.cycle_id || 'cycle-0001';
  state.completed_cycles = Number(state.completed_cycles || 0) + 1;
  state.previous_cycle_id = previousCycle;
  state.cycle_id = incrementCycleId(previousCycle);
  state.repair_attempts = 0;
  state.pr_review_attempts = 0;
  clearBlockedState(state);
  state.current_target_url = null;
}
