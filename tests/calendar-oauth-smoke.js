const { createCalendarOAuth } = require('../calendar-oauth');
const originalFetch = global.fetch;
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
process.env.OAUTH_REDIRECT_BASE = 'https://plan.example.test';
process.env.CALENDAR_ENCRYPTION_KEY = 'calendar-test-encryption-key';
const state = { tasks: [{ id: 8, title: 'Local task', date: '2026-10-21', time: '10:00', duration: 45, done: false }] };
let sync = { state, updatedAt: '2026-10-20T00:00:00.000Z', version: 1 };
const calendars = new Map();
const storage = {
  async getCalendar(email, provider) { return calendars.get(`${email}:${provider}`) || null; },
  async putCalendar(email, provider, value) { calendars.set(`${email}:${provider}`, value); },
  async getSync() { return sync; },
  async putSync(_email, value) { sync = value; }
};
const sign = payload => Buffer.from(JSON.stringify(payload)).toString('base64url');
const verify = token => JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
let phase = 'exchange';
global.fetch = async (url, options = {}) => {
  if (url.includes('/token')) return { ok: true, json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 }) };
  if (options.method === 'POST' && url.includes('/events')) return { ok: true, json: async () => ({ id: 'event-8', updated: '2026-10-21T00:00:00.000Z' }) };
  if ((options.method || 'GET') === 'GET' && url.includes('event-8')) return { ok: true, json: async () => ({ id: 'event-8', summary: phase === 'pull' ? 'Changed in Google' : 'Local task', start: { dateTime: '2026-10-21T11:30:00Z' }, end: { dateTime: '2026-10-21T12:30:00Z' }, updated: phase === 'pull' ? '2026-10-22T00:00:00.000Z' : '2026-10-21T00:00:00.000Z' }) };
  if (options.method === 'PUT' && url.includes('event-8')) return { ok: true, json: async () => ({ id: 'event-8', updated: '2026-10-22T00:00:01.000Z' }) };
  throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
};

(async () => {
  const oauth = createCalendarOAuth({ storage, sign, verify });
  const started = await oauth.start('person@example.test', 'google');
  const stateToken = new URL(started.url).searchParams.get('state');
  await oauth.callback('google', 'fake-code', stateToken);
  const first = await oauth.sync('person@example.test', 'google');
  if (first.written !== 1 || first.pulled !== 0) throw new Error('Initial calendar event creation failed');
  phase = 'pull';
  const second = await oauth.sync('person@example.test', 'google');
  const task = second.state.tasks[0];
  if (second.pulled !== 1 || task.title !== 'Changed in Google' || task.time !== '11:30' || task.duration !== 60) throw new Error('Two-way calendar pull failed');
  console.log('Official OAuth calendar create/update/pull smoke test passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
