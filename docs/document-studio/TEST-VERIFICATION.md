# Test verification — Document Studio v4

Every number here comes from a run in this workspace, **2026-11-06** for sections
1–9 and **2026-11-07** for the Hub Storage / ephemeral `/tmp` work in §10 (gates
re-run after the hub-first driver change and the `/health` catalogue fix).
Nothing is projected. The proof-classification section at the end is the part to
read before repeating any claim.

## 1. Proof classification (read this first)

| Class | Verified? | Meaning |
| --- | --- | --- |
| Compile / typecheck | **yes** | `npx nuxt typecheck` exit 0, 0 `error TS` lines |
| Lint | **yes** | `npx eslint` on every touched file, exit 0 |
| Unit tests | **yes** | 38/38 specs pass (2026-11-07) |
| API smoke, **unauthenticated** | **yes** | protected routes answer 401 |
| API integration **with mock auth** | **yes** | local runtime, JWT signed with the dev secret for a synthetic user |
| Ephemeral `/tmp` runtime with mock auth | **yes** | `DOCUMENT_RUNTIME=vercel` with no storage connection on :4012, single-request `/run` only |
| Build (`pnpm build`) | **yes** | Nitro output produced |
| Vercel Preview deployment | **NO** | not run; no Vercel project, no Neon database, no R2 bucket in this environment |
| Live Postgres / R2 integration | **NO** | adapters are exercised by fakes only |
| Hub Storage Gateway | **PARTIAL — live read only** | local tm-hub reached with `X-App-Id` + `X-App-Secret`: `GET …/storage/connections` → 200 with **0 connections**. No Storage Connection exists, so no upload/download round trip was possible; the provider's refusal path was exercised against the live gateway (§10.3) |
| Signed-in browser pass | **NOT VERIFIED** | no legitimately issued session; seed credentials must not be used |
| Manual visual acceptance | **PENDING USER** | drag/drop, reorder, progress and error states are not visually confirmed |

## 2. Commands and results

Run from the repository root, in this order.

### 2.1 Build hygiene

```
pnpm check:hygiene   → no emitted .js twins under app/, server/, shared/
pnpm typecheck       → exit 0, grep -c "error TS" = 0
pnpm lint            → (project-wide) see §2.2 for the scoped gate
pnpm test            → 38/38 specs passed
pnpm build           → Nitro output under .output/ (62.5 MB, 24.5 MB gzip, 2 m 31 s on 2026-11-07)
```

`npx nuxt typecheck` regenerates `.nuxt/eslint.config.mjs` (25 386 bytes on
2026-11-07, 11:37). Lint must run **after** that regeneration; a lint result
from before it is not evidence.

### 2.2 Scoped lint gate

```
npx eslint server/modules/document server/utils/hubStorage.ts \
           shared/types/document \
           server/middleware/auth.ts server/middleware/document-job-scope.ts \
           app/composables/useDocumentApi.ts \
           app/composables/useDocumentRun.ts \
           app/composables/useDocumentOperationPage.ts \
           server/api/v1/documents server/config/index.ts \
           tests/smoke/document-api-smoke.mts \
           tests/smoke/document-ephemeral-smoke.mts
→ exit 0
```

### 2.3 Unit suite

```
pnpm test → 38/38 specs passed
```

The document specs and what each proves:

| Spec | Suites | Proves |
| --- | --- | --- |
| `document_contracts.spec.ts` | 6 | operation registry, runtime capabilities, state machine, ownership, temp workspace, local storage |
| `document_local_runtime.spec.ts` | 5 | stage-once upload, split/merge/images pipelines, cleanup, export artifact placement |
| `document_studio_ui.spec.ts` | 5 | API client shape, upload order, catalogue coverage, no base64 encoding |
| `document_cloud_runtime.spec.ts` | 4 | per-operation capability, adapter selection, upload intent/multipart/finalize, retention sweep, ephemeral driver-less adapter set |
| `document_hub_storage.spec.ts` | 3 (29 tests) | gateway client: `X-App-Id` + `X-App-Secret` on every call, bearer passthrough, no grant or secret in a URL, body or error, `404` on delete treated as success, size/objectId verification, abort on a rejected PUT; provider: opaque hashed keys, auto connection pick, `DOCUMENT_STORAGE_NOT_CONFIGURED` when no usable connection exists |
| `document_dispatcher.spec.ts` | 1 | inline vs bounded vs worker routing, and the two distinct errors |
| `pdf_extract_checkpoint.spec.ts` | 4 | checkpoint fingerprints, durable extraction journal, cached-row layout compatibility |
| `document_archive.spec.ts` | 6 | streaming ZIP writer: central directory, CRC, multi-chunk and on-disk sources, empty entries, name de-dup, entry cap |
| `document_idempotency.spec.ts` | 5 | repeat create with the same owner + key returns the first job; keys never cross owners; the token stays out of the view |
| `document_schema_lock.spec.ts` | 9 | every inserted/updated column exists in the migration; status and runtime vocabularies match; partial unique index backs `ON CONFLICT` |
| `document_inline_zip.spec.ts` | 1 | the browser ZIP for inline results parses: central directory, matching CRC, verbatim bytes, name flattening/de-duplication, empty archive |

