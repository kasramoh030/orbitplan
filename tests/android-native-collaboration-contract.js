const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'orbitplan', 'app');
function read(relative) { const file = path.join(root, relative); if (!fs.existsSync(file)) throw new Error(`Missing Android source: ${relative}`); return fs.readFileSync(file, 'utf8'); }
const teamApi = read('sync/TeamProjectApi.kt');
const security = read('sync/AccountSecurity.kt');
const viewModel = read('TaskViewModel.kt');
const activity = read('MainActivity.kt');
const project = read('data/ProjectEntity.kt');
const task = read('data/TaskEntity.kt');
for (const [name, source, markers] of [
  ['team API', teamApi, ['/api/collab/projects', 'baseRevision', 'fun publish', 'fun join', 'fun invite']],
  ['account security', security, ['/api/auth/password', '/api/auth/revoke-sessions']],
  ['ViewModel', viewModel, ['fun publishProject', 'fun pullProject', 'fun pushProject', 'fun joinProject', 'applyRemoteProject']],
  ['Compose UI', activity, ['ProjectTeamCard', 'پیوستن با کد', 'AccountSecurityDialog']],
  ['project entity', project, ['remoteId', 'remoteRevision', 'collaborationRole']],
  ['task entity', task, ['collabRemoteId']]
]) for (const marker of markers) if (!source.includes(marker)) throw new Error(`Missing ${marker} in ${name}`);
console.log('Android native collaboration/session contract test passed');
