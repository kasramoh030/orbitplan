const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitplan-netlify-'));
process.env.ORBITPLAN_DATA_DIR = dataDir;
process.env.ORBITPLAN_TOKEN_SECRET = 'netlify-adapter-smoke-secret';
const { handler } = require('../netlify/functions/orbitplan');
const base = {
  headers: { host: 'example.netlify.app' },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  isBase64Encoded: false
};
function event(method, path, body) { return { ...base, httpMethod: method, path: `/.netlify/functions/orbitplan${path}`, rawUrl: `https://example.netlify.app/.netlify/functions/orbitplan${path}`, headers: { ...base.headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : null }; }
(async () => {
  const health = await handler(event('GET', '/api/health'), {});
  if (health.statusCode !== 200 || !String(health.body).includes('OrbitPlan Cloud')) throw new Error('Netlify API health adapter failed');
  const signup = await handler(event('POST', '/api/auth/register', { name: 'Netlify Test', email: `netlify.${Date.now()}@example.test`, password: 'netlify-adapter-password' }), {});
  if (signup.statusCode !== 201 || !JSON.parse(signup.body).token) throw new Error('Netlify API registration adapter failed');
  console.log('Netlify function adapter health and registration smoke test passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
