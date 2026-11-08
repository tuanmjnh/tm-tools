# Cloud architecture — Phase 5–9

Companion to [`TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md`](../pdf/TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md).
That document is authoritative for the decisions below; this one records what the
code does with them.

## 1. Decisions (from the completion guide §1, §2, §20)

| Concern | Decision | Status in code |
| --- | --- | --- |
| Cloud job metadata | **PostgreSQL on Neon**, not MongoDB | schema + `PostgresJobRepository` implemented; no database provisioned here |
| Cloud object storage | **TM Hub Storage Gateway** first (Hub owns the provider credentials); **Cloudflare R2 private bucket** for a deployment that sets `DOCUMENT_STORAGE_DRIVER=r2`. Neither uses Vercel Blob | `HubStorageProvider` + `server/utils/hubStorage.ts` implemented against the live gateway contract; `CloudflareR2StorageProvider` implemented but unprovisioned |
| No storage connection | cloud runtime reports `ephemeral`; `/tmp` serves one request only | `EphemeralOutputDelivery`, `ephemeralOutputDelivery`, `/api/v1/documents/run` inline base64 |
| Local/Electron persistence | local JSON manifests under `.system/jobs/` | implemented and tested |
| Local/Electron storage | local filesystem | implemented and tested |
| AI extraction | stays on `/pdf/extract` and `/api/v1/pdf/extract/**` | untouched |

**Update 2026-11-07 (live gateway verified):** Hub is the default driver because
it owns the provider credentials, so tm-tools holds only its own server-side App
Secret. The gateway now exists at `/api/v1/apps/{appId}/storage` and the client
is written against the shapes it actually returns:

| Call | Route | Notes |
| --- | --- | --- |
| list connections | `GET /connections` | metadata only; grants and provider keys never leave Hub |
| sign one PUT | `POST /uploads/initiate` | `{ connectionId, namespace, relativePath, fileName, contentType, sizeBytes, overwrite }` → `uploadId`, `objectId`, `uploadUrl`, `headers`, `expiresAt`, `transferMode` |
| close the session | `POST /uploads/{uploadId}/complete` | Hub HEADs the object and marks it `ready`; idempotent |
| drop the session | `POST /uploads/{uploadId}/abort` | used when the provider rejects the bytes |
| read metadata | `GET /objects/{objectId}` | `404` means gone |
| read bytes | `POST /objects/{objectId}/download-grant` | signed URL stays on the server, which streams the bytes |
| delete | `DELETE /objects/{objectId}` | `404` is already gone |

Success is `{ success: true, data }`; a failure is
`{ error: true, statusCode, statusMessage: 'storage.*', message }`. tm-tools
stores the Hub `objectId` as the durable handle, so reads and deletes resolve
through Hub's manifest instead of re-deriving a bucket path. Live probe on
2026-11-07: the local Hub accepted the app identity but returned **zero** storage
connections, so an upload intent refuses with
`DOCUMENT_STORAGE_NOT_CONFIGURED { reason: 'no-hub-storage-connection' }` until
the owner creates a Storage Connection.

**Correction to an earlier draft of this document set:** `MIGRATION-PLAN.md` §6
previously proposed MongoDB because auth already used it. The completion guide
§1.2 forbids that ("Không thêm MongoDB cho implementation mới"). The MongoDB
repository that was briefly added has been removed; nothing depends on it.

## 2. Boundary

```
Browser
  │  (1) authenticated JSON: create job + declare inputs
  ▼
Nitro /api/v1/documents/**            ← auth, ownership, quota, capability gate
  │  (2) POST upload-intent → provider grant (short TTL)
  │  (3) browser PUTs bytes ──────────────────────────────► Hub Storage Gateway
  │  (4) POST complete → HEAD object, verify size/type/owner   or R2 (private)
  │  (5) POST execute → bounded processing
  ▼
Function scratch (/tmp only)  ──►  engine  ──►  provider output prefix
  │  (6) transaction: insert artifact + complete job
  ▼
PostgreSQL (Neon)                     ← jobs, inputs, artifacts, upload sessions, events
```

With Hub as the driver the browser receives the **upload** grant only: Nitro
authorizes the caller, asks Hub to `initiate` one object, and returns that
short-lived signed URL plus its required headers and the session id. The browser
PUTs (or POSTs) straight to the provider, then calls `complete` with the session
id; Nitro asks Hub to close the session, which HEADs the object before it can be
used. The **download** grant is different: it is fetched by Nitro from
`/objects/{objectId}/download-grant` and the bytes are streamed back through the
authenticated route, so a provider-signed read URL never reaches the page, a log
line or an error message.

Rules the code enforces:

- Object never flows through the Function body: the browser talks to the provider
  directly with a short-lived grant, so the 4.5 MB payload limit is irrelevant
  for durable uploads.
- `/tmp` is scratch. Every execution directory is `mkdtemp`-unique and removed in
  `finally`; nothing reads it after the response. When there is no storage
  driver at all, `/documents/run` returns the result inline (base64, ≤3 MB) and
  job-id routes refuse with `DOCUMENT_RUNTIME_NOT_SUPPORTED`
  (`use-single-request-run`) instead of answering a dead link.
