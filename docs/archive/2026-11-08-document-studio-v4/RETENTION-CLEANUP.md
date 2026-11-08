# Retention and cleanup

Three different lifetimes exist and must not be confused:

| Data | Lifetime | Where it lives | Removed by |
| --- | --- | --- | --- |
| Local job temp (`input/`, `working/`) | until the run finishes | `<root>/.system/jobs/<jobId>/` | `releaseStaging` in `finally`, plus the boot janitor |
| Local job output | until the job expires (default 7 days) | `<root>/.system/jobs/<jobId>/output/` | boot janitor, after the manifest says the job is inactive |
| Local published copy | forever | `<root>/output/` | the user |
| Cloud `/tmp` scratch | one invocation | `os.tmpdir()/tm-document-studio/<hash>-XXXXXX/` | `finally` in the runner |
| Cloud input object | until finalize + policy window | R2 `document/<hash>/<jobId>/input/…` | retention sweep |
| Cloud output artifact | `DOCUMENT_OUTPUT_RETENTION_HOURS` (24 h) | R2 `document/<hash>/<jobId>/output/…` | retention sweep, then R2 lifecycle as backstop |
| Job metadata | `DOCUMENT_JOB_HISTORY_DAYS` (7 d) | Postgres `document_jobs` | never auto-deleted; the row is marked `expired` |

The rule: **metadata outlives bytes.** A job row is kept for history after its
objects are gone, and its status becomes `expired` so the UI stops offering a
download without waiting for a physical delete.

## 1. Local runtime

`server/plugins/documentCleanup.ts` runs `cleanupOrphans()` at boot:

- a job directory whose manifest is missing is reclaimed only after a TTL, so a
  first in-flight request is not deleted;
- a job whose status is `running`, `publishing`, `queued` or `uploading` is
  **skipped**, because its manifest is the only evidence of what happened;
- a terminal job whose `expiresAt` has passed is removed.

Nothing outside `.system/jobs/<jobId>` is touched. Published files in `output/`
are user data and are never removed by a job delete.

## 2. Cloud runtime

`POST|GET /api/v1/documents/maintenance/cleanup` runs the sweep. It is public
route-wise but authenticates itself with a bearer token so a scheduler can call
it without a user session:

```
Authorization: Bearer $DOCUMENT_CLEANUP_TOKEN
```

`CRON_SECRET` is accepted too, so a Vercel Cron entry needs no custom header.
With neither configured the route answers **503** rather than running open.

One pass:

1. `findExpired(now, batch)` — jobs that are inactive and past `expiresAt`,
   capped at 50 rows per pass.
2. For each artifact past its own `expiresAt`: delete the exact stored key, then
   mark it `deleted`. A delete failure leaves the row alone and is retried next
   pass; the job is **not** marked expired while a delete is outstanding.
3. Inputs past `expiresAt` are deleted the same way.
4. Only when nothing failed in the pass does the job become `expired`.

Why exact keys and not a bucket listing: `document_artifacts.storage_key` is the
authoritative key, so a sweep never has to enumerate a shared bucket.

## 3. Scheduling

| Trigger | Effect |
| --- | --- |
| Job terminal (success/failure) | `releaseStaging` drops input and working bytes immediately |
| User deletes a job | local: job directory; cloud: objects first, then the row |
| User deletes one artifact | object + row, ownership rechecked |
| Cron / external scheduler | the sweep above |
| R2 lifecycle rule | backstop for objects the sweep could not reach |

Vercel Cron frequency depends on the plan — daily on Hobby. Retention therefore
must not rely on the cron to be correct: the UI hides an artifact whose
`expiresAt` has passed even if the object still exists, and every download route
rejects an expired artifact with `DOCUMENT_ARTIFACT_EXPIRED`.

Example `vercel.json` addition once a scheduler is provisioned (do not add it
before the route has a token):

```json
{ "crons": [{ "path": "/api/v1/documents/maintenance/cleanup", "schedule": "0 * * * *" }] }
```

## 4. R2 lifecycle rules

Configure in the Cloudflare dashboard (no CLI required, no secret in the repo):

| Rule | Prefix | Action |
| --- | --- | --- |
| Abort incomplete multipart | `document/` | abort after **1 day** |
| Expire input objects | `document/` | delete after **2 days** |
| Expire output objects | `document/` | delete after **2 days** |

The 2-day lifecycle values sit *after* the 24-hour application retention, so the
sweep normally wins and the lifecycle only catches orphans. Setting the
lifecycle shorter than retention would delete files the UI still offers.

Lifecycle rules are a safety net, not the retention policy. If a rule fires
first the artifact download answers `DOCUMENT_ARTIFACT_EXPIRED`, which is the
same answer the sweep produces — no user-visible inconsistency.

## 5. What is not implemented

- No scheduler is provisioned in this workspace, so no sweep has ever run
  against a real database.
- No R2 lifecycle rule exists; the table above is the configuration to apply.
- No backoff counter on failed deletes. A permanently failing object is retried
  every pass; the batch cap keeps that bounded but it is not exponential.
