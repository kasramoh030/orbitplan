const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const required = [
  'manifest.webmanifest',
  'service-worker.js',
  'function syncCloud',
  'function exportEncryptedBackup',
  'function flashcardLabMarkup',
  'function advancedInsightData',
  'function startOfficialCalendarOAuth',
  'function recordFocusSession',
  'function shiftPlanningWeek',
  'week-task-card',
  'function projectsPage',
  'function autoScheduleProject',
  'function learningProMarkup',
  'function publishProjectToTeam',
  'function joinTeamProject',
  'function changeAccountPassword',
  'function loadTeamActivity',
  'function revokeTeamInvite',
  'OFFICIAL TWO-WAY SYNC'
];
for (const marker of required) if (!html.includes(marker)) throw new Error(`Missing product marker: ${marker}`);
for (const file of ['manifest.webmanifest', 'service-worker.js', 'cloud-server.js', 'storage.js', 'calendar-oauth.js', 'android/app/src/main/java/com/orbitplan/app/MainActivity.kt', 'android/app/src/main/java/com/orbitplan/app/sync/TeamProjectApi.kt', 'android/app/src/main/java/com/orbitplan/app/sync/AccountSecurity.kt', '.env.supabase.example', 'docker-compose.supabase.yml', 'SUPABASE_PRODUCTION_RUNBOOK_FA.md', 'netlify.toml', 'netlify/functions/orbitplan.js', 'NETLIFY_DEPLOYMENT_FA.md']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing file: ${file}`);
}
console.log('Source contract test passed');
