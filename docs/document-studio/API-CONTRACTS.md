# API contracts — `/api/v1/documents`

Every route sits behind `server/middleware/auth.ts`: a hub JWT (bearer or
`accessToken` cookie) whose `appId` matches this app. `documentCaller()` turns it
into `ownerId`; **no route reads an owner from the request body**.

## 1. Envelope

Success:

```json
{ "ok": true, "data": { }, "requestId": "uuid" }
```

Failure (`runDocument`):

```json
{
  "ok": false,
  "error": { "code": "DOCUMENT_JOB_NOT_FOUND", "message": "DOCUMENT_JOB_NOT_FOUND", "retryable": false },
  "requestId": "uuid"
}
```

The transport also sets `statusCode`/`statusMessage` from
`server/modules/document/operations.ts`; the client reads `statusMessage` first
and falls back to `data.error.code`.

## 2. Routes

| Method | Path | Body / query | `data` |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ runtime, storage:{driver,persistent,requiresSession,mode,ephemeral,configured}, database:{configured,connected}, operations[], limits }` — **public**, no secret |
| POST | `/run` | multipart `operationId`, `files[]`, `config?` — **ephemeral runtime only** | terminal job view with `artifacts[].inlineBase64`; nothing is stored |
| GET | `/operations` | — | `{ runtime, capabilities, operations[] }`; each operation carries `available` and `runtimeSupport` |
| POST | `/operations/:operationId/validate` | `{ files:[{name,size}], config? }` | `{ ok, issues[], capabilities }` |
| POST | `/jobs` | `{ operationId, config?, retentionDays?, idempotencyKey? }` or `Idempotency-Key: <token>` | `DocumentJobView` (status `created`); a repeat create with the same owner + token returns the first job |
| GET | `/jobs` | `?status=running,done&operationId=&limit=` | `DocumentJobView[]` |
| GET | `/jobs/:jobId` | — | `DocumentJobView` |
| POST | `/jobs/:jobId/inputs` | multipart `files[]` — **local runtime only** | staged input records |
| POST | `/jobs/:jobId/inputs/intent` | `{ fileName, size, mimeType }` — **cloud with a storage driver only** | `{ input, plan }`; `plan` is `{ mode:'browser-put', url, method?, headers?, uploadId?, expiresAt }` (R2 presigned `PUT`, Hub signed grant) or `multipart` (R2 only — the Hub gateway signs one `PUT` and has no multipart route) |
| PUT | `/jobs/:jobId/inputs/:inputId/content` | raw body — **generic fallback only** | `{ inputId, key, size }`; no current adapter returns this URL (R2 and Hub both hand the browser a grant) |
| POST | `/jobs/:jobId/inputs/:inputId/complete` | `{ uploadId?, key?, parts?[] }` — **cloud only** | the input, status `verified` |
| POST | `/jobs/:jobId/start` | — | `DocumentJobView` (terminal status for inline specs) |
| POST | `/jobs/:jobId/cancel` | — | `{ cancelled: true }` |
| DELETE | `/jobs/:jobId` | — | `{ deleted: true, removedBytes }` |
| GET | `/jobs/:jobId/artifacts` | — | `DocumentArtifactView[]` |
| GET | `/jobs/:jobId/artifacts/:artifactId/download` | — | local/Hub: binary stream; R2: 302 to a signed GET |
| GET | `/jobs/:jobId/artifacts/archive` | — | one `application/zip` stream of every ready artifact |
| POST | `/jobs/:jobId/artifacts/:artifactId/url` | — | `{ artifact, url }` — a short-lived signed GET on R2, or the authenticated download route when the provider cannot mint one (Hub, local) |
| DELETE | `/jobs/:jobId/artifacts/:artifactId` | — | `{ deleted: true }` |
| GET | `/settings` | — | `{ runtime, defaultOutputPath, delivery, supportsNativeSaveDialog }` |
| GET/POST | `/maintenance/cleanup` | `Authorization: Bearer <cleanup token>` | retention sweep summary |

`DocumentJobView` omits `configSnapshot` deliberately: the snapshot is stored
server-side for retry/audit and is not needed by the client.

`DocumentArtifactView`:

```ts
{ id, jobId, fileName, mimeType, size, status, expiresAt,
  downloadPath: '/api/v1/documents/jobs/<jobId>/artifacts/<artifactId>/download' }
