import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const logDir = resolve(root, 'logs');
mkdirSync(logDir, { recursive: true });
const pidFile = resolve(logDir, 'services.json');
if (process.argv[2] === 'stop') {
  if (!existsSync(pidFile)) throw new Error('No recorded TrainVista processes.');
  const pids = JSON.parse(readFileSync(pidFile, 'utf8'));
  for (const name of ['backend', 'frontend']) {
    const pid = pids[name];
    if (!Number.isInteger(pid) || pid < 2) continue;
    let command;
    try { command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }); }
    catch { console.log(`${name} is already stopped.`); continue; }
    const matches = name === 'backend'
      ? command.includes('uvicorn backend.app:app') && command.includes('--port 8100')
      : command.includes(resolve(root, 'node_modules/vite/bin/vite.js')) && command.includes('--port 5180');
    if (!matches) throw new Error(`PID ${pid} is no longer the recorded service; refusing to stop it.`);
    process.kill(pid, 'SIGTERM');
    console.log(`Stopped ${name} (${pid}).`);
  }
  process.exit(0);
}
if (process.env.TRAINVISTA_MODE && process.env.TRAINVISTA_MODE !== 'demo') {
  throw new Error('This launcher supports demo mode only. Live mode is not implemented.');
}
const python = resolve(root, '.venv/bin/python');
if (!existsSync(python)) throw new Error('Create .venv and install backend/requirements.txt first.');

async function portFree(port) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied. No existing process was changed.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolvePromise));
  });
}
await portFree(8100);
await portFree(5180);
const children = [];
function launch(command, args, name) {
  const fd = openSync(resolve(logDir, `${name}.log`), 'a');
  const child = spawn(command, args, { cwd: root, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, TRAINVISTA_MODE: 'demo', PYTHONUNBUFFERED: '1' } });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  closeSync(fd);
  child.unref();
  children.push(child);
  return child.pid;
}
const backend = launch(python, ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8100'], 'backend');
const frontend = launch(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5180', '--strictPort'], 'frontend');
let ready = false;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 500));
  try {
    const api = await fetch('http://127.0.0.1:8100/api/v1/health', { signal: AbortSignal.timeout(1000) });
    const web = await fetch('http://127.0.0.1:5180', { signal: AbortSignal.timeout(1000) });
    if (api.ok && web.ok) { ready = true; break; }
  } catch { /* Wait for the processes spawned above, with a bounded deadline. */ }
}
if (!ready) {
  for (const child of children) { if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} } }
  throw new Error(`Services did not become ready. Inspect ${logDir}`);
}
writeFileSync(pidFile, JSON.stringify({ backend, frontend, startedAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ url: 'http://127.0.0.1:5180', api: 'http://127.0.0.1:8100/docs', backend, frontend, logs: logDir }, null, 2));