## 3. API smoke — local runtime, mock auth

`tests/smoke/document-api-smoke.mts` signs a JWT with the local dev secret for a
synthetic user id. It is **not** a signed-in browser pass and it does not use a
real account.

```
1. unauthenticated protection
  PASS  operations without a session is rejected — HTTP 401

2. catalogue and capabilities
  PASS  catalogue answers 200 with a mock token — HTTP 200
  PASS  six executable operations are published — 6 operations
  PASS  AI extraction is not offered by the v4 catalogue yet
  PASS  split is available locally
  PASS  health is public and names the runtime — runtime=local
  PASS  health leaks no credential-looking value

3. create → upload → start → download → delete
  PASS  draft job created — <job id>
  PASS  a retried create returns the first job — <same job id>
  PASS  input staged — 1 input(s)
  PASS  job completed — completed
  PASS  one artifact per page — 3 artifact(s)
  PASS  artifact downloads as a real PDF — 846 bytes
  PASS  download carries a filename
  PASS  multi-artifact job downloads as one ZIP — 2557 bytes
  PASS  archive carries one valid entry per artifact — page_0001.pdf, page_0002.pdf, page_0003.pdf
  PASS  archive entries are non-empty
  PASS  a foreign token cannot download the archive — HTTP 404
  PASS  a foreign token cannot download the artifact — HTTP 404
  PASS  job delete answers 200 — HTTP 200
  PASS  deleted job is gone — HTTP 404

4. validation before upload
  PASS  pre-flight rejects a wrong type

ALL CHECKS PASSED
```

### Defects this run found earlier (phases 1–4) and their fixes

1. `DELETE /jobs/:id` returned 404 for an existing job: the handler removed the
   directory holding `manifest.json`, then asked the repository to rewrite it.
   The manifest is no longer rewritten; the directory is removed last.
2. A foreign artifact download answered 409 `DOCUMENT_OUTPUT_NOT_READY`, which
   confirmed the artifact existed. It now answers 404, identical to a missing
   one.
3. Export PNG artifacts 404'd because the executor wrote into a subfolder while
   the recorded key pointed at the output root. The executor now writes to
   `workspace.outputDir` directly; a spec pins the location.

## 4. What the cloud specs actually prove

`document_cloud_runtime.spec.ts` runs against fakes, so be precise about it:

| Claim | Evidence |
| --- | --- |
| One unsupported operation does not block the runtime | `requireOperationSupport('pdf.rasterize')` throws while `pdf.split` passes, on the same runtime |
| A **configured** driver with no durable store fails loudly | `vercel` + `NUXT_HUB_APP_SECRET` but no `DATABASE_URL` → `DOCUMENT_DATABASE_NOT_CONFIGURED` (observed in the :4012 run before the secret was cleared) |
| A **driver-less** cloud runtime is ephemeral, not broken | `vercel` with no Hub connection and no R2 → `storage.kind === 'local'`, delivery `download`, `ephemeralResults === true`, both byte caps `EPHEMERAL_MAX_BYTES` |
| Job routes are refused in ephemeral mode | `requireJobRoutes()` → `DOCUMENT_RUNTIME_NOT_SUPPORTED` with `details.reason === 'use-single-request-run'` |
| Local never needs a cloud credential | `documentRuntime()` on `local` returns `storage.kind === 'local'`, delivery `folder` |
| Large uploads bypass the Function | a 30 MB declaration yields `mode: 'multipart'` with 6 signed parts and no body upload |
| Small uploads are one signed PUT | a 2 KB declaration yields `mode: 'browser-put'` with an `https://` URL |
| An input cannot be processed before finalize | finalize with no stored object → `DOCUMENT_UPLOAD_INCOMPLETE` |
| Another owner cannot finalize | `DOCUMENT_JOB_NOT_FOUND` |
| Retention deletes exactly the stored key | one `deleteObject` call for `document/abc/job-1/output/page_0001.pdf`, status → `deleted` |
| A failed delete is retried, not marked done | `failures = 1`, job **not** marked expired |
| Oversized work is refused before it starts | `exceedsScratchBudget('pdf.rasterize', 100 MB, 'vercel') === true` |

