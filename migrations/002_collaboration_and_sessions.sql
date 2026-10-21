ALTER TABLE orbit_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

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
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, email)
);

CREATE TABLE IF NOT EXISTS orbit_project_invites (
  code TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES orbit_shared_projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
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

CREATE INDEX IF NOT EXISTS orbit_project_activity_project_created_idx
  ON orbit_project_activity (project_id, created_at DESC);
