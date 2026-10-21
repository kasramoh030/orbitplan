/* Optional official Google/Microsoft calendar OAuth and one-way/two-way event transport. */
const crypto = require('crypto');

const providerConfigs = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    eventUrl: id => id ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}` : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  },
  microsoft: {
    clientId: () => process.env.MICROSOFT_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET,
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'User.Read', 'Calendars.ReadWrite'],
    eventUrl: id => id ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(id)}` : 'https://graph.microsoft.com/v1.0/me/events'
  }
};
const MICROSOFT_ORBIT_TASK_PROPERTY = 'String {66f5a359-4659-4830-9070-0114e69d71d9} Name orbitplanTaskId';

function calendarDate(task, end = false) {
  const source = new Date(`${task.date}T${task.time || '09:00'}:00Z`);
  if (end) source.setUTCMinutes(source.getUTCMinutes() + Math.max(5, Number(task.duration || 30)));
  return source.toISOString().replace('.000Z', '');
}
function createCalendarOAuth({ storage, sign, verify }) {
  const encryptionSource = process.env.CALENDAR_ENCRYPTION_KEY || '';
  const encryptionKey = encryptionSource ? crypto.createHash('sha256').update(encryptionSource).digest() : null;
  const redirectBase = String(process.env.OAUTH_REDIRECT_BASE || '').replace(/\/$/, '');
  function configuration(provider) {
    const config = providerConfigs[provider];
    if (!config || !config.clientId() || !config.clientSecret() || !redirectBase || !encryptionKey) {
      const error = new Error('Calendar OAuth is not configured. Set provider client credentials, OAUTH_REDIRECT_BASE, and CALENDAR_ENCRYPTION_KEY.'); error.status = 503; throw error;
    }
    return config;
  }
  function callbackUrl(provider) { return `${redirectBase}/api/calendar/${provider}/callback`; }
  function encrypt(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv), encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), cipher: encrypted.toString('base64') };
  }
  function decrypt(payload) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(payload.iv, 'base64')); decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.cipher, 'base64')), decipher.final()]).toString('utf8'));
  }
  async function exchange(config, provider, code) {
    const body = new URLSearchParams({ client_id: config.clientId(), client_secret: config.clientSecret(), code, redirect_uri: callbackUrl(provider), grant_type: 'authorization_code' });
    const response = await fetch(config.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error_description || payload.error || 'OAuth token exchange failed.');
    return { accessToken: payload.access_token, refreshToken: payload.refresh_token || '', expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000, eventMap: {} };
  }
  async function refreshed(config, provider, email, tokens) {
    if (tokens.expiresAt > Date.now() + 60_000) return tokens;
    if (!tokens.refreshToken) throw new Error('Calendar authorization expired. Reconnect the provider.');
    const body = new URLSearchParams({ client_id: config.clientId(), client_secret: config.clientSecret(), refresh_token: tokens.refreshToken, grant_type: 'refresh_token' });
    const response = await fetch(config.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error_description || payload.error || 'Calendar token refresh failed.');
    const next = { ...tokens, accessToken: payload.access_token, refreshToken: payload.refresh_token || tokens.refreshToken, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 };
    await storage.putCalendar(email, provider, { encryptedTokens: encrypt(next), updatedAt: new Date().toISOString() }); return next;
  }
  async function storedTokens(provider, email) { configuration(provider); const connection = await storage.getCalendar(email, provider); if (!connection) { const error = new Error('Calendar provider is not connected.'); error.status = 404; throw error; } return decrypt(connection.encryptedTokens); }
  function eventBody(provider, task) {
    const title = String(task.title || 'OrbitPlan task'), description = String(task.notes || '');
    if (provider === 'google') return { summary: title, description, start: { dateTime: calendarDate(task), timeZone: 'UTC' }, end: { dateTime: calendarDate(task, true), timeZone: 'UTC' }, extendedProperties: { private: { orbitplanTaskId: String(task.id) } } };
    return { subject: title, body: { contentType: 'text', content: description }, start: { dateTime: calendarDate(task), timeZone: 'UTC' }, end: { dateTime: calendarDate(task, true), timeZone: 'UTC' }, singleValueExtendedProperties: [{ id: MICROSOFT_ORBIT_TASK_PROPERTY, value: String(task.id) }] };
  }
  async function writeEvent(provider, config, token, task, existingId) {
    const response = await fetch(config.eventUrl(existingId), { method: existingId ? (provider === 'google' ? 'PUT' : 'PATCH') : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(eventBody(provider, task)) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || payload.error?.code || 'Calendar event sync failed.'); return { id: payload.id, updatedAt: payload.updated || payload.lastModifiedDateTime || new Date().toISOString() };
  }
  async function readEvent(provider, config, token, id) {
    const response = await fetch(config.eventUrl(id), { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || payload.error?.code || 'Calendar event read failed.'); return payload;
  }
  function remoteTask(provider, task, event) {
    const start = provider === 'google' ? (event.start?.dateTime || event.start?.date) : event.start?.dateTime;
    const end = provider === 'google' ? (event.end?.dateTime || event.end?.date) : event.end?.dateTime;
    if (!start || !end) return task;
    const begin = new Date(start), finish = new Date(end);
    const date = Number.isNaN(begin.getTime()) ? task.date : begin.toISOString().slice(0, 10);
    const time = Number.isNaN(begin.getTime()) ? task.time : begin.toISOString().slice(11, 16);
    const duration = Number.isNaN(begin.getTime()) || Number.isNaN(finish.getTime()) ? task.duration : Math.max(5, Math.round((finish - begin) / 60000));
    return { ...task, title: provider === 'google' ? (event.summary || task.title) : (event.subject || task.title), date, time, duration, updatedAt: provider === 'google' ? event.updated : event.lastModifiedDateTime };
  }
  return {
    async start(email, provider) {
      const config = configuration(provider); const state = sign({ email, provider, exp: Date.now() + 10 * 60 * 1000, flow: 'calendar-oauth' });
      const params = new URLSearchParams({ client_id: config.clientId(), redirect_uri: callbackUrl(provider), response_type: 'code', scope: config.scopes.join(' '), state, access_type: 'offline', prompt: 'consent' });
      return { url: `${config.authorize}?${params}` };
    },
    async callback(provider, code, state) {
      const decoded = verify(state); if (!decoded || decoded.provider !== provider || decoded.flow !== 'calendar-oauth') throw new Error('Invalid or expired calendar OAuth state.');
      const config = configuration(provider); const tokens = await exchange(config, provider, code); await storage.putCalendar(decoded.email, provider, { encryptedTokens: encrypt(tokens), updatedAt: new Date().toISOString() }); return decoded.email;
    },
    async status(email, provider) { configuration(provider); const connection = await storage.getCalendar(email, provider); return { connected: !!connection, updatedAt: connection?.updatedAt || null }; },
    async disconnect(email, provider) { configuration(provider); await storage.putCalendar(email, provider, { encryptedTokens: encrypt({ disconnected: true }), updatedAt: new Date().toISOString() }); },
    async sync(email, provider) {
      const config = configuration(provider); let tokens = await storedTokens(provider, email); if (tokens.disconnected) { const error = new Error('Calendar provider is disconnected.'); error.status = 404; throw error; } tokens = await refreshed(config, provider, email, tokens);
      const cloud = await storage.getSync(email); const originalTasks = Array.isArray(cloud.state?.tasks) ? cloud.state.tasks : []; const eventMap = tokens.eventMap || {}; let pulled = 0;
      const syncedTasks = [];
      for (const task of originalTasks) {
        const legacy = eventMap[String(task.id)], meta = typeof legacy === 'string' ? { id: legacy, lastSyncedAt: '' } : legacy;
        if (meta?.id) { const event = await readEvent(provider, config, tokens.accessToken, meta.id); const changedAt = event && (event.updated || event.lastModifiedDateTime || ''); if (event && changedAt && (!meta.lastSyncedAt || changedAt > meta.lastSyncedAt)) { syncedTasks.push(remoteTask(provider, task, event)); eventMap[String(task.id)] = { ...meta, lastSyncedAt: changedAt }; pulled++; continue; } }
        syncedTasks.push(task);
      }
      const tasks = syncedTasks.filter(task => task && task.date && !task.done).slice(0, 500); let written = 0;
      for (const task of tasks) { const legacy = eventMap[String(task.id)], meta = typeof legacy === 'string' ? { id: legacy } : legacy; const result = await writeEvent(provider, config, tokens.accessToken, task, meta?.id); eventMap[String(task.id)] = { id: result.id, lastSyncedAt: result.updatedAt }; written++; }
      const nextState = { ...(cloud.state || {}), tasks: syncedTasks }; const updatedAt = new Date().toISOString(); await storage.putSync(email, { state: nextState, updatedAt, version: Number(cloud.version || 0) + 1 });
      tokens.eventMap = eventMap; await storage.putCalendar(email, provider, { encryptedTokens: encrypt(tokens), updatedAt }); return { written, pulled, state: nextState, updatedAt };
    }
  };
}
module.exports = { createCalendarOAuth };