What is **not** proven: that the S3 calls succeed against a real R2 bucket, that
the SQL succeeds against a real Neon database, and that a second Vercel
invocation can read a job the first one wrote.

## 5. Phase 7–9 evidence

### 7. AI extraction

| Claim | Evidence |
| --- | --- |
| `/pdf/extract` and its 8 API routes are untouched | no route file changed; `app/pages/pdf/extract.vue` not edited |
| A checkpoint is reused only for identical inputs | `pdf_extract_checkpoint.spec.ts` varies source bytes, page count, model, connection and preset and asserts a different key each time |
| The checkpoint key is versioned | directory matches `v2-<16 hex>`, `parts.checkpointVersion === 2` |
| A finished job survives a restart | journal round-trip through `.system/extract-jobs/<id>.json` |
| An unreadable journal entry does not break the list | truncated file yields no entry, no throw |
| A missing source no longer matters for identity | the key hashes the bytes, never the filename |
| Export still finds rows after the layout change | flat legacy dir, fingerprint dir, and "newest fingerprint wins" |

Not proven: a real extraction run (needs an AI relay key and a live model), and
the resume-after-crash path (needs a killed process).

### 8. Activity, retention, cleanup, worker

| Claim | Evidence |
| --- | --- |
| Activity page renders and filters | `/document-studio/activity` → 200; SFC compiles in the dev server; **no visual pass** |
| Dispatcher picks inline / bounded / worker | 7 assertions in `document_dispatcher.spec.ts` |
| "No adapter here" and "too big for here" are different errors | `DOCUMENT_RUNTIME_NOT_SUPPORTED` vs `DOCUMENT_WORKER_REQUIRED` |
| Retention deletes the exact key and retries failures | `document_cloud_runtime.spec.ts` retention suite |
| Cleanup route requires its own token | returns 503 with no token configured, 401 with a wrong one |

Not proven: an external worker exists. There is a contract, a dispatcher and an
error path; nothing consumes a queue.

### 9. Legacy retirement

| Claim | Evidence |
| --- | --- |
| Nothing legacy was deleted | `git status` shows no deleted files under `server/api/v1/pdf`, `app/components/pdf`, `app/pages/pdf` |
| The two API families do not import each other | grep for `modules/document` under `api/v1/pdf` and `modules/pdf` → zero hits |
| No regression in export after the checkpoint change | three compatibility assertions in `pdf_extract_checkpoint.spec.ts` |

See [`LEGACY-RETIREMENT.md`](./LEGACY-RETIREMENT.md) for what is blocked and why.

## 6. Manual verification still required

- **Signed-in browser pass.** Every `/api/v1/documents/*` route answers 401
  without a session, and this environment has no legitimately issued session.
  Interaction states — drag/drop highlight, reorder buttons, progress bar, error
  alert — are verified statically and by SFC compile, not visually.
- **Vercel Preview.** Not deployed. See
  [`VERCEL-DEPLOYMENT.md`](./VERCEL-DEPLOYMENT.md) §4 for the checklist the user
  must run once the project, database and bucket exist.
- **Electron packaged run.** The `TOOLS_DATA_DIR` root change is typechecked and
  reasoned from `electron/main.cjs`, not exercised in an installer build.
- **Large-file multipart against R2.** The plan is unit-tested; the browser ↔ R2
  PUT round trip is not.

## 7. Claims that must not be made

- "Cloud runtime works." It is implemented and unit-tested; it has never run
  against Neon or R2, and no Preview deployment exists.
