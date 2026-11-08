-- TM Document Studio v4 — Phase 5 cloud schema.
-- Additive only: this migration creates new tables and never touches existing
-- application tables. Reverting means dropping these five tables, which loses
-- only document job metadata, never user files.

CREATE TABLE IF NOT EXISTS document_jobs (
  id               UUID PRIMARY KEY,
  owner_id         TEXT NOT NULL,
  operation_id     TEXT NOT NULL,
  operation_version TEXT NOT NULL,
  runtime          TEXT NOT NULL CHECK (runtime IN ('local', 'electron', 'vercel', 'worker')),
  status           TEXT NOT NULL CHECK (status IN ('created', 'uploading', 'queued', 'running', 'cancel_requested', 'publishing', 'completed', 'partial', 'failed', 'cancelled', 'expired')),
  idempotency_key  TEXT,
  config_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_total   INTEGER NOT NULL DEFAULT 0,
  progress_completed INTEGER NOT NULL DEFAULT 0,
  progress_failed  INTEGER NOT NULL DEFAULT 0,
  progress_label   TEXT,
  input_count      INTEGER NOT NULL DEFAULT 0,
  total_input_bytes BIGINT NOT NULL DEFAULT 0,
  output_count     INTEGER NOT NULL DEFAULT 0,
  attempt          INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 1,
  lease_owner      TEXT,
  lease_expires_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cleanup_status   TEXT NOT NULL DEFAULT 'pending',
  error_code       TEXT,
  error_message_safe TEXT,
  created_at       TIMESTAMPTZ NOT NULL,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS document_jobs_owner_created_idx
  ON document_jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_jobs_status_created_idx
  ON document_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS document_jobs_status_lease_idx
  ON document_jobs (status, lease_expires_at);
CREATE INDEX IF NOT EXISTS document_jobs_expires_idx
  ON document_jobs (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS document_jobs_owner_idempotency_idx
  ON document_jobs (owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_job_inputs (
  id               UUID PRIMARY KEY,
  job_id           UUID NOT NULL REFERENCES document_jobs (id) ON DELETE CASCADE,
  owner_id         TEXT NOT NULL,
  original_name    TEXT NOT NULL,
  safe_name        TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  extension        TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL,
  sha256           TEXT,
  storage_provider TEXT NOT NULL,
  storage_key      TEXT NOT NULL,
  upload_status    TEXT NOT NULL CHECK (upload_status IN ('pending', 'uploading', 'uploaded', 'verified', 'rejected', 'expired')),
  created_at       TIMESTAMPTZ NOT NULL,
  verified_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS document_job_inputs_job_idx
  ON document_job_inputs (job_id);
CREATE INDEX IF NOT EXISTS document_job_inputs_owner_idx
  ON document_job_inputs (owner_id);

CREATE TABLE IF NOT EXISTS document_artifacts (
  id               UUID PRIMARY KEY,
  job_id           UUID NOT NULL REFERENCES document_jobs (id) ON DELETE CASCADE,
  owner_id         TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL,
  sha256           TEXT,
  storage_provider TEXT NOT NULL,
  storage_key      TEXT NOT NULL,
  artifact_status  TEXT NOT NULL CHECK (artifact_status IN ('publishing', 'ready', 'downloaded', 'delete_pending', 'deleted', 'expired')),
  download_count   INTEGER NOT NULL DEFAULT 0,
  first_downloaded_at TIMESTAMPTZ,
  last_downloaded_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS document_artifacts_job_idx
  ON document_artifacts (job_id);
CREATE INDEX IF NOT EXISTS document_artifacts_expires_idx
  ON document_artifacts (expires_at);

CREATE TABLE IF NOT EXISTS document_upload_sessions (
  id                 UUID PRIMARY KEY,
  job_id             UUID NOT NULL REFERENCES document_jobs (id) ON DELETE CASCADE,
  input_id           UUID NOT NULL,
  owner_id           TEXT NOT NULL,
  provider_upload_id TEXT,
  storage_key        TEXT NOT NULL,
  upload_mode        TEXT NOT NULL CHECK (upload_mode IN ('single', 'multipart')),
  status             TEXT NOT NULL CHECK (status IN ('pending', 'uploading', 'completed', 'aborted', 'expired')),
  parts_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS document_upload_sessions_job_idx
  ON document_upload_sessions (job_id);
CREATE INDEX IF NOT EXISTS document_upload_sessions_expires_idx
  ON document_upload_sessions (expires_at);

CREATE TABLE IF NOT EXISTS document_job_events (
  id                BIGSERIAL PRIMARY KEY,
  job_id            UUID NOT NULL REFERENCES document_jobs (id) ON DELETE CASCADE,
  owner_id          TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  payload_safe_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS document_job_events_job_idx
  ON document_job_events (job_id, created_at);
