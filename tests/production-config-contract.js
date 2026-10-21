const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function text(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
for (const file of ['.env.supabase.example', 'docker-compose.supabase.yml', 'SUPABASE_PRODUCTION_RUNBOOK_FA.md', 'migrations/002_collaboration_and_sessions.sql', 'netlify.toml', 'netlify/functions/orbitplan.js', 'NETLIFY_DEPLOYMENT_FA.md']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing production asset: ${file}`);
}
const env = text('.env.supabase.example');
for (const marker of ['aws-0-eu-west-1.pooler.supabase.com:5432', 'DATABASE_SSL=true', 'ORBITPLAN_TOKEN_SECRET', 'CORS_ORIGINS']) if (!env.includes(marker)) throw new Error(`Supabase template is missing ${marker}`);
const compose = text('docker-compose.supabase.yml');
if (!compose.includes('.env.supabase') || !compose.includes('restart: unless-stopped')) throw new Error('Supabase compose contract missing');
const netlify = text('netlify.toml');
for (const marker of ['functions = "netlify/functions"', 'from = "/api/*"', 'orbitplan/api/:splat', 'NODE_VERSION = "20"']) if (!netlify.includes(marker)) throw new Error(`Netlify config missing ${marker}`);
const functionSource = text('netlify/functions/orbitplan.js');
for (const marker of ['serverless-http', 'createOrbitPlanServer', 'normalizedEvent']) if (!functionSource.includes(marker)) throw new Error(`Netlify adapter missing ${marker}`);
const runbook = text('SUPABASE_PRODUCTION_RUNBOOK_FA.md');
for (const marker of ['duzlpceowvcyfnjkkqtm', 'storage: "postgres"', 'session pooler']) if (!runbook.includes(marker)) throw new Error(`Runbook missing ${marker}`);
const migration = text('migrations/002_collaboration_and_sessions.sql');
if (!migration.includes('orbit_project_activity')) throw new Error('Activity audit migration missing');
console.log('Supabase production configuration contract test passed');
