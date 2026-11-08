# Document Studio migrations

## Layout

```
migrations/postgres/
├── 0001_document_studio.sql   # Phase 5 cloud schema (additive)
└── README.md
```

## Applying

Migrations are **not** run from a Function invocation. They run once per
environment, from a machine that holds `DATABASE_URL_DIRECT` (the non-pooled
connection string):

```bash
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f migrations/postgres/0001_document_studio.sql
```

Every statement is `CREATE … IF NOT EXISTS`, so re-running is safe. The schema is
additive: nothing existing is altered.

## Rollback

Preferred rollback is to stop using the feature, not to drop data:

1. Set `DOCUMENT_RUNTIME=local` (or remove the cloud environment variables) so
   the cloud adapters are never selected and no new rows are written.
2. Keep the tables in place.

If the tables really must go, drop them in dependency order — this deletes job
metadata only, never user files in R2:

```sql
DROP TABLE IF EXISTS document_job_events;
DROP TABLE IF EXISTS document_upload_sessions;
DROP TABLE IF EXISTS document_artifacts;
DROP TABLE IF EXISTS document_job_inputs;
DROP TABLE IF EXISTS document_jobs;
```

Deleting a job row cascades to its inputs, artifacts, upload sessions and events.
The R2 objects are removed by the cleanup service, and by the bucket lifecycle
rules as a backstop.

## Indexes and why

| Index | Query it serves |
| --- | --- |
| `(owner_id, created_at DESC)` | Activity list |
| `(status, created_at)` | queue scan |
| `(status, lease_expires_at)` | reclaim a job whose worker died |
| `(expires_at)` | retention cleanup |
| unique `(owner_id, idempotency_key)` partial | duplicate create-job retries |