```

The download path is the only way the client can reach the bytes. There is no
public URL, no storage key, and no filesystem path in any response.

### Routes that are deliberately absent

There is no app-side `/storage`, `/storage/connections`, `/storage/batches` or
`/storage/grants` route, and the browser never calls the Hub API. Grant issuance,
completion, deletes and connection listing are server-to-server
(`X-App-Id` + `X-App-Secret`) inside `server/utils/hubStorage.ts`. The only
storage credential a page ever receives is the single-object upload grant the
intent returns; it PUTs to the provider URL, not to Hub. Status lives on
`/health` (`storage.driver`, `storage.mode`, `ephemeral`, `configured`), whose
`operations[]` applies the same executor filter as `/operations`.

### Upload plan → finalize contract

1. `POST /jobs/:jobId/inputs/intent` → `{ input, plan }`.
2. The browser sends the file to `plan.url` with `plan.method ?? 'PUT'` and
   `plan.headers`, then keeps `plan.uploadId` when present.
3. `POST /jobs/:jobId/inputs/:inputId/complete` with `{ uploadId }` (Hub closes
   the session; Hub HEADs the object before it is usable), `{ parts, uploadId,
   key }` (R2 multipart), or `{}` (R2 single PUT).

Hub refusals surface as `DOCUMENT_STORAGE_UNAVAILABLE` with
`details.reason = integrations.hubStorage*`, `details.hubCode = storage.*` and
`details.requestId` for correlation. A Hub app with no Storage Connection answers
`DOCUMENT_STORAGE_NOT_CONFIGURED` with `reason: 'no-hub-storage-connection'`.
A multipart plan on the Hub driver is refused as
`DOCUMENT_STORAGE_UNAVAILABLE` / `integrations.hubStorageRejected` with
`hubCode: 'storage.multipart_not_supported'` rather than uploaded as one part.

## 3. Stages and their guards

| Stage | Guard |
| --- | --- |
| upload (local) | job must be `created` or `uploading`; extension **and** magic bytes must match; per-file and total size caps; count must satisfy the operation |
| upload (cloud) | intent refuses an unsupported type/oversize before signing; `complete` HEADs the object and compares bytes; the input stays `pending` until it matches |
| upload (Hub) | intent asks Hub to `initiate` one object with the app identity; the returned grant is single-object and short-lived; `complete` closes the Hub session, which verifies the stored size before the object is `ready`; a refused session is aborted |
| upload (fallback sink) | `PUT …/content` requires a `pending` input owned by the caller, refuses a body above the declared size, and streams straight to the provider; no adapter currently points here |
| job-id routes (ephemeral) | a cloud runtime with no storage driver answers `DOCUMENT_RUNTIME_NOT_SUPPORTED` (`use-single-request-run`); only `POST /run` works |
| start | requires at least one input, and no cloud input may still be `pending`; refuses `DOCUMENT_WORKER_REQUIRED` when the scratch estimate exceeds the runtime budget; writes `queued → running`; validation failures become `failed` with the real code |
| download | artifact owner must equal the caller; a foreign id answers `DOCUMENT_JOB_NOT_FOUND`; an expired artifact answers `DOCUMENT_ARTIFACT_EXPIRED` |
| delete | job must be the caller's and not active; cloud deletes objects first, then the row; local removes the manifest with the directory |

## 4. Error codes

| Code | HTTP | Retryable |
| --- | --- | --- |
| `DOCUMENT_INPUT_REQUIRED` | 422 | no |
| `DOCUMENT_INPUT_COUNT_INVALID` | 422 | no |
| `DOCUMENT_INPUT_TYPE_NOT_SUPPORTED` | 422 | no |
| `DOCUMENT_INPUT_TOO_LARGE` | 413 | no |
| `DOCUMENT_TOTAL_SIZE_EXCEEDED` | 413 | no |
| `DOCUMENT_UPLOAD_INCOMPLETE` | 409 | **yes** |
| `DOCUMENT_UPLOAD_EXPIRED` | 410 | no |
| `DOCUMENT_INPUT_NOT_READY` | 409 | no |
| `DOCUMENT_JOB_NOT_FOUND` | 404 | no |
| `DOCUMENT_JOB_NOT_OWNED` | 403 | no |
| `DOCUMENT_JOB_STATE_INVALID` | 409 | no |
| `DOCUMENT_JOB_ALREADY_RUNNING` | 409 | no |
| `DOCUMENT_OUTPUT_NOT_READY` | 409 | no |
| `DOCUMENT_OUTPUT_EXPIRED` | 410 | no |
| `DOCUMENT_OUTPUT_TOO_LARGE` | 413 | no |
| `DOCUMENT_ARTIFACT_EXPIRED` | 410 | no |
| `DOCUMENT_STORAGE_UNAVAILABLE` | 503 | **yes** |
| `DOCUMENT_STORAGE_NOT_CONFIGURED` | 503 | **yes** |
| `DOCUMENT_DATABASE_NOT_CONFIGURED` | 503 | **yes** |
| `DOCUMENT_TEMP_CAPACITY_EXCEEDED` | 507 | no |
| `DOCUMENT_RUNTIME_NOT_SUPPORTED` | 501 | no |
| `DOCUMENT_WORKER_REQUIRED` | 422 | no |
| `DOCUMENT_OPERATION_NOT_SUPPORTED` | 404 | no |
| `DOCUMENT_OPERATION_CONFIG_INVALID` | 422 | no |
| `DOCUMENT_PROCESSING_TIMEOUT` | 504 | **yes** |
| `DOCUMENT_CLEANUP_FAILED` | 500 | no |

Every code has an `en` and `vi` entry under `document.errors`.

`DOCUMENT_RUNTIME_NOT_SUPPORTED` is per operation: it means this operation has no
adapter for this runtime, never "the runtime is cloud". A supported operation
that is merely too large answers `DOCUMENT_WORKER_REQUIRED` instead.

## 5. Legacy surface

`/api/v1/pdf/**` (48 routes) is unchanged and still the only implementation of
AI extraction. `usePdfStudio` is untouched. Nothing in `/api/v1/documents`
imports the legacy route handlers, and nothing in the legacy routes imports the
document module, so the two can evolve independently until phase 9.

## 6. Verification

`tests/unit/document_contracts.spec.ts`, `document_local_runtime.spec.ts`,
`document_studio_ui.spec.ts`, `document_cloud_runtime.spec.ts` and
`document_hub_storage.spec.ts` cover the registry, state machine, ownership, temp
quota, staging validation, transport-free execution, artifact publishing,
per-operation capability, upload intent/finalize, the retention sweep and the Hub
gateway contract (initiate → grant → complete, size/objectId verification,
download-grant streaming, error-envelope mapping and grant redaction). The live
smoke runs are recorded in [`TEST-VERIFICATION.md`](./TEST-VERIFICATION.md).
