const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 48950 + Math.floor(Math.random() * 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitplan-session-'));
const child = spawn(process.execPath, ['cloud-server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORBITPLAN_DATA_DIR: dataDir, ORBITPLAN_TOKEN_SECRET: 'session-smoke-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
async function waitForServer() { for (let i = 0; i < 30; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Cloud server did not start'); }
async function request(url, token, method = 'GET', body) { const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { response, body: await response.json() }; }
(async () => {
  await waitForServer(); const email = `session.${Date.now()}@example.test`, password = 'old-session-password';
  const registered = await request('/api/auth/register', null, 'POST', { name: 'Session User', email, password }); if (!registered.response.ok) throw new Error('Registration failed'); const firstToken = registered.body.token;
  const changed = await request('/api/auth/password', firstToken, 'POST', { currentPassword: password, newPassword: 'new-session-password' }); if (!changed.response.ok || !changed.body.token) throw new Error('Password rotation failed');
  const oldRejected = await request('/api/me', firstToken); if (oldRejected.response.status !== 401) throw new Error('Old token remained valid after password change');
  const currentAccepted = await request('/api/me', changed.body.token); if (!currentAccepted.response.ok) throw new Error('New token rejected after password change');
  const revoked = await request('/api/auth/revoke-sessions', changed.body.token, 'POST', {}); if (!revoked.response.ok || !revoked.body.token) throw new Error('Session revocation failed');
  const priorRejected = await request('/api/me', changed.body.token); if (priorRejected.response.status !== 401) throw new Error('Prior token remained valid after session revocation');
  const finalAccepted = await request('/api/me', revoked.body.token); if (!finalAccepted.response.ok) throw new Error('Replacement token rejected after session revocation');
  const oldPasswordRejected = await request('/api/auth/login', null, 'POST', { email, password }); if (oldPasswordRejected.response.status !== 401) throw new Error('Old password remained valid');
  const newPasswordAccepted = await request('/api/auth/login', null, 'POST', { email, password: 'new-session-password' }); if (!newPasswordAccepted.response.ok) throw new Error('New password login failed');
  console.log('Password rotation and token-version session revocation smoke test passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { child.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });
