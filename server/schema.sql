-- This file runs automatically when the Postgres container starts for the first time.
-- FastAPI also executes it on startup so local development and existing databases
-- both get the same idempotent schema.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 hours',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 hours';

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{"backgroundColor":"#eff5f5","shapes":[]}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canvas_folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES canvas_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE canvas_folders
ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES canvas_folders(id) ON DELETE CASCADE;

ALTER TABLE canvas_folders
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE canvases
ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES canvas_folders(id) ON DELETE SET NULL;

ALTER TABLE canvases
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS canvas_folders_owner_idx ON canvas_folders(owner_id, parent_id, sort_order ASC, name ASC);
CREATE INDEX IF NOT EXISTS canvases_folder_idx ON canvases(owner_id, folder_id, sort_order ASC, name ASC);

CREATE TABLE IF NOT EXISTS canvas_members (
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (canvas_id, user_id)
);

CREATE TABLE IF NOT EXISTS canvas_ops (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  op JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canvas_history (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forward_op JSONB NOT NULL,
  inverse_op JSONB NOT NULL,
  applied_revision BIGINT NOT NULL,
  undone_revision BIGINT,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE canvas_history
ADD COLUMN IF NOT EXISTS undone_revision BIGINT;

CREATE INDEX IF NOT EXISTS canvas_history_canvas_active_idx
ON canvas_history(canvas_id, applied_revision DESC)
WHERE undone_at IS NULL;

DROP INDEX IF EXISTS canvas_history_canvas_redo_idx;

CREATE INDEX IF NOT EXISTS canvas_history_canvas_redo_idx
ON canvas_history(canvas_id, undone_revision DESC)
WHERE undone_at IS NOT NULL;
