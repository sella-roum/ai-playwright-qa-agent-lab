import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const statePath = '.agent/state.json';
const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, '-');
const runDir = `.agent/runs/${stamp}-timeout-recorder`;
const timeoutMinutes = readPositiveNumber(process.env.AGENT_TICK_TIMEOUT_MINUTES, 45);

await ensureDir(runDir);
await ensureDir('.agent/blockers');

const state = await readState();
const cycle = state.cycle_id || 'cycle-0001';
const phase = state.phase || 'UNKNOWN';
const blockerPath = `.agent/blockers/${cycle}-${stamp}-agent-tick-timeout.md`;
const reason = `agent:tick exceeded ${timeoutMinutes} minutes before it could complete and persist a normal phase result.`;

state.consecutive_failures = Number(state.consecutive_failures || 0) + 1;
state.blocked_until_user_review = true;
state.blocked_reason = reason;
state.blocked_at = startedAt;
state.blocker_path = blockerPath;
state.last_tick_at = startedAt;

const blocker = `# Agent Blocker: agent-tick timed out

- Blocked at: ${startedAt}
- Cycle: ${cycle}
- Phase at timeout: ${phase}
- Timeout: ${timeoutMinutes} minutes
- Run directory: ${runDir}

## Reason

${reason}

This blocker is written by the workflow timeout recorder. It means the agent process did not finish in time, so the next scheduled run must not silently retry the same phase forever.

## Next action

Review the workflow logs and artifact evidence, fix the root cause, then run the workflow manually with \`command=resume\` when the same phase can be retried safely.
`;

const summary = `# Agent Tick Timeout

- Started: ${startedAt}
- Status: timed_out
- Cycle: ${cycle}
- Phase: ${phase}
- Timeout: ${timeoutMinutes} minutes
- Blocked until user review: true
- Blocker: ${blockerPath}

## Details

${reason}
`;

await writeFile(blockerPath, blocker, 'utf8');
await writeJson(statePath, state);
await writeFile(`${runDir}/summary.md`, summary, 'utf8');
await writeFile('.agent/latest-summary.md', summary, 'utf8');
await appendFile(
  '.agent/memory.md',
  `\n## ${startedAt} agent-tick timeout\n\n- Status: timed_out\n- Cycle: ${cycle}\n- Phase: ${phase}\n- Timeout: ${timeoutMinutes} minutes\n- Blocker: ${blockerPath}\n\n`,
  'utf8'
);

async function readState() {
  try {
    const content = await readFile(statePath, 'utf8');
    return JSON.parse(content || '{}');
  } catch {
    return { phase: 'SELECT_RESEARCH_TASK', cycle_id: 'cycle-0001' };
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function ensureDir(path) {
  if (!path || existsSync(path)) return;
  await mkdir(path, { recursive: true });
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
