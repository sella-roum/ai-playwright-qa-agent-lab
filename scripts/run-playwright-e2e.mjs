import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';

const defaultBaseURL = 'http://127.0.0.1:5173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || defaultBaseURL;
const parsedBaseURL = new URL(baseURL);
const forwardedArgs = process.argv.slice(2);
const hasProjectArg = forwardedArgs.some((arg) => arg === '--project' || arg.startsWith('--project='));
const playwrightArgs = ['test', ...(hasProjectArg ? [] : ['--project=chromium']), ...forwardedArgs];

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.playwright-browsers');

const shouldStartServer =
  process.env.PLAYWRIGHT_EXTERNAL_SERVER !== '1' &&
  (parsedBaseURL.hostname === '127.0.0.1' || parsedBaseURL.hostname === 'localhost');

let devServerProcess = null;
let stoppingServer = false;

function isServerReady(url) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const req = http.get(url, (res) => {
      const statusCode = res.statusCode ?? 0;
      res.resume();
      done(statusCode >= 200 && statusCode <= 403);
    });

    req.on('error', () => done(false));
    req.setTimeout(1000, () => {
      req.destroy();
      done(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady(url)) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for dev server: ${url}`);
}

function spawnPlaywright() {
  const cliPath = path.resolve('node_modules/playwright/cli.js');
  return spawn(process.execPath, [cliPath, ...playwrightArgs], {
    stdio: 'inherit',
    env: process.env
  });
}

async function stopDevServer() {
  if (!devServerProcess || stoppingServer) {
    return;
  }
  stoppingServer = true;

  const waitForExit = once(devServerProcess, 'close').catch(() => []);
  if (devServerProcess.exitCode === null) {
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/pid', String(devServerProcess.pid), '/t', '/f'], {
        stdio: 'ignore'
      });
      if (result.status !== 0 && devServerProcess.exitCode === null) {
        devServerProcess.kill();
      }
      await Promise.race([waitForExit, delay(5000)]);
    } else {
      devServerProcess.kill('SIGTERM');
      await Promise.race([waitForExit, delay(5000)]);
      if (devServerProcess.exitCode === null) {
        devServerProcess.kill('SIGKILL');
      }
    }
  }
  await Promise.race([waitForExit, delay(2000)]);
}

async function startDevServer() {
  const viteCliPath = path.resolve('node_modules/vite/bin/vite.js');
  const port = parsedBaseURL.port || (parsedBaseURL.protocol === 'https:' ? '443' : '80');
  const host = parsedBaseURL.hostname;

  devServerProcess = spawn(
    process.execPath,
    [viteCliPath, 'apps/research-app', '--host', host, '--port', port, '--strictPort'],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env
    }
  );

  devServerProcess.on('error', (error) => {
    console.error(`Failed to start dev server: ${error.message}`);
  });

  await waitForServer(baseURL, 120_000);
}

async function main() {
  try {
    if (shouldStartServer) {
      await startDevServer();
    }

    const runner = spawnPlaywright();
    const [code, signal] = await once(runner, 'close');
    if (signal) {
      throw new Error(`Playwright terminated by signal: ${signal}`);
    }
    process.exitCode = code ?? 1;
  } finally {
    await stopDevServer();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
