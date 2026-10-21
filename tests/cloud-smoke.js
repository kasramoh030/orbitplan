const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 48100 + Math.floor(Math.random() * 400);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitplan-smoke-'));
const child = spawn(process.execPath, ['cloud-server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORBITPLAN_DATA_DIR: dataDir, ORBITPLAN_TOKEN_SECRET: 'smoke-test-secret-not-for-production' },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/health`); if (response.ok) return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error('Cloud server did not start');
}
async function run() {
  await waitForHealth();
  const email = `smoke.${Date.now()}@example.test`;
  const register = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Smoke User', email, password: 'a-long-smoke-password' }) });
  const account = await register.json(); if (!register.ok || !account.token) throw new Error('Registration failed');
  const auth = { authorization: `Bearer ${account.token}`, 'content-type': 'application/json' };
  const upload = await fetch(`http://127.0.0.1:${port}/api/sync`, { method: 'PUT', headers: auth, body: JSON.stringify({ state: { tasks: [{ id: 1, title: 'Cloud smoke', date: '2026-10-21' }] }, baseUpdatedAt: null }) });
  if (!upload.ok) throw new Error('Upload failed');
  const download = await fetch(`http://127.0.0.1:${port}/api/sync`, { headers: auth }); const state = await download.json(); if (state.state.tasks[0].title !== 'Cloud smoke') throw new Error('Download failed');
  const oauth = await fetch(`http://127.0.0.1:${port}/api/calendar/google/start`, { method: 'POST', headers: auth, body: '{}' }); if (oauth.status !== 503) throw new Error('OAuth safety guard should require provider configuration');
  console.log('Cloud API smoke test passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { child.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });
