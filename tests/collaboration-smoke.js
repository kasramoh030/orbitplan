const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 48600 + Math.floor(Math.random() * 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitplan-collab-'));
const child = spawn(process.execPath, ['cloud-server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ORBITPLAN_DATA_DIR: dataDir, ORBITPLAN_TOKEN_SECRET: 'collaboration-smoke-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
async function waitForServer() { for (let i = 0; i < 30; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Cloud server did not start'); }
async function createAccount(name) { const email = `${name}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.test`; const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, password: 'a-long-collaboration-password' }) }); const body = await response.json(); if (!response.ok) throw new Error('Account setup failed'); return { ...body, email: body.user.email }; }
async function api(url, token, method = 'GET', body) { const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { response, body: await response.json() }; }
(async () => {
  await waitForServer(); const owner = await createAccount('Owner'), editor = await createAccount('Editor');
  const payload = { project: { name: 'Shared research', deadline: '2026-12-01' }, tasks: [{ id: 1, title: 'Draft', date: '2026-11-01', duration: 45 }] };
  const created = await api('/api/collab/projects', owner.token, 'POST', payload); if (created.response.status !== 201 || !created.body.inviteCode) throw new Error('Project publish failed');
  const joined = await api('/api/collab/projects/join', editor.token, 'POST', { code: created.body.inviteCode }); if (!joined.response.ok || joined.body.project.members[editor.email].role !== 'editor') throw new Error('Invite join failed');
  const loaded = await api(`/api/collab/projects/${created.body.project.id}`, editor.token); if (!loaded.response.ok || loaded.body.project.payload.tasks.length !== 1) throw new Error('Shared project load failed');
  const activityAfterJoin = await api(`/api/collab/projects/${created.body.project.id}/activity`, editor.token); if (!activityAfterJoin.response.ok || !activityAfterJoin.body.activity.some(item => item.action === 'project.published') || !activityAfterJoin.body.activity.some(item => item.action === 'member.joined')) throw new Error('Project activity feed failed');
  const viewerInvite = await api(`/api/collab/projects/${created.body.project.id}/invite`, owner.token, 'POST', { inviteRole: 'viewer' }); if (!viewerInvite.response.ok || viewerInvite.body.role !== 'viewer') throw new Error('Viewer invite creation failed');
  const editorCannotRevoke = await api(`/api/collab/projects/${created.body.project.id}/invite/${viewerInvite.body.code}`, editor.token, 'DELETE'); if (editorCannotRevoke.response.status !== 403) throw new Error('Invite revoke role guard failed');
  const revokedInvite = await api(`/api/collab/projects/${created.body.project.id}/invite/${viewerInvite.body.code}`, owner.token, 'DELETE'); if (!revokedInvite.response.ok) throw new Error('Invite revoke failed');
  const activityAfterRevoke = await api(`/api/collab/projects/${created.body.project.id}/activity`, owner.token); if (!activityAfterRevoke.body.activity.some(item => item.action === 'invite.revoked')) throw new Error('Invite revoke activity was not recorded');
  const changed = { ...loaded.body.project.payload, tasks: [...loaded.body.project.payload.tasks, { id: 2, title: 'Review', date: '2026-11-02', duration: 30 }] };
  const updated = await api(`/api/collab/projects/${created.body.project.id}`, editor.token, 'PUT', { payload: changed, baseRevision: loaded.body.project.revision }); if (!updated.response.ok || updated.body.project.revision !== 2) throw new Error('Editor update failed');
  const conflict = await api(`/api/collab/projects/${created.body.project.id}`, owner.token, 'PUT', { payload, baseRevision: 1 }); if (conflict.response.status !== 409) throw new Error('Revision conflict guard failed');
  const forbiddenInvite = await api(`/api/collab/projects/${created.body.project.id}/invite`, editor.token, 'POST', { inviteRole: 'viewer' }); if (forbiddenInvite.response.status !== 403) throw new Error('Role guard failed');
  console.log('Collaboration roles, invite, update, and conflict smoke test passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { child.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); });
