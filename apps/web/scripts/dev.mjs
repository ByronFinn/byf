#!/usr/bin/env node
// Dev orchestration for @byfriends/web: run web-server (API, bun --watch) and
// web-client (Vite) concurrently, each on a free port, agreeing on ports via env.
// No `concurrently` dependency — spawns two `bun` children and prefixes their output.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const serverDir = join(root, 'server');
const clientDir = join(root, 'client');

const DEFAULT_API_PORT = 4100;
const DEFAULT_WEB_PORT = 4200;
const MAX_PROBE = 50;

async function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen({ port, host: '127.0.0.1', exclusive: true });
  });
}

async function pickPort(startPort, exclude = new Set()) {
  for (let port = startPort; port < startPort + MAX_PROBE; port += 1) {
    if (exclude.has(port)) continue;
    if (await isFree(port)) return port;
  }
  throw new Error(`no free port in [${startPort}, ${startPort + MAX_PROBE})`);
}

const requestedApi = Number(process.env.PORT) || DEFAULT_API_PORT;
const apiPort = await pickPort(requestedApi);
if (apiPort !== requestedApi) {
  process.stdout.write(`[web] api port ${requestedApi} busy, using ${apiPort} instead\n`);
}

const requestedWeb = Number(process.env.WEB_PORT) || DEFAULT_WEB_PORT;
const webPort = await pickPort(requestedWeb, new Set([apiPort]));
if (webPort !== requestedWeb) {
  process.stdout.write(`[web] web port ${requestedWeb} busy, using ${webPort} instead\n`);
}

process.stdout.write(`[web] client → http://localhost:${webPort}  (api on ${apiPort})\n`);

const sharedEnv = { ...process.env, PORT: String(apiPort), WEB_PORT: String(webPort) };

function pipe(child, prefix, color) {
  const RESET = '\x1b[0m';
  let buf = '';
  const writeLine = (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(`${color}[${prefix}]${RESET} ${line}\n`);
    }
  };
  child.stdout.on('data', writeLine);
  child.stderr.on('data', writeLine);
}

const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

const serverChild = spawn('bun', ['--watch', 'src/index.ts'], {
  cwd: serverDir,
  env: sharedEnv,
  stdio: 'pipe',
  shell: false,
});
pipe(serverChild, 'server', CYAN);

const clientChild = spawn('bun', ['run', 'dev'], {
  cwd: clientDir,
  env: sharedEnv,
  stdio: 'pipe',
  shell: false,
});
pipe(clientChild, 'client', MAGENTA);

let exiting = false;
const exit = (code) => {
  if (exiting) return;
  exiting = true;
  serverChild.kill('SIGTERM');
  clientChild.kill('SIGTERM');
  process.exit(code ?? 0);
};

for (const child of [serverChild, clientChild]) {
  child.on('exit', (code, signal) => {
    if (signal !== null) process.kill(process.pid, signal);
    else exit(code ?? 0);
  });
}

process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));
