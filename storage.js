/* Storage adapters for OrbitPlan Cloud. JSON is for local development; PostgreSQL is for deployment. */
const fs = require('fs');
const path = require('path');

class JsonStorage {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'orbitplan-db.json');
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { users: parsed.users || {}, sync: parsed.sync || {}, calendars: parsed.calendars || {}, collaboration: parsed.collaboration || { projects: {} } };
    } catch { this.data = { users: {}, sync: {}, calendars: {}, collaboration: { projects: {} } }; }
    this.data.collaboration.projects = this.data.collaboration.projects || {};
    this.data.collaboration.activity = this.data.collaboration.activity || {};
  }
  persist() { const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 }); fs.renameSync(temporary, this.file); }
  async getUser(email) { return this.data.users[email] || null; }
  async createUser(email, user) { if (this.data.users[email]) return false; this.data.users[email] = { tokenVersion: 0, ...user }; this.persist(); return true; }
  async updateUser(email, updates) { if (!this.data.users[email]) return null; this.data.users[email] = { ...this.data.users[email], ...updates }; this.persist(); return this.data.users[email]; }
  async getSync(email) { return this.data.sync[email] || { state: null, updatedAt: null, version: 0 }; }
  async putSync(email, record) { this.data.sync[email] = record; this.persist(); }
  async getCalendar(email, provider) { return this.data.calendars[`${email}:${provider}`] || null; }
  async putCalendar(email, provider, value) { this.data.calendars[`${email}:${provider}`] = value; this.persist(); }
  async getCollabProject(id) { return this.data.collaboration.projects[id] || null; }
  async putCollabProject(record) { this.data.collaboration.projects[record.id] = record; this.persist(); return record; }
  async updateCollabProject(record, baseRevision) { const current = this.data.collaboration.projects[record.id]; if (!current || Number(current.revision) !== Number(baseRevision)) return { conflict: true, project: current || null }; this.data.collaboration.projects[record.id] = record; this.persist(); return { conflict: false, project: record }; }
  async addCollabMember(id, email, member) { const project = this.data.collaboration.projects[id]; if (!project) return null; project.members = project.members || {}; project.members[email] = member; this.persist(); return project; }
  async addCollabInvite(id, code, invite) { const project = this.data.collaboration.projects[id]; if (!project) return null; project.invites = project.invites || {}; project.invites[code] = invite; this.persist(); return project; }
  async removeCollabInvite(id, code) { const project = this.data.collaboration.projects[id]; if (!project?.invites?.[code]) return false; delete project.invites[code]; this.persist(); return true; }
  async addCollabActivity(id, event) { if (!this.data.collaboration.projects[id]) return null; const records = this.data.collaboration.activity[id] || []; const record = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...event, createdAt: event.createdAt || new Date().toISOString() }; records.unshift(record); this.data.collaboration.activity[id] = records.slice(0, 250); this.persist(); return record; }
  async getCollabActivity(id, limit = 40) { return (this.data.collaboration.activity[id] || []).slice(0, Math.max(1, Math.min(100, Number(limit) || 40))); }
  async listCollabProjects(email) { return Object.values(this.data.collaboration.projects).filter(project => project.members?.[email]); }
  async findCollabProjectByInvite(code) { return Object.values(this.data.collaboration.projects).find(project => project.invites?.[code] && new Date(project.invites[code].expiresAt) > new Date()) || null; }
  async close() {}
}