- "AI extraction is on the v4 surface." It is not: it stays on `/pdf/extract`,
  has no v4 executor yet, and the catalogue therefore lists six operations.
- "Signed-in UI verified." It is not. The browser pass is **NOT VERIFIED** and
  visual acceptance is **PENDING USER**.
- "Deployment verified." `pnpm build` succeeding is not a deployment.
- "Hub Storage works end to end." The gateway is reachable and authenticates the
  app, but it reports **0 Storage Connections**, so no object was ever uploaded,
  completed or downloaded. What is proven: the live `connections` envelope, and
  the provider's live refusal (`DOCUMENT_STORAGE_NOT_CONFIGURED` with
  `reason: no-hub-storage-connection`).

## 10. 2026-11-07 — Hub Storage driver and ephemeral `/tmp`

Storage selection is now Hub connection → self-owned R2 → ephemeral `/tmp`.
The full policy is in [`../pdf/TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md`](../pdf/TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md)
§2.0; the change list is in [`../pdf/VERIFICATION.md`](../pdf/VERIFICATION.md)
Phase 33.

### 10.1 Gate results

Re-run on 2026-11-07 after `preferredStorageDriver()` became hub-first and after
`/health` started filtering by executor presence.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npx nuxt typecheck` | `TC_EXIT=0`, 0 × `error TS`; `.nuxt/eslint.config.mjs` 25 386 bytes, 11:37 |
| Lint | scoped `npx eslint` (§2.2) | `LINT_EXIT=0` |
| Unit | `pnpm test:unit` | `38/38 specs passed` |
| Hygiene | `pnpm check:hygiene` | clean |
| Build | `pnpm build` | exit 0, 62.5 MB (24.5 MB gzip), 2 m 31 s |
| Smoke — local | `document-api-smoke.mts` on :4002 | `ALL CHECKS PASSED` |
| Smoke — ephemeral | `document-ephemeral-smoke.mts` on :4012 | `ALL CHECKS PASSED` |

### 10.2 Ephemeral runtime, mock auth

Server started with `DOCUMENT_RUNTIME=vercel NUXT_HUB_APP_SECRET= NUXT_PUBLIC_HUB_URL=`.
That clears the local `.env` connection so the policy genuinely has no driver —
with the secret set, `auto` correctly picks Hub and every call then fails
`DOCUMENT_DATABASE_NOT_CONFIGURED`.

| Check | Result |
| --- | --- |
| health reports `runtime=vercel`, `storage.driver=none`, `storage.mode=ephemeral` | PASS |
| health caps input at `3 × 1024 × 1024` bytes | PASS |
| `GET /jobs` is refused | 501 `DOCUMENT_RUNTIME_NOT_SUPPORTED` |
| `POST /jobs` is refused | 501 `DOCUMENT_RUNTIME_NOT_SUPPORTED` |
| `POST /run` completes a 3-page split | 200, `status=completed`, 3 artifacts |
| every artifact carries `inlineBase64` starting `%PDF` | PASS |
| a 3.5 MB body is rejected before work | 413 `DOCUMENT_TOTAL_SIZE_EXCEEDED` |

What this proves: the driver-less cloud path returns real bytes inline for one
request and refuses everything that implies a later request can read storage.

What it does **not** prove: a real Vercel Function, the 4.5 MB platform body
limit (the app cap of 3 MB was hit first), or any persistence across
invocations — by design there is none.

### 10.3 Hub driver — live gateway, no connection

`document_hub_storage.spec.ts` (3 suites / 29 tests) covers the client and the
provider: `X-App-Id` + `X-App-Secret` never travel in a URL or an error message,
a Hub grant is redacted from any message that reaches an operator, a `404` on
`deleteObject` counts as already-deleted, a truncated upload is never published,
an upload session that resolves to a different object is rejected, and an app
with no usable connection reports `DOCUMENT_STORAGE_NOT_CONFIGURED` instead of
inventing one.

Two throwaway probes then ran against the local tm-hub at `http://localhost:4000`
(app `tm-tools_nttweh`, credentials from `.env`, nothing printed but statuses):