- The database is the source of truth for job state; `/tmp` never is.
- Storage keys are server-generated and opaque. R2 keeps
  `document/<sha256(ownerId)[0:16]>/<jobId>/{input|output}/<id>/<safeName>`; Hub
  gets the same hashed-owner shape as a `relativePath` inside the configured
  namespace and returns an `objectId`, which is the handle tm-tools persists.
  No email, name, user id or token appears in either.
- Signed grants are bearer credentials. The upload grant is returned exactly once
  to the signed-in browser and never stored or logged; the download grant never
  leaves the server. A Hub error message is reduced to its stable
  `storage.*` code before it becomes `hubCode`, because Hub may echo the grant it
  refused.
- Below 25 MB an input is one signed `PUT`. Above it, R2 gets multipart with 5 MB
  parts; Hub always gets one signed `PUT` (`transferMode`) because the gateway
  has no multipart route, and asks for multipart there is refused. Either way
  the record stays `pending` until a finalize `HEAD` (Hub: closing the upload
  session) matches the declared byte count, and only then flips to `verified`.

## 3. Schema

Migration `migrations/postgres/0001_document_studio.sql` creates five tables:

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `document_jobs` | one row per job | PK `id`; unique `(owner_id, idempotency_key)` where key is not null; indexes on `(owner_id, created_at DESC)`, `(status, created_at)`, `(status, lease_expires_at)`, `(expires_at)` |
| `document_job_inputs` | declared + uploaded inputs | FK → jobs `ON DELETE CASCADE`; `upload_status` enum |
| `document_artifacts` | published outputs | FK → jobs; `artifact_status` enum |
| `document_upload_sessions` | upload lifecycle (R2 multipart, Hub session) | FK → jobs; stores `provider_upload_id` and part ETags only |
| `document_job_events` | append-only audit of transitions | FK → jobs; `payload_safe_json` holds metadata only |

Leases: `lease_owner` + `lease_expires_at` on the job row. Claiming is a single
conditional `UPDATE … WHERE status = 'queued' AND (lease_expires_at IS NULL OR
lease_expires_at < now()) RETURNING *`, so two workers cannot both win.

Transactions are used only for short metadata operations. No transaction is held
open while an engine runs or while an object is uploaded.

## 4. Runtime selection

```
DOCUMENT_RUNTIME unset
  ├─ VERCEL / AWS_LAMBDA_FUNCTION_NAME  → vercel
  ├─ process.versions.electron / TOOLS_DATA_DIR → electron (local adapters)
  └─ otherwise → local (local adapters)

storage driver (auto) = NUXT_HUB_APP_SECRET + hub URL ? 'hub'
                      : R2_* complete ? 'r2'
                      : 'none'
```

An explicit `DOCUMENT_STORAGE_DRIVER=r2` wins over a configured Hub, for a
deployment that owns its bucket and does not want Hub in the path.

Local and Electron must never require `DATABASE_URL`, R2 credentials or a Hub
session. Cloud with a driver needs Postgres; `documentRuntime()` raises
`DOCUMENT_DATABASE_NOT_CONFIGURED` or `DOCUMENT_STORAGE_NOT_CONFIGURED`, naming
the one provider that is missing rather than refusing the runtime. Cloud with no
driver at all is not an error: it is `storageMode() === 'ephemeral'`, and
`/api/v1/documents/health` reports `{ driver: 'none', mode: 'ephemeral' }` so a
monitor can see it without guessing.

## 5. Per-operation capability, not a global block

`DocumentOperationDefinition.execution` is extended by a per-runtime support
table:

```ts
interface OperationRuntimeSupport {
  runtime: 'local' | 'electron' | 'vercel' | 'worker'
  enabled: boolean
  executionMode: 'sync' | 'async' | 'worker'
  maxInputFiles: number
  maxInputBytes: number
  maxTotalInputBytes: number
  maxPages?: number
  maxEstimatedScratchBytes?: number
  reasonDisabled?: string
}
```

`DOCUMENT_RUNTIME_NOT_SUPPORTED` is returned **only** when the requested
operation has no adapter for the current runtime — never because the runtime is
cloud. An operation that is supported but too large returns
`DOCUMENT_WORKER_REQUIRED` with the measured estimate, so the caller can retry on
a worker instead of failing halfway.

## 6. What is not built yet

- **No Storage Connection exists on the Hub side.** The gateway is live and
  accepts this app's `X-App-Id` + `X-App-Secret`, but
  `GET /api/v1/apps/tm-tools_nttweh/storage/connections` returns an empty list
  (checked 2026-11-07). An upload intent therefore refuses with
  `DOCUMENT_STORAGE_NOT_CONFIGURED { reason: 'no-hub-storage-connection' }`; the
  owner must create a Storage Connection before a Hub upload can be proven.
  Nothing in this workspace can create one, and provider credentials are
  owner-only.
- No bucket, CORS rule or lifecycle rule is provisioned here
  (`RETENTION-CLEANUP.md`, `VERCEL-DEPLOYMENT.md`).
- No Neon database exists here. The Postgres repository has never executed
  against a real server; it is covered by schema review and by the adapter specs,
  which use fakes.
- The external worker is an interface and a `DOCUMENT_WORKER_REQUIRED` path, not
  a deployment. Nothing consumes a queue yet.
- No Vercel Preview deployment was run from this workspace, so "works on Vercel"
  is a code-level claim only.
- Ephemeral mode is bounded by construction: one request, ≤3 MB of in/out bytes,
  no job history. It is a stop-gap, not a substitute for a Storage Connection.