class PostgresStorage {
  constructor(pool) { this.pool = pool; }
  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orbit_users (
        email TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE orbit_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS orbit_sync (
        email TEXT PRIMARY KEY REFERENCES orbit_users(email) ON DELETE CASCADE,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS orbit_calendar_connections (
        email TEXT NOT NULL REFERENCES orbit_users(email) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        encrypted_tokens JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, provider)
      );
      CREATE TABLE IF NOT EXISTS orbit_shared_projects (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL REFERENCES orbit_users(email) ON DELETE CASCADE,
        title TEXT NOT NULL,
        payload JSONB NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT NOT NULL REFERENCES orbit_users(email)
      );
      CREATE TABLE IF NOT EXISTS orbit_project_members (
        project_id TEXT NOT NULL REFERENCES orbit_shared_projects(id) ON DELETE CASCADE,
        email TEXT NOT NULL REFERENCES orbit_users(email) ON DELETE CASCADE,
        role TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, email)
      );
      CREATE TABLE IF NOT EXISTS orbit_project_invites (
        code TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES orbit_shared_projects(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES orbit_users(email),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orbit_project_activity (
        id BIGSERIAL PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES orbit_shared_projects(id) ON DELETE CASCADE,
        actor_email TEXT NOT NULL REFERENCES orbit_users(email),
        action TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS orbit_project_activity_project_created_idx ON orbit_project_activity (project_id, created_at DESC);
    `);
  }
  async getUser(email) { const { rows } = await this.pool.query('SELECT email, name, salt, password_hash AS hash, token_version AS "tokenVersion", created_at AS "createdAt" FROM orbit_users WHERE email = $1', [email]); return rows[0] || null; }
  async createUser(email, user) { try { await this.pool.query('INSERT INTO orbit_users (email, name, salt, password_hash, token_version, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [email, user.name, user.salt, user.hash, 0, user.createdAt]); return true; } catch (error) { if (error.code === '23505') return false; throw error; } }
  async updateUser(email, updates) {
    const current = await this.getUser(email); if (!current) return null; const next = { ...current, ...updates };
    await this.pool.query('UPDATE orbit_users SET name=$2, salt=$3, password_hash=$4, token_version=$5 WHERE email=$1', [email, next.name, next.salt, next.hash, Number(next.tokenVersion || 0)]); return next;
  }
  async getSync(email) { const { rows } = await this.pool.query('SELECT state, updated_at AS "updatedAt", version FROM orbit_sync WHERE email = $1', [email]); return rows[0] || { state: null, updatedAt: null, version: 0 }; }
  async putSync(email, record) { await this.pool.query(`INSERT INTO orbit_sync (email, state, updated_at, version) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at, version = EXCLUDED.version`, [email, record.state, record.updatedAt, record.version]); }
  async getCalendar(email, provider) { const { rows } = await this.pool.query('SELECT encrypted_tokens AS "encryptedTokens", updated_at AS "updatedAt" FROM orbit_calendar_connections WHERE email = $1 AND provider = $2', [email, provider]); return rows[0] || null; }
  async putCalendar(email, provider, value) { await this.pool.query(`INSERT INTO orbit_calendar_connections (email, provider, encrypted_tokens, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (email, provider) DO UPDATE SET encrypted_tokens = EXCLUDED.encrypted_tokens, updated_at = EXCLUDED.updated_at`, [email, provider, value.encryptedTokens, value.updatedAt]); }
  async getCollabProject(id) {
    const { rows } = await this.pool.query('SELECT id, owner_email AS "ownerEmail", title, payload, revision, updated_at AS "updatedAt", updated_by AS "updatedBy" FROM orbit_shared_projects WHERE id=$1', [id]);
    if (!rows[0]) return null; const record = rows[0];
    const members = await this.pool.query('SELECT email, role, joined_at AS "joinedAt" FROM orbit_project_members WHERE project_id=$1', [id]);
    const invites = await this.pool.query('SELECT code, role, expires_at AS "expiresAt" FROM orbit_project_invites WHERE project_id=$1 AND expires_at > NOW()', [id]);
    record.members = Object.fromEntries(members.rows.map(member => [member.email, { role: member.role, joinedAt: member.joinedAt }])); record.invites = Object.fromEntries(invites.rows.map(invite => [invite.code, { role: invite.role, expiresAt: invite.expiresAt }])); return record;
  }
  async putCollabProject(record) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); await client.query(`INSERT INTO orbit_shared_projects (id, owner_email, title, payload, revision, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,payload=EXCLUDED.payload,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`, [record.id, record.ownerEmail, record.title, record.payload, record.revision, record.updatedAt, record.updatedBy]); await client.query('DELETE FROM orbit_project_members WHERE project_id=$1', [record.id]); for (const [email, member] of Object.entries(record.members || {})) await client.query('INSERT INTO orbit_project_members (project_id,email,role,joined_at) VALUES ($1,$2,$3,$4)', [record.id, email, member.role, member.joinedAt || new Date().toISOString()]); await client.query('DELETE FROM orbit_project_invites WHERE project_id=$1', [record.id]); for (const [code, invite] of Object.entries(record.invites || {})) await client.query('INSERT INTO orbit_project_invites (code,project_id,role,created_by,expires_at) VALUES ($1,$2,$3,$4,$5)', [code, record.id, invite.role, record.updatedBy, invite.expiresAt]); await client.query('COMMIT'); return record; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async updateCollabProject(record, baseRevision) { const result = await this.pool.query('UPDATE orbit_shared_projects SET title=$2,payload=$3,revision=$4,updated_at=$5,updated_by=$6 WHERE id=$1 AND revision=$7 RETURNING id', [record.id, record.title, record.payload, record.revision, record.updatedAt, record.updatedBy, baseRevision]); if (!result.rows[0]) return { conflict: true, project: await this.getCollabProject(record.id) }; return { conflict: false, project: await this.getCollabProject(record.id) }; }
  async addCollabMember(id, email, member) { const result = await this.pool.query('INSERT INTO orbit_project_members (project_id,email,role,joined_at) VALUES ($1,$2,$3,$4) ON CONFLICT (project_id,email) DO UPDATE SET role=EXCLUDED.role,joined_at=EXCLUDED.joined_at RETURNING project_id', [id, email, member.role, member.joinedAt || new Date().toISOString()]); return result.rows[0] ? this.getCollabProject(id) : null; }
  async addCollabInvite(id, code, invite, createdBy) { const result = await this.pool.query('INSERT INTO orbit_project_invites (code,project_id,role,created_by,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING project_id', [code, id, invite.role, createdBy, invite.expiresAt]); return result.rows[0] ? this.getCollabProject(id) : null; }
  async removeCollabInvite(id, code) { const { rows } = await this.pool.query('DELETE FROM orbit_project_invites WHERE project_id=$1 AND code=$2 RETURNING code', [id, code]); return !!rows[0]; }
  async addCollabActivity(id, event) { const { rows } = await this.pool.query('INSERT INTO orbit_project_activity (project_id,actor_email,action,details,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, actor_email AS "actorEmail", action, details, created_at AS "createdAt"', [id, event.actorEmail, event.action, event.details || {}, event.createdAt || new Date().toISOString()]); return rows[0] || null; }
  async getCollabActivity(id, limit = 40) { const { rows } = await this.pool.query('SELECT id, actor_email AS "actorEmail", action, details, created_at AS "createdAt" FROM orbit_project_activity WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2', [id, Math.max(1, Math.min(100, Number(limit) || 40))]); return rows; }
  async listCollabProjects(email) { const { rows } = await this.pool.query('SELECT project_id FROM orbit_project_members WHERE email=$1 ORDER BY joined_at DESC', [email]); return Promise.all(rows.map(row => this.getCollabProject(row.project_id))); }
  async findCollabProjectByInvite(code) { const { rows } = await this.pool.query('SELECT project_id FROM orbit_project_invites WHERE code=$1 AND expires_at > NOW()', [code]); return rows[0] ? this.getCollabProject(rows[0].project_id) : null; }
  async close() { await this.pool.end(); }
}

async function createStorage({ dataDir, databaseUrl, databaseSsl = false }) { if (!databaseUrl) return new JsonStorage(dataDir); let Pool; try { ({ Pool } = require('pg')); } catch { throw new Error('DATABASE_URL is configured but the pg package is not installed. Run npm install.'); } const pool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl ? { rejectUnauthorized: false } : undefined }); const store = new PostgresStorage(pool); await store.initialize(); return store; }
module.exports = { createStorage };
