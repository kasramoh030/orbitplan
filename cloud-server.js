#!/usr/bin/env node
/* OrbitPlan Cloud — Node 18+ companion API and static PWA server. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStorage } = require('./storage');
const { createCalendarOAuth } = require('./calendar-oauth');

const PORT = Number(process.env.PORT || 4175);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = process.env.ORBITPLAN_DATA_DIR || path.join(ROOT, '.orbitplan-data');
const TOKEN_SECRET = process.env.ORBITPLAN_TOKEN_SECRET || '';
const MAX_BODY = 1_200_000;
const TOKEN_LIFETIME_MS = Number(process.env.ORBITPLAN_TOKEN_LIFETIME_MS || 14 * 24 * 60 * 60 * 1000);
const allowedOrigins = String(process.env.CORS_ORIGINS || 'http://localhost:4174,http://127.0.0.1:4174,http://localhost:4175,http://127.0.0.1:4175').split(',').map(value => value.trim()).filter(Boolean);
const rateWindows = new Map();
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json; charset=utf-8' };

if (!TOKEN_SECRET && process.env.NODE_ENV === 'production') throw new Error('ORBITPLAN_TOKEN_SECRET is required in production.');
const signingSecret = TOKEN_SECRET || 'development-only-secret-not-for-public-deployment';
function base64url(value) { return Buffer.from(value).toString('base64url'); }
function sign(payload) { const body = base64url(JSON.stringify(payload)); return `${body}.${crypto.createHmac('sha256', signingSecret).update(body).digest('base64url')}`; }
function verify(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', signingSecret).update(body).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return payload.exp > Date.now() && payload.email ? payload : null; } catch { return null; }
}
function makeToken(email, tokenVersion = 0) { return sign({ email, tokenVersion: Number(tokenVersion || 0), exp: Date.now() + TOKEN_LIFETIME_MS }); }
function passwordRecord(password) { const salt = crypto.randomBytes(16).toString('base64'); return { salt, hash: crypto.scryptSync(password, salt, 64).toString('base64') }; }
function matchesPassword(password, record) { const derived = crypto.scryptSync(password, record.salt, 64).toString('base64'); return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(record.hash)); }
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); }
function readJson(req) { return new Promise((resolve, reject) => { let bytes = 0, body = ''; req.setEncoding('utf8'); req.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > MAX_BODY) { reject(new Error('too-large')); req.destroy(); } else body += chunk; }); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('invalid-json')); } }); req.on('error', reject); }); }
function validState(state) { return state && typeof state === 'object' && Array.isArray(state.tasks) && state.tasks.length <= 10_000; }
function validProjectPayload(payload) { return payload && typeof payload === 'object' && payload.project && typeof payload.project.name === 'string' && Array.isArray(payload.tasks) && payload.tasks.length <= 2_000; }
function inviteCode() { return crypto.randomBytes(9).toString('base64url').toUpperCase(); }
function setSecurityHeaders(res) { res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('x-frame-options', 'DENY'); res.setHeader('referrer-policy', 'strict-origin-when-cross-origin'); res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()'); }
function setCors(req, res) { const origin = req.headers.origin; if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) { res.setHeader('access-control-allow-origin', allowedOrigins.includes('*') ? '*' : origin); res.setHeader('vary', 'Origin'); } res.setHeader('access-control-allow-headers', 'content-type, authorization'); res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS'); }
function rateLimit(req, res, bucket, limit = 12, windowMs = 60_000) { const key = `${bucket}:${req.socket.remoteAddress || 'unknown'}`; const now = Date.now(), current = rateWindows.get(key) || { since: now, count: 0 }; if (now - current.since > windowMs) { current.since = now; current.count = 0; } current.count++; rateWindows.set(key, current); if (current.count > limit) { json(res, 429, { error: 'Too many requests. Try again shortly.' }); return false; } return true; }
function serveStatic(req, res) { const raw = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]; const file = path.resolve(ROOT, `.${decodeURIComponent(raw)}`); if (!file.startsWith(ROOT) || path.basename(file).startsWith('.orbitplan')) { res.writeHead(404); return res.end('Not found'); } fs.readFile(file, (error, data) => { if (error) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' }); res.end(data); }); }

async function createOrbitPlanServer() {
  const storage = await createStorage({ dataDir: DATA_DIR, databaseUrl: process.env.DATABASE_URL, databaseSsl: process.env.DATABASE_SSL === 'true' });
  const calendarOAuth = createCalendarOAuth({ storage, sign, verify });
  async function authenticated(req, res) { const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const payload = verify(token); const user = payload && await storage.getUser(payload.email); if (!payload || !user || Number(payload.tokenVersion || 0) !== Number(user.tokenVersion || 0)) { json(res, 401, { error: 'Authentication required.' }); return null; } return { ...payload, user }; }
  const server = http.createServer(async (req, res) => {
    setSecurityHeaders(res); setCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const pathname = requestUrl.pathname;
    try {
      if (pathname === '/api/health') return json(res, 200, { ok: true, service: 'OrbitPlan Cloud', storage: process.env.DATABASE_URL ? 'postgres' : 'json-development' });
      if (pathname === '/api/auth/register' && req.method === 'POST') {
        if (!rateLimit(req, res, 'register', 6)) return;
        const { name, email, password } = await readJson(req); const normalized = String(email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalized) || String(password || '').length < 10 || String(name || '').trim().length < 2) return json(res, 400, { error: 'Provide a name, a valid email, and a password with at least 10 characters.' });
        const user = { name: String(name).trim().slice(0, 80), ...passwordRecord(String(password)), createdAt: new Date().toISOString() };
        if (!await storage.createUser(normalized, user)) return json(res, 409, { error: 'An account already exists for this email.' });
        return json(res, 201, { token: makeToken(normalized, 0), user: { name: user.name, email: normalized } });
      }
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        if (!rateLimit(req, res, 'login', 10)) return;
        const { email, password } = await readJson(req); const normalized = String(email || '').trim().toLowerCase(), user = await storage.getUser(normalized);
        if (!user || !matchesPassword(String(password || ''), user)) return json(res, 401, { error: 'Email or password is incorrect.' });
        return json(res, 200, { token: makeToken(normalized, user.tokenVersion), user: { name: user.name, email: normalized } });
      }
      if (pathname === '/api/me' && req.method === 'GET') { const auth = await authenticated(req, res); if (!auth) return; const user = await storage.getUser(auth.email); return json(res, 200, { user: { name: user.name, email: auth.email } }); }
      if (pathname === '/api/auth/password' && req.method === 'POST') {
        if (!rateLimit(req, res, 'password', 6)) return; const auth = await authenticated(req, res); if (!auth) return; const { currentPassword, newPassword } = await readJson(req); const user = auth.user;
        if (!matchesPassword(String(currentPassword || ''), user) || String(newPassword || '').length < 10) return json(res, 400, { error: 'Current password is invalid or the new password is too short.' });
        const record = passwordRecord(String(newPassword)); const updated = await storage.updateUser(auth.email, { ...user, ...record, tokenVersion: Number(user.tokenVersion || 0) + 1 });
        return json(res, 200, { token: makeToken(auth.email, updated.tokenVersion), user: { name: updated.name, email: auth.email } });
      }
      if (pathname === '/api/auth/revoke-sessions' && req.method === 'POST') {
        const auth = await authenticated(req, res); if (!auth) return; const updated = await storage.updateUser(auth.email, { ...auth.user, tokenVersion: Number(auth.user.tokenVersion || 0) + 1 });
        return json(res, 200, { token: makeToken(auth.email, updated.tokenVersion) });
      }

      if (pathname === '/api/sync' && req.method === 'GET') { const auth = await authenticated(req, res); if (!auth) return; return json(res, 200, await storage.getSync(auth.email)); }
      if (pathname === '/api/sync' && req.method === 'PUT') {
        const auth = await authenticated(req, res); if (!auth) return; const { state, baseUpdatedAt, force } = await readJson(req); if (!validState(state)) return json(res, 400, { error: 'A valid OrbitPlan state with tasks is required.' });
        const remote = await storage.getSync(auth.email); if (remote.updatedAt && baseUpdatedAt && remote.updatedAt !== baseUpdatedAt && !force) return json(res, 409, { error: 'A newer cloud version exists.', updatedAt: remote.updatedAt, version: remote.version });
        const record = { state, updatedAt: new Date().toISOString(), version: Number(remote.version || 0) + 1 }; await storage.putSync(auth.email, record); return json(res, 200, { ok: true, updatedAt: record.updatedAt, version: record.version });
      }
      if (pathname === '/api/collab/projects' && req.method === 'POST') {
        if (!rateLimit(req, res, 'collab-create', 30)) return;
        const auth = await authenticated(req, res); if (!auth) return; const payload = await readJson(req); if (!validProjectPayload(payload)) return json(res, 400, { error: 'A project and up to 2,000 tasks are required.' });
        const id = `team-${crypto.randomUUID()}`, now = new Date().toISOString(), code = inviteCode(); const record = { id, ownerEmail: auth.email, title: String(payload.project.name).slice(0, 100), payload: { project: payload.project, tasks: payload.tasks }, revision: 1, updatedAt: now, updatedBy: auth.email, members: { [auth.email]: { role: 'owner', joinedAt: now } }, invites: { [code]: { role: 'editor', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } } };
        await storage.putCollabProject(record); await storage.addCollabActivity(id, { actorEmail: auth.email, action: 'project.published', details: { title: record.title } }); return json(res, 201, { project: record, inviteCode: code });
      }
      if (pathname === '/api/collab/projects' && req.method === 'GET') {
        const auth = await authenticated(req, res); if (!auth) return; const projects = await storage.listCollabProjects(auth.email); return json(res, 200, { projects: projects.map(project => ({ id: project.id, title: project.title, ownerEmail: project.ownerEmail, revision: project.revision, updatedAt: project.updatedAt, updatedBy: project.updatedBy, role: project.members?.[auth.email]?.role, members: project.members })) });
      }
      if (pathname === '/api/collab/projects/join' && req.method === 'POST') {
        if (!rateLimit(req, res, 'collab-join', 20)) return;
        const auth = await authenticated(req, res); if (!auth) return; const { code } = await readJson(req); const normalizedCode = String(code || '').trim().toUpperCase(); const project = await storage.findCollabProjectByInvite(normalizedCode);
        if (!project) return json(res, 404, { error: 'Invite code is invalid or expired.' });
        const invite = project.invites[normalizedCode]; if (!invite || new Date(invite.expiresAt) <= new Date()) return json(res, 404, { error: 'Invite code is invalid or expired.' }); const updated = await storage.addCollabMember(project.id, auth.email, { role: invite.role, joinedAt: new Date().toISOString() }); await storage.addCollabActivity(project.id, { actorEmail: auth.email, action: 'member.joined', details: { role: invite.role } }); return json(res, 200, { project: updated });
      }
      const activityMatch = pathname.match(/^\/api\/collab\/projects\/([^/]+)\/activity$/);
      if (activityMatch && req.method === 'GET') {
        const auth = await authenticated(req, res); if (!auth) return; const project = await storage.getCollabProject(decodeURIComponent(activityMatch[1])); if (!project || !project.members?.[auth.email]) return json(res, 404, { error: 'Shared project not found.' }); return json(res, 200, { activity: await storage.getCollabActivity(project.id, requestUrl.searchParams.get('limit')) });
      }
      const revokeInviteMatch = pathname.match(/^\/api\/collab\/projects\/([^/]+)\/invite\/([^/]+)$/);
      if (revokeInviteMatch && req.method === 'DELETE') {
        if (!rateLimit(req, res, 'collab-invite-revoke', 40)) return; const auth = await authenticated(req, res); if (!auth) return; const id = decodeURIComponent(revokeInviteMatch[1]), code = decodeURIComponent(revokeInviteMatch[2]).trim().toUpperCase(), project = await storage.getCollabProject(id); if (!project || project.members?.[auth.email]?.role !== 'owner') return json(res, 403, { error: 'Only the project owner can revoke invites.' }); if (!await storage.removeCollabInvite(id, code)) return json(res, 404, { error: 'Invite was not found.' }); await storage.addCollabActivity(id, { actorEmail: auth.email, action: 'invite.revoked', details: { role: project.invites?.[code]?.role || 'unknown' } }); return json(res, 200, { ok: true });
      }
      const collaborationMatch = pathname.match(/^\/api\/collab\/projects\/([^/]+)(?:\/(invite))?$/);
      if (collaborationMatch) {
        const auth = await authenticated(req, res); if (!auth) return; const id = decodeURIComponent(collaborationMatch[1]), action = collaborationMatch[2]; const project = await storage.getCollabProject(id); if (!project || !project.members?.[auth.email]) return json(res, 404, { error: 'Shared project not found.' }); const role = project.members[auth.email].role;
        if (!action && req.method === 'GET') return json(res, 200, { project });
        if (!action && req.method === 'PUT') { if (!rateLimit(req, res, 'collab-update', 80)) return; if (!['owner', 'editor'].includes(role)) return json(res, 403, { error: 'Editor permission is required.' }); const { payload, baseRevision } = await readJson(req); if (!validProjectPayload(payload)) return json(res, 400, { error: 'Valid project payload is required.' }); if (Number(baseRevision) !== Number(project.revision)) return json(res, 409, { error: 'A newer team project version exists.', revision: project.revision, project }); const next = { ...project, payload: { project: payload.project, tasks: payload.tasks }, title: String(payload.project.name).slice(0, 100), revision: Number(project.revision) + 1, updatedAt: new Date().toISOString(), updatedBy: auth.email }; const updated = await storage.updateCollabProject(next, baseRevision); if (updated.conflict) return json(res, 409, { error: 'A newer team project version exists.', revision: updated.project?.revision || 0, project: updated.project }); await storage.addCollabActivity(id, { actorEmail: auth.email, action: 'project.updated', details: { revision: updated.project.revision } }); return json(res, 200, { project: updated.project }); }
        if (action === 'invite' && req.method === 'POST') { if (!rateLimit(req, res, 'collab-invite', 40)) return; if (role !== 'owner') return json(res, 403, { error: 'Only the project owner can create invites.' }); const { inviteRole = 'editor' } = await readJson(req); if (!['editor', 'viewer'].includes(inviteRole)) return json(res, 400, { error: 'Invite role must be editor or viewer.' }); const code = inviteCode(), invite = { role: inviteRole, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }; await storage.addCollabInvite(project.id, code, invite, auth.email); await storage.addCollabActivity(project.id, { actorEmail: auth.email, action: 'invite.created', details: { role: inviteRole, expiresAt: invite.expiresAt } }); return json(res, 201, { code, role: inviteRole, expiresAt: invite.expiresAt }); }
        return json(res, 405, { error: 'Method not allowed.' });
      }
      const calendarMatch = pathname.match(/^\/api\/calendar\/(google|microsoft)\/(start|status|sync|disconnect|callback)$/);
      if (calendarMatch) {
        const [, provider, action] = calendarMatch;
        if (action === 'callback' && req.method === 'GET') {
          const email = await calendarOAuth.callback(provider, requestUrl.searchParams.get('code') || '', requestUrl.searchParams.get('state') || '');
          res.writeHead(302, { location: `/index.html?calendar=connected&provider=${encodeURIComponent(provider)}&account=${encodeURIComponent(email)}` }); return res.end();
        }
        const auth = await authenticated(req, res); if (!auth) return;
        if (action === 'start' && req.method === 'POST') return json(res, 200, await calendarOAuth.start(auth.email, provider));
        if (action === 'status' && req.method === 'GET') return json(res, 200, await calendarOAuth.status(auth.email, provider));
        if (action === 'sync' && req.method === 'POST') return json(res, 200, await calendarOAuth.sync(auth.email, provider));
        if (action === 'disconnect' && req.method === 'POST') { await calendarOAuth.disconnect(auth.email, provider); return json(res, 200, { ok: true }); }
        return json(res, 405, { error: 'Method not allowed.' });
      }
      return serveStatic(req, res);
    } catch (error) { console.error(`[OrbitPlan] ${req.method} ${pathname}:`, error.message); return json(res, error.status || (error.message === 'too-large' ? 413 : 400), { error: error.message === 'too-large' ? 'Payload is too large.' : error.message || 'Request could not be processed.' }); }
  });
  return { server, storage };
}

async function main() {
  const { server, storage } = await createOrbitPlanServer();
  server.listen(PORT, HOST, () => console.log(`OrbitPlan Cloud is running at http://${HOST}:${PORT} (${process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON development storage'})`));
  process.on('SIGTERM', async () => { server.close(); await storage.close(); });
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { createOrbitPlanServer };