| Probe | Result |
| --- | --- |
| raw `GET /api/v1/apps/tm-tools_nttweh/storage/connections` | **200**, `success: true`, **0 connections** |
| `hubStorageClient.connections()` from `server/utils/hubStorage.ts` | **0 connections** — the real envelope parsed, not a fixture |
| `HubStorageProvider.createUploadTarget()` | refused **`DOCUMENT_STORAGE_NOT_CONFIGURED`** `{"reason":"no-hub-storage-connection"}` |
| cloud-mode `GET /health` (`DOCUMENT_RUNTIME=vercel`, Hub configured) | `runtime=vercel`, `driver=hub`, `persistent=true`, `requiresSession=true`, `mode=durable`, `configured=true`, `database.configured=false` |
| cloud-mode `GET /operations` with a mock token | **200** |
| cloud-mode `POST /jobs` with a mock token | **503 `DOCUMENT_DATABASE_NOT_CONFIGURED`** — the DB gate names what is missing instead of pretending to persist |

What this proves: the client and the provider speak the deployed gateway's real
envelope and real error shape, and the driver chain resolves Hub before R2
without inventing a connection.

What it does **not** prove: `POST /uploads/initiate`, `POST /uploads/:id/complete`,
`POST /objects/:id/download-grant` or `DELETE /objects/:id` against the live
gateway, because a Storage Connection is owned by the Hub operator and none
exists in this environment. Creating one is the only missing step — the local
`/pdf` operations path is unaffected either way.

### 10.4 Inline results archive

Ephemeral mode refuses `/artifacts/archive`, so "download all" would have to
disappear. Instead `app/utils/zip.ts` builds a store-only ZIP in the browser from
the `inlineBase64` bytes already in the response. `document_inline_zip.spec.ts`
parses that output itself — central-directory signature, matching CRC, verbatim
entry bytes, flattened and de-duplicated names, and an empty archive — so the
test does not depend on the writer's own helpers. The button is **not visually
verified**; no signed-in browser pass exists here.

### 10.5 Defects this phase found and fixed

1. `preferredStorageDriver()` preferred R2 over Hub while the documented policy
   is Hub-first (Hub owns the provider credentials). The order now follows the
   policy; `DOCUMENT_STORAGE_DRIVER=r2` remains the explicit override for a
   deployment that owns its bucket.
2. The raw app secret was on a code path that could reach a Hub error message;
   only the gateway's own `statusMessage` code is surfaced now.
3. A provider grant could leak through a relayed Hub error; grants are redacted
   before any message leaves the server.
4. `deleteObject` treated a `404` as a failure; deleting an already-deleted
   object is idempotent now.
5. Upload intent assumed multipart always. The gateway signs a single `PUT`
   (`transferMode`) and has no multipart route, so a multipart plan is now
   refused explicitly, and the returned `uploadId` closes the session at
   `complete` instead of leaving it open.
6. The intent gate demanded an R2 key pair, which excluded a valid Hub
   connection; the check is on a usable driver, not on R2 specifically.
7. Both artifact routes cast storage to `CloudflareR2StorageProvider` and called
   `createDownloadUrl`/`getMetadata().localPath`, which Hub does not implement.
   `createDownloadUrl` is now an optional capability; local and Hub stream the
   bytes and only R2 redirects.
8. `requireJobRoutes()` existed but nothing called it; the new
   `server/middleware/document-job-scope.ts` enforces it behind auth and formats
   the refusal through `runDocument`.
9. The health route imported `isR2Configured` directly, so it reported a
   misleading storage state for Hub and ephemeral deployments; it now reads the
   resolved runtime.
10. `/health` listed `document.ai-extract` as `enabled: true` on local while
    `/operations` correctly omitted it (no v4 executor). Health now applies the
    same `hasExecutor` filter, and the local smoke asserts
    `6 health / 6 catalogue` so the two surfaces cannot drift silently.
11. The ephemeral smoke script failed `@stylistic/arrow-parens` once it entered
    the scoped lint gate; the file was fixed rather than dropped from the gate.

## 11. 2026-11-07 — Supabase probe, v4 navigation, Settings page

### 11.1 Provider account probe (not through Hub)

Using the storage credentials already present in the local environment (nothing
printed but statuses and object names):

| Step | Result |
| --- | --- |
| project bucket `assets` lookup | exists |
| signed upload URL → `PUT` a small PDF | 200 |
| `HEAD` the uploaded object | size matches |
| signed download URL → compare bytes | identical |
| delete the object | 200 |

