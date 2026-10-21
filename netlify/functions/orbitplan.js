/* Netlify adapter for the existing OrbitPlan Node API.
   API traffic is rewritten by netlify.toml, while the PWA remains static. */
const serverless = require('serverless-http');
const { createOrbitPlanServer } = require('../../cloud-server');

let proxyPromise;
function normalizedEvent(event) {
  const prefix = '/.netlify/functions/orbitplan';
  const originalPath = String(event.path || '/');
  const path = originalPath.startsWith(prefix) ? (originalPath.slice(prefix.length) || '/') : originalPath;
  const rawUrl = event.rawUrl ? event.rawUrl.replace(prefix, '') : undefined;
  return { ...event, path, ...(rawUrl ? { rawUrl } : {}) };
}

exports.handler = async (event, context) => {
  proxyPromise ||= createOrbitPlanServer().then(({ server }) => serverless(server));
  const proxy = await proxyPromise;
  return proxy(normalizedEvent(event), context);
};
