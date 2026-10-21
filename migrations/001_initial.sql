CREATE TABLE IF NOT EXISTS orbit_users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