This proves the Supabase Storage **account** accepts the signed upload/download
round trip. It does **not** prove the Hub gateway path: tm-tools still sees
`{"connections": []}` from
`GET /api/v1/apps/tm-tools_nttweh/storage/connections`, and quick connect needs
a Hub user session with `connections.write`. No connection was fabricated.

### 11.2 Navigation now matches the v4 roadmap

The v4 pages existed but the Hub menu only exposed the legacy `/pdf/*` pages.
`tm-hub/scripts/seed/data.ts` now seeds the Document Studio tree:

| Route id | Path | Menu |
| --- | --- | --- |
| `document_home` | `/document-studio` | visible |
| `document_split` / `document_merge` | `/document-studio/tools/*` | visible |
| `document_rasterize` / `document_images_to_pdf` | `/document-studio/tools/*` | visible |
| `document_convert` / `document_export` | `/document-studio/tools/*` | visible |
| `document_activity` | `/document-studio/activity` | visible |
| `document_settings` | `/document-studio/settings` | visible |
| `pdf_library`, `pdf_extract` | legacy pages | still visible |
| `pdf_overview`, `pdf_split`, `pdf_images`, `pdf_export`, `pdf_import` | legacy pages | hidden, still reachable by URL |

The `admin` role's `allowed_routes` gained the same ids; without that only a
root session would see the leaves (the menu prunes by `allowed_routes` for
routes with no required permission).

`pnpm seed:tools` was applied after a read-only diff showed **9 missing routes
and 0 routes that would be deleted**. The run created the 9 routes and re-synced
the two roles. Note: the seeder also resets the builtin seed passwords
(`root@example.com`, `tools-root@example.com`, `tools-admin@example.com`) — that
is its normal behaviour, not a side change from this work.

### 11.3 Settings page

`/document-studio/settings` reads the real server contracts: `GET /settings`
(delivery, output folder on local, retention `7 / 90` days) and `GET /health`
(runtime, storage driver, persistence, database, limits). It renders the server
`/tmp` scratch location nowhere. Both endpoints stay server-side; the page uses
`useDocumentApi`.

A defect from the same pass is fixed: the Home page built operation titles by
splitting the operation id (`images-to-pdf`, `convert-to-pdf`, `ai-extract`),
which produced i18n keys that do not exist. It now resolves titles through the
catalogue (`documentStudioOperation`) and both new behaviours are guarded in
`document_studio_ui.spec.ts`.

### 11.4 Gates

