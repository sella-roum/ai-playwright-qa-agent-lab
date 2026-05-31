import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import https from 'node:https';

const execFileAsync = promisify(execFile);

export const PHASES = [
  'SELECT_RESEARCH_TASK',
  'PLAN_APP_CHANGE',
  'IMPLEMENT_APP',
  'EXPLORE_WITH_BROWSER',
  'WRITE_SPEC',
  'DESIGN_TESTS',
  'IMPLEMENT_PLAYWRIGHT',
  'RUN_PLAYWRIGHT',
  'REPAIR_IF_FAILED',
  'REVIEW_QA_OUTPUT',
  'UPDATE_RESEARCH_MEMORY',
  'CREATE_PR',
  'REVIEW_PR',
  'FIX_PR_REVIEW',
  'RUN_PR_CHECKS',
  'MERGE_PR',
  'WAITING_FOR_MANUAL_MERGE',
  'CLEANUP_BRANCH',
  'IDLE'
];

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayUtc() {
  return nowIso().slice(0, 10);
}

export function safeStamp(value = nowIso()) {
  return value.replace(/[:.]/g, '-');
}

export async function append(path, content) {
  const current = existsSync(path) ? await readFile(path, 'utf8') : '';
  await writeFile(path, `${current}${content}`, 'utf8');
}

export async function ensureDir(path) {
  if (!path) return;
  await mkdir(path, { recursive: true });
}

export function nextPhase(phase) {
  const index = PHASES.indexOf(phase);
  if (index === -1 || index === PHASES.length - 1) return PHASES[0];
  return PHASES[index + 1];
}

export function incrementCycleId(current) {
  const match = String(current || 'cycle-0000').match(/^(.*?)(\d+)$/);
  if (!match) return 'cycle-0001';
  const prefix = match[1] || 'cycle-';
  const width = match[2].length;
  const next = Number(match[2]) + 1;
  return `${prefix}${String(next).padStart(width, '0')}`;
}

export async function runCommand(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    ...options,
    maxBuffer: 1024 * 1024 * 20
  });
  return result;
}

export async function runCommandAllowFailure(command, args, options = {}) {
  try {
    const result = await runCommand(command, args, options);
    return { ok: true, code: 0, stdout: result.stdout || '', stderr: result.stderr || '' };
  } catch (error) {
    return {
      ok: false,
      code: typeof error?.code === 'number' ? error.code : 1,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export function startCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  return {
    child,
    getOutput: () => ({ stdout, stderr }),
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  };
}

export async function waitForUrl(url, { timeoutMs = 60_000, intervalMs = 1000 } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await requestHead(url);
      return true;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || lastError || 'unknown error'}`);
}

function requestHead(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, { method: 'GET' }, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) resolve();
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('request timeout'));
    });
    req.end();
  });
}