Re-run on 2026-11-07 after the settings page and seed changes:

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npx nuxt typecheck` | `TC_EXIT=0`, 0 × `error TS`; `.nuxt/eslint.config.mjs` 25 386 bytes, 12:04 |
| Lint | scoped `npx eslint` on touched files | `LINT_EXIT=0` (after the config regeneration) |
| Unit | `pnpm test:unit` | `38/38 specs passed` |
| Hygiene | `pnpm check:hygiene` | clean |
| Build | `pnpm build` | exit 0, 62.5 MB (24.5 MB gzip), 2 m 27 s |
| Seed types | `pnpm typecheck:seed` (tm-hub) | `SEED_TC_EXIT=0` |
| Dev pages | `GET /document-studio`, `/settings`, `/activity`, `/tools/split` | 200 |
| Settings SFC | Vite module `/pages/document-studio/settings.vue` | 200, compiled |
| `GET /api/v1/documents/health` anonymous | 200, `runtime=local`, `driver=local`, `durable` |
| `GET /api/v1/documents/settings` anonymous | **401** — expected; a protected route without a session |

### 11.5 Still not verified

- A signed-in browser upload/download pass. Both available browsers sit on the
  login screen; entering seed credentials or bypassing auth is out of bounds.
- Hub → Supabase upload/download. Requires the Storage Connection described in
  §11.1; the driver was not fabricated.
- Vercel Preview, live Neon, live R2.
- The legacy `/pdf/*` layout (tree, list, export modal) is unchanged by design
  until the v4 parity and signed-in pass in
  [`LEGACY-RETIREMENT.md`](./LEGACY-RETIREMENT.md).

## 12. 2026-11-07 — Document Studio "component load" report

Report: "toàn bộ document-studio đang lỗi load component" after connecting
`supabase_storage` on tm-tools.

### 12.1 Component resolution

The earlier component-name defect (auto-import prefixes from
`app/components/document-studio/layout/`) is gone. A live sweep of the running
Electron window (`--remote-debugging-port=9222`, CDP `Runtime`/`Log`/`Page`
only — no cookie or storage reads) found **no** `Failed to resolve component`
and **no** `dynamically imported module` failure on any route:

| Route | Render | Console errors |
| --- | --- | --- |
| `/document-studio` | 7 cards, all sections | 0 |
| `/document-studio/activity` | filters + empty state | 0 |
| `/document-studio/settings` | storage + runtime + limits | 0 |
| `/document-studio/tools/split` | drop zone + summary + Chạy | 0 |
| `/document-studio/tools/merge` | same shell | 0 |
| `/document-studio/tools/images` | same shell | 0 |
| `/document-studio/tools/images-to-pdf` | same shell | 0 |
| `/document-studio/tools/convert` | same shell | 0 |
| `/document-studio/tools/export` | same shell + format list | 0 |

### 12.2 Real cause of the empty data: `sub` vs `userId`

Pages rendered but every document request answered
`401 error.tokenMissing` while the auth middleware had already accepted the same
token. The stack pointed at `documentCaller`.
`server/utils/documentApi.ts` required `auth.userId`; Hub-issued tokens describe
the subject as `sub` (see the same dual-shape rule already documented in
`server/utils/chatAuth.ts`). `documentCaller` now resolves
`auth?.userId || auth?.sub`, and the owner id it returns is still the only
identity a job is scoped by.

Proof:

- `tests/unit/document_caller.spec.ts` — `sub`, `userId`, no-subject and
  non-annotated requests.
- `tests/smoke/document-api-smoke.mts` §5 — a `sub` + `roles[]` token (no
  `userId`) creates, runs and downloads a job over HTTP.

### 12.3 Settings read `/health` through the wrong envelope

`/api/v1/documents/health` is public and returns its payload at the top level,
while every authenticated route returns `{ ok, data, requestId }`.
`useDocumentApi.get` always returned `res.data`, so `health` was `undefined` and
the page showed `Trình lưu trữ —`, a false "Chỉ xử lý tạm thời" badge, the
ephemeral hint on a durable local runtime, and no limits section.

`get` now accepts either shape (`envelope?.data ?? res`), locked by
`tests/unit/document_api_client.spec.ts`. After the fix the same page reports
`Ổ đĩa cục bộ`, the durable badge and the `200 MB / 500 MB / 50 / 2 GB` limits.

### 12.4 Live UI upload → run → download

Driven through the real split page (CDP `DOM.setFileInputFiles`, then the page's
own "Chạy" button):

| Step | Result |
| --- | --- |
| pick a generated 3-page PDF (1.2 KB) | `ĐÃ CHỌN (1)`, summary `Đầu vào 1 file`, Chạy enabled |
| run `pdf.split` | `KẾT QUẢ (3)`, `page_0001..0003.pdf`, 854 B each |
| download single artifact | HTTP 200, `%PDF`, 854 B, `attachment; … page_0001.pdf` |
| download all | HTTP 200, ZIP `PK`, 2 587 B |
| disk | three PDFs written under `.data/pdf/output` |

The test outputs and the temporary probe scripts were removed afterwards.

### 12.5 Storage driver on this runtime

The desktop dev runtime (`runtime: local`) keeps using the filesystem by design:
`hubStorageAvailable()` returns `false` for `local`/`electron`, and
`documentRuntime()` returns the local adapter set. A Hub Storage Connection is
therefore selected only on a cloud runtime, and that path also requires
Postgres for job metadata. `/health` correctly reports
`storage.driver: "local"` here; it is not evidence that the Supabase connection
is missing.

### 12.6 Gates

| Gate | Result |
| --- | --- |
| `npx nuxt typecheck` | `TC_EXIT=0`, 0 × `error TS` |
| scoped `npx eslint` (all touched files, after regeneration) | `LINT_EXIT=0` |
| `pnpm test:unit` | `40/40 specs passed` |
| `pnpm check:hygiene` | clean |
| `pnpm build` | exit 0, 62.5 MB (24.5 MB gzip), 2 m 32 s |
| `document-api-smoke.mts` | all checks passed, including §5 |

Still unproven: Vercel Preview, live Neon/R2, and a Hub gateway upload/download
through a Storage Connection on a cloud runtime. The Supabase account round trip
remains §11.1 evidence only.
