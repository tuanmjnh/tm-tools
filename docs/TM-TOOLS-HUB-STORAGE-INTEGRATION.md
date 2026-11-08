# TM Tools — TM Hub Storage Gateway Integration

> **Implementation brief for the TM Tools coding agent.** Integrate TM Hub's generic Storage Gateway into the existing PDF Workspace without rebuilding PDF processing, changing the eight-area contract, replacing Local/Electron storage, or creating a second credentials manager.
>
> Companion document: [`TM-HUB-STORAGE-GATEWAY-IMPLEMENTATION.md`](./TM-HUB-STORAGE-GATEWAY-IMPLEMENTATION.md)
>
> Target repository: `tuanmjnh/tm-tools`.

| Item | Value |
|---|---|
| Document | TM Tools Hub Storage integration brief |
| Version | 1.0 |
| Prepared | 2026-11-07 |
| TM Tools baseline reviewed | `main` — `cc728d26f72c2e3d45842ff181ff5a232d5e0cb5` (`2026-11-05`) |
| Hub baseline reviewed | `main` — `668a3c17f6649033f96aeec4e34b419e032611fa` (`2026-11-05`) |
| SDK baseline reviewed | `main` — `dc08da451e5435bed65c80595628a794d624a2b9` (`2026-11-03`); package in TM Tools is `1.0.9` |
| Status | Integration specification; no claim that Hub Storage APIs currently exist |

---

## 0. Instructions for the coding agent

1. **Read the current repository and its PDF documents before editing.** Start with `docs/pdf/WORKSPACE-AUDIT.md`, `docs/pdf/WORKSPACE-UPGRADE-PLAN.md`, `docs/pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` and `docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` (especially §12).
2. The current v4/multi-runtime plan is recorded as **design only / not started** in `WORKSPACE-UPGRADE-PLAN.md`. It is gated by the preceding v3 work. Verify the actual v3 status and acceptance gates in the live working tree. Do not silently bypass unfinished v3 work; implement this brief as the Hub-backed Storage part of the existing v4 track.
3. **Preserve the current PDF workspace contract.** Do not rename the eight `PdfFileArea` values, change `outputMapping`, change route URLs or replace the current PDF engines with separate cloud engines.
4. **Keep Local and Electron local-first.** The Hub cloud provider must be selected only when the runtime/policy calls for it. Never force an Electron user to require a cloud credential to process a local file.
5. **Never call Hub Storage from Vue with the App Secret.** `NUXT_HUB_APP_SECRET` is server-only. Browser code calls authenticated TM Tools Nitro endpoints; those endpoints call Hub server-to-server using `X-App-Id` + `X-App-Secret`.
6. **Do not treat `/tmp` or `.data` on Vercel as persistent storage.** `/tmp` is scratch for one execution only; object persistence belongs in the selected Hub Storage connection.
7. Do not mark long-running extraction reliable merely because source/output files are in R2. The current extraction job state is process-local. Durable jobs, worker execution, DB state, timeout limits and PDF-native dependencies are separate readiness gates.
8. Build behind a feature flag and use the Hub contract fixtures/mock until the Hub endpoint and SDK version are released. Do not invent a different API shape from the companion Hub document.

## 1. Goal and responsibility split

The goal is to make the existing TM Tools PDF workspace operate on a storage abstraction that can use either local disk or a Storage Connection managed by TM Hub.

### TM Hub owns

- R2/S3/Supabase provider credentials and encrypted secret storage.
- Connection health, enabled state and ownership.
- Explicit cross-app Storage grants.
- Short-lived upload/download grants.
- Storage object manifest and generic object operations.
- Provider adapters, quotas, provider errors and storage audit.

### TM Tools owns

- PDF workspace UI and business rules.
- User authentication/authorization at the TM Tools boundary.
- PDF operations, conversion, extraction, checkpoint logic and output mapping.
- Mapping `PdfFileArea + relativePath` to a Hub namespace/object reference.
- Temporary scratch files needed by existing filesystem-based engines.
- Job metadata and orchestration, including any persistent job store/worker required for cloud workloads.
- User-visible file/folder names, trash/restore behavior and PDF audit semantics.

TM Tools must not keep another copy of R2/S3/Supabase credentials or connect to buckets directly. It may hold its own TM Hub App Secret on the server because that proves the TM Tools application to Hub; it is not a provider credential.

## 2. Verified current code — keep and extend

### 2.1 Current Hub integration

`package.json` has:

```json
"tm-hub-client": "1.0.9"
```

`nuxt.config.ts` already configures:

```ts
runtimeConfig: {
  // server-only
  hubAppSecret: process.env.NUXT_HUB_APP_SECRET || '',
  public: {
    hubUrl: process.env.NUXT_PUBLIC_HUB_URL || 'http://localhost:4000',
    hubAppId: process.env.NUXT_PUBLIC_HUB_APP_ID || 'tm-tools'
  }
}
```

Keep `hubAppSecret` private. Do not rename or move it into `runtimeConfig.public`.

`app/composables/useHub.ts` creates a browser/user-facing `HubClient` using the signed-in user's JWT and exposes modules including `connections`, `media`, `imports`, etc. This client is appropriate for UI-level user operations, but it is not configured with `getAppSecret` and must not be used as the Storage server identity.

The new Storage SDK calls that use App Secret must be made by a server-side Hub client/helper under `server/`, not by `useHub()` inside Vue components.

### 2.2 Current authentication boundary

`server/middleware/auth.ts` requires a valid Hub-issued user JWT for `/api/**` routes except the documented public endpoints. It validates the app claim against `NUXT_PUBLIC_HUB_APP_ID` (default `tm-tools`) and places the verified payload on `event.context.auth`.

Preserve that boundary. The intended request chain is:

```text
Vue renderer / browser
   │ user JWT or HttpOnly accessToken cookie
   ▼
TM Tools Nitro /api/v1/pdf/*
   │ existing middleware verifies user
   │ route enforces operation/area rules
   ▼
server-only Hub Storage client
   │ X-App-Id: tm-tools
   │ X-App-Secret: NUXT_HUB_APP_SECRET
   ▼
TM Hub Storage Gateway
   │ verifies registered app + connection/grant + object scope
   ▼
R2 / S3 / Supabase Storage
```

Hub's App Secret proves the **application** identity. It does not prove an end-user identity or replace TM Tools user permissions. TM Tools must authorize the signed-in user before asking Hub for a grant. Any `userId`/actor reference included for audit is attribution metadata, not proof of identity to Hub.

### 2.3 Current PDF workspace contract

The current `server/modules/pdf/workspace.ts` defines eight areas:

| `PdfFileArea` | Meaning | Writable files | Writable folders |
|---|---|---:|---:|
| `sources` | Source PDFs | Yes | Yes |
| `inputs` | Non-PDF input files | Yes | Yes |
| `word` | Legacy Word input area | No | No |
| `split` | Split PDF outputs | Yes | Yes |
| `images` | Rasterized page images | Yes | Yes |
| `merged` | Merged/converted PDF outputs | Yes | Yes |
| `products` | Extraction data outputs | Yes | Yes |
| `office` | Office document outputs | Yes | Yes |

Current `outputMapping`:

```ts
export const outputMapping = {
  split: 'split',
  merge: 'merged',
  rasterize: 'images',
  imagesToPdf: 'merged',
  convertInput: 'merged',
  export: 'office',
  extract: 'products'
} as const
```

There are also internal filesystem areas such as `checkpoints` and `.trash`. They are not additional user-facing `PdfFileArea` values. Preserve this distinction. If checkpoints/trash move to cloud, give them explicit internal namespaces and retention behavior rather than adding them to the public area enum.

The current path layer is `server/modules/pdf/paths.ts`, which exposes `pdfRoot` and `pdfDirs`. Multiple PDF modules/operations still use filesystem paths. The current engines must continue to receive local scratch paths in the first cloud implementation.

### 2.4 Current upload/read routes and composables

Current UI/composable methods in `app/composables/usePdfStudio.ts` include:

- `upload(files, folder)` → `POST /api/v1/pdf/upload`
- `uploadInputs(files, folder)` → `POST /api/v1/pdf/inputs/upload`
- `uploadWord(files)` → `POST /api/v1/pdf/word/upload`
- directory/tree, preview/download, rename/delete/trash, export, split, rasterize, convert and extraction methods.

`GET /api/v1/pdf/file` reads a local file using `resolveAreaFile()` and `createReadStream()`.

The PDF workspace APIs currently assume a local filesystem for listing, directory operations, reading, writing, rename, trash and integrity checks. Do not change only uploads and assume the whole workspace has become cloud-capable. Listing, preview, rename, delete, trash, restore, output publication and extraction checkpoints all need an explicit storage path.

### 2.5 Electron StorageManager is not the PDF Workspace provider

`electron/src/infrastructure/storage/StorageManager.ts` manages Electron user-data directories such as database, profiles, downloads, screenshots, logs, backups and temp. It is not the same abstraction as `server/modules/pdf/paths.ts` and must not be repurposed as the PDF storage backend without a specific reason.

`docs/pdf/WORKSPACE-AUDIT.md` and the v3 spec note that Electron sets `TOOLS_DATA_DIR` but historically did not set `PDF_DATA_DIR`. The existing PDF root must be resolved correctly before Nitro imports its PDF modules. Preserve user data in Electron's `app.getPath('userData')` rather than writing into the packaged app directory.

### 2.6 Existing multi-runtime design and blockers

`docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` §12 already specifies the v4 principle:

> No operation should depend directly on a permanent filesystem path. Operations receive input via a Storage Provider and write results through a Result Writer.

It also specifies that the current filesystem-based engine can remain: materialize inputs into a scratch directory, run the existing engine, then publish outputs through the storage provider.

The current `WORKSPACE-UPGRADE-PLAN.md` says multi-runtime v4 is design-only and gated on v3. The v4 design identifies important blockers that Storage Gateway does not solve:

- v3 UX/contract phases must be completed and verified first.
- Vietnamese fonts must be bundled/tested on Linux for Word→PDF.
- `pdf-to-img` / `pdfjs-dist` needs `@napi-rs/canvas` available; it was optional in the audited package dependency graph.
- `config.pdf.dir` and SQLite/chat paths must not assume writable `process.cwd()` on Vercel.
- Persistent extraction-job state cannot remain a process-local `Map` for reliable cloud jobs.
- Long-running work needs a bounded cloud execution/worker design, not simply a longer HTTP request.

Do not represent these as solved by adding R2.

## 3. Target runtime policy

Add one centralized runtime/storage policy service. Do not scatter `process.env.VERCEL`, Electron detection and feature checks through Vue components or PDF operations.

Suggested logical types:

```ts
export type PdfStorageDriver = 'auto' | 'local' | 'hub'
export type PdfRuntime = 'local' | 'electron' | 'vercel' | 'worker'

export interface PdfRuntimeCapabilities {
  runtime: PdfRuntime
  storageDriver: 'local' | 'hub'
  canReadLocalFileSystem: boolean
  supportsPersistentLocalStorage: boolean
  supportsHubStorage: boolean
  supportsDirectUpload: boolean
  supportsMultipartUpload: boolean
  supportsAsyncJobs: boolean
  maxInlineUploadBytes: number
  maxInlineProcessBytes: number
}
```

Suggested behavior:

| Runtime | Default driver | Required behavior |
|---|---|---|
| Local Nuxt development | `local` | Current `.data/pdf` behavior remains available |
| Electron | `local` | PDF data stored under userData-backed `PDF_DATA_DIR`; cloud is optional, never required |
| Vercel Web | `hub` when configured | Persistent inputs/outputs go to a granted TM Hub Storage connection; `/tmp` only for scratch |
| Worker | Explicit configuration | Hub Storage for durable inputs/outputs; worker-specific scratch and persistent job store |

Configuration:

```text
PDF_STORAGE_DRIVER=auto|local|hub
PDF_STORAGE_CONNECTION_ID=<optional preferred connection id>
PDF_STORAGE_NAMESPACE=tm-tools/pdf
PDF_STORAGE_MAX_INLINE_BYTES=<bounded limit>
PDF_STORAGE_RETENTION_DAYS=<policy value>

NUXT_PUBLIC_HUB_URL=<Hub URL>
NUXT_PUBLIC_HUB_APP_ID=tm-tools
NUXT_HUB_APP_SECRET=<server-only; never NUXT_PUBLIC_*>
```

Do not put a provider API key in TM Tools configuration. Provider credentials remain in Hub Connections. A preferred `connectionId` is not authority; Hub checks the connection/grant on every operation.

In `auto` mode, detect runtime in one server-side configuration module. Do not make a silent fallback from `hub` to ephemeral local disk on Vercel. If Vercel requires persistent storage and no usable connection exists, return a clear `storage.not_configured` / `storage.connection_unavailable` error and explain how to configure the Hub connection.

## 4. Storage architecture inside TM Tools

Preserve the current PDF engine and expose a provider-neutral application layer:

```text
PDF UI (keep routes/pages and v3 contracts)
          │
          ▼
PDF Application Layer (new/adapted)
  ├── PdfRuntimePolicy
  ├── PdfWorkspaceStorage
  ├── PdfInputResolver
  ├── PdfOperationRunner
  ├── PdfResultWriter
  ├── PdfDirectoryRepository
  └── PdfJobStore (separate durable-job workstream)
          │
          ├────────────────────┐
          ▼                    ▼
  LocalPdfStorage        HubPdfStorage
  (filesystem)           (server-side Hub SDK)
          │                    │
          ▼                    ▼
    Existing local FS     TM Hub Storage Gateway
          │                    │
          └──────────┬─────────┘
                     ▼
             Existing PDF engine
          (scratch paths only; no S3 SDK)
```

Do not introduce an S3 SDK or Supabase Storage secret into the TM Tools repository. `HubPdfStorage` calls the new `client.storage.*` SDK methods server-side.

### 4.1 Required logical provider interfaces

The exact interface should fit current code conventions; the behavior below is required:

```ts
export interface PdfStoredObjectRef {
  objectId: string
  connectionId: string
  namespace: string
  relativePath: string
  area: PdfFileArea
  fileName: string
  contentType: string
  sizeBytes: number
  checksumSha256?: string | null
}

export interface PdfWorkspaceStorage {
  upload(area: PdfFileArea, relativePath: string, source: FileOrStream, options?: UploadOptions): Promise<PdfStoredObjectRef>
  materialize(ref: PdfStoredObjectRef, scratchDir: string): Promise<string>
  publish(area: PdfFileArea, relativePath: string, scratchFilePath: string, options?: PublishOptions): Promise<PdfStoredObjectRef>
  read(area: PdfFileArea, relativePath: string, options?: ReadOptions): Promise<ReadableStream | Buffer>
  list(area: PdfFileArea, relativeFolder: string, options?: ListOptions): Promise<PdfDirectoryListing>
  stat(area: PdfFileArea, relativePath: string): Promise<PdfFileInfo | null>
  createFolder(area: PdfFileArea, relativeFolder: string): Promise<void>
  rename(area: PdfFileArea, oldPath: string, newPath: string): Promise<void>
  moveToTrash(area: PdfFileArea, relativePath: string): Promise<TrashRecord>
  restoreFromTrash(trashId: string): Promise<void>
  delete(area: PdfFileArea, relativePath: string): Promise<void>
  cleanupScratch(jobId: string): Promise<void>
}
```

Do not force every provider to implement every feature at the provider protocol layer. The TM Tools abstraction must provide consistent workspace semantics by using Hub's manifest/folder APIs and, where required, a copy+delete move. A capability must be disabled or return a stable error if the selected connection cannot safely perform it.

### 4.2 Preserve the existing filesystem engines

The first cloud implementation should use the least disruptive approach:

1. Resolve the selected `PdfFileArea + relativePath` through the existing validation and descriptor layer.
2. Ask Hub for an authorized download grant for the corresponding `objectId`.
3. Materialize the file into a per-operation/per-job scratch path.
4. Run the existing operation with the same absolute local input/output paths it expects.
5. Publish every generated output from scratch to Hub under the exact existing `outputMapping` destination.
6. Clean scratch in `finally`, including error/cancel paths.
7. Update the logical manifest/index only after all required output files are confirmed.

Do not rewrite `server/modules/pdf/*` into a second cloud-only engine. Do not make the core engine know about R2, S3, Supabase or signed URLs.

For multi-output operations, use a per-operation scratch workspace and publish every result atomically at the application layer. If one publish fails, do not present a partial result set as fully successful; record which objects were committed and provide retry/cleanup logic.

## 5. Stable namespace mapping

Preserve all current user-facing area names and the existing `outputMapping` exactly.

Suggested Hub namespace mapping:

```text
tm-tools/pdf/sources/<relativePath>
tm-tools/pdf/inputs/<relativePath>
tm-tools/pdf/word/<relativePath>            # legacy read-only

tm-tools/pdf/split/<relativePath>
tm-tools/pdf/images/<relativePath>
tm-tools/pdf/merged/<relativePath>
tm-tools/pdf/products/<relativePath>
tm-tools/pdf/office/<relativePath>

tm-tools/pdf-internal/checkpoints/<relativePath>
tm-tools/pdf-internal/trash/<trashId>/<relativePath>
tm-tools/pdf-internal/temp/<jobId>/<relativePath>  # only if a durable remote temp object is genuinely needed
```

Hub adds the authenticated app/environment prefix and generates the physical object key. TM Tools supplies only an allowed namespace and validated relative path; it does not supply a raw bucket/key.

Internal namespaces must not appear as normal user-facing areas. They need separate permissions/retention and should not be downloadable through a generic UI file link.

### 5.1 Directory semantics

Object stores do not have true folders. TM Tools currently supports folder creation, nested folders, rename/delete and empty folders. Preserve that behavior by using Hub's logical folder metadata/marker mechanism together with object-prefix listing.

- A folder can exist even when empty.
- A directory listing is bounded and paginated; Explorer must not fetch the whole bucket on every render.
- Lazy child loading remains compatible with `GET /pdf/explorer/children`.
- Folder rename/move must move all descendant objects and folder metadata safely; do not only rewrite a path string in a local browser array.
- Root folder immutability and area permissions continue to come from `server/modules/pdf/workspace.ts` descriptors.
- The legacy `word` area stays read-only.
- Trash/restore/purge retain their current user semantics. Cloud trash may be a logical move/manifest state or a physical prefix copy; choose one, document it and test recovery after partial failures.

## 6. Upload integration

### 6.1 Existing routes stay compatible

Keep current API paths and return contracts:

```text
POST /api/v1/pdf/upload
POST /api/v1/pdf/inputs/upload
POST /api/v1/pdf/word/upload
```

Local/Electron may continue using the current multipart upload path. Cloud/Vercel should use a two-stage upload path for large browser files so bytes do not pass through the Vercel Function.

Suggested additive routes:

```text
POST /api/v1/pdf/storage/uploads/initiate
POST /api/v1/pdf/storage/uploads/:uploadId/complete
POST /api/v1/pdf/storage/uploads/:uploadId/abort
```

Flow:

```text
1. Browser chooses file and area/folder.
2. Browser calls TM Tools Nitro initiate route with its user session.
3. Nitro validates user, area, file type, size, relative path and current folder permissions.
4. Nitro calls TM Hub via server-only HubClient.storage.initUpload().
5. Hub returns a short-lived, exact-object upload grant.
6. Browser uploads bytes directly to the provider using the grant (or an approved proxy mode).
7. Browser calls TM Tools complete route.
8. Nitro calls Hub complete; Hub HEAD-verifies the object and finalizes the manifest.
9. TM Tools updates/reconciles workspace metadata and returns the existing PdfFileInfo shape.
```

Only the temporary signed URL and required headers may reach the browser. Do not return provider access keys, service-role key, App Secret or the full Hub connection record.

### 6.2 Small uploads and unsupported providers

- Use direct upload where provider capabilities permit it.
- Use multipart only when the selected provider reports a tested multipart capability.
- If Supabase does not advertise multipart, either enforce its tested max object size or use a bounded server-proxy/resumable path. Do not pretend it supports S3 multipart.
- Keep a bounded server-side streaming/proxy option for cases where direct browser upload is not available, but do not route arbitrarily large files through Vercel.
- Browser upload progress is based on actual bytes sent; do not display a fabricated percentage from grant creation.

### 6.3 Validation

Before issuing the Hub grant, TM Tools still validates:

- `PdfFileArea` through `parseArea` and `areaDescriptor()`.
- `relativePath` through `safeRelativePath` / `assertInsideRoot`-equivalent path rules.
- Writable files/folders according to the descriptor (`word` is read-only).
- Extension/MIME from the existing `server/modules/pdf/security.ts` rules.
- Per-file and per-request size limits.
- Duplicate/overwrite policy.
- User permission from the existing TM Tools auth/RBAC boundary.

Hub independently validates app identity, connection/grant, namespace prefix, max object size and signed grant scope. Validation at one layer does not replace the other.

## 7. Read, preview and download

Current `GET /api/v1/pdf/file?area=&name=&inline=1` uses `resolveAreaFile()` and `createReadStream()` from local disk.

Preserve its route and response semantics while routing through `PdfWorkspaceStorage`:

- **Local driver:** current local `createReadStream` path.
- **Hub driver:** resolve the internal object ID from the TM Tools workspace mapping/Hub manifest, request a Hub download grant server-side and stream/proxy the provider response through Nitro, or return a signed URL only where the UI contract explicitly supports it.
- For `inline=1`, set safe content type and `Content-Disposition: inline`, preserve range requests where the viewer needs seeking, and avoid caching private documents publicly.
- For download, keep the current attachment filename behavior.
- Never accept a raw bucket name/object key in `/pdf/file` query parameters.
- A signed download URL is temporary bearer access; do not store it in PDF metadata or localStorage.

A server proxy is preferable for auth-sensitive preview or when a signed URL would break same-origin/range behavior. Direct signed download may be used for large files if the browser UI handles it deliberately. Test both PDF inline preview and video/media range behavior if shared media routes are later migrated.

## 8. Processing operations and output publishing

All existing PDF operations must use the storage application layer. Preserve this mapping:

| Operation | Input | Output area |
|---|---|---|
| Split | `sources` | `split` |
| Merge | selected split folder | `merged` |
| Rasterize | `sources` | `images` |
| Images → PDF | selected `images` folder | `merged` |
| Convert input → PDF | `inputs` | `merged` |
| Export | `sources` | `office` (subject to existing operation format mapping; verify all current formats and any different destinations before editing) |
| Extract | `sources` / supported Word text input | `products` plus internal checkpoints |

The authoritative `outputMapping` currently maps `export: 'office'`. The existing spec may describe per-format export destinations in more detail; audit current code before changing mapping. This integration must not alter any existing destination rule.

For one operation:

```text
Hub object ref -> scratch input
             -> existing engine
             -> scratch output(s)
             -> Hub uploads + verified completion
             -> workspace index/manifest refresh
             -> scratch cleanup in finally
```

If an operation is synchronous and small, it may still execute in the same request using bounded scratch. If a task can outlive one function invocation (large PDF, multi-page AI extraction, batch), use durable job orchestration and a worker; do not depend on a serverless process remaining alive.

## 9. Persistent jobs and checkpoints are a separate workstream

The audited `server/modules/pdf/extract/jobs.ts` stores active jobs in a process-local `Map`. A restart or serverless invocation boundary loses that state. The current checkpoint files are also filesystem paths under the PDF data root.

Hub Storage solves durable bytes; it does **not** solve job orchestration.

Before enabling reliable long-running cloud extraction, implement or explicitly defer:

- A `PdfJobStore` interface and durable cloud implementation (the existing v4 spec prefers a PostgreSQL-backed job repository; verify the current selected DB before choosing provider).
- A worker/queue or other runtime that can continue processing after the HTTP request/function ends.
- Persisted job inputs, target model/connection ID, preset snapshot, schema version, progress, cancellation request, error, timestamps and output object IDs.
- Checkpoint version/fingerprint including source SHA-256/object version, model + connection identity, preset content/version, prompt/schema version and operation options.
- Idempotent output publication and cleanup of partial outputs.
- Retention and janitor tasks.

Do not persist AI provider secrets in job rows. Keep using the Hub AI Relay for provider calls. Do not mistake `connectionId` in the extraction request for permission to access arbitrary Storage objects.

## 10. Server-side Hub SDK integration

Create a server-only helper, e.g.:

```text
server/utils/hubStorage.ts
```

It should construct/use `HubClient` from `tm-hub-client` with:

```ts
new HubClient({
  baseUrl: runtimeConfig.public.hubUrl,
  appId: runtimeConfig.public.hubAppId,
  getAppSecret: () => runtimeConfig.hubAppSecret
})
```

Adapt exact constructor types to the published SDK. The Storage SDK methods use the existing App Secret mechanism (`X-App-Id` + `X-App-Secret`) from Hub AI Relay; do not reimplement raw fetch in each route.

Requirements:

- Do not import `server/utils/hubStorage.ts` from Vue/client code.
- Do not expose `hubAppSecret` through public runtime config, `useState`, cookies, page payloads or logs.
- Reuse one configured client per Nitro process/request lifecycle as appropriate; do not accidentally share mutable per-user state.
- Include request/correlation IDs for Hub errors.
- Map Hub stable error codes to TM Tools PDF/storage errors without leaking signed URL or raw provider errors.
- The client must target the configured `hubAppId` (`tm-tools` in this project) and use only its granted connections.

The existing `useHub()` composable remains appropriate for signed-in user UI interactions such as managing connections. It is not the place for privileged Storage Data Plane operations.

## 11. Local/Electron compatibility

### 11.1 Local provider remains the default for local users

- Current filesystem layout under `config.pdf.dir` remains intact.
- Keep all existing files readable; do not migrate/delete local data during the initial feature rollout.
- Keep path-traversal and symlink/junction protections in `paths.ts`, `security.ts`, `inspect.ts` and related routes.
- Keep `PDF_DATA_DIR` deterministic for Electron and set it to a path under Electron `app.getPath('userData')` before the Nitro server imports the PDF modules.
- `StorageManager` remains responsible for its existing Electron app data folders; do not redirect PDF data into its generic temp folder.
- `LocalPdfStorage` must pass all current PDF workspace, audit, trash, atomic-write and path-security tests.

### 11.2 Cloud provider must be opt-in at first

Use `PDF_STORAGE_DRIVER=local` for existing local deployments. Use `hub` for a Vercel preview only after Hub APIs, SDK version, CORS and a test connection are confirmed. An `auto` mode may select this based on server runtime, but it must fail clearly if the runtime requires durable cloud storage and no valid connection is available.

Do not auto-upload existing local PDFs in the background without explicit migration/consent. Add a separate migration command/workflow with dry-run, checksums, retry and a report if moving local data to Hub is requested.

## 12. Vercel deployment policy

- `.data/pdf` and `process.cwd()` are not persistent storage contracts for Vercel.
- `/tmp` is scratch only; no cross-invocation handoff and no job history.
- Large browser uploads should go direct to the short-lived Hub provider grant, not through a Vercel request body.
- Each PDF operation downloads only its required inputs to a bounded scratch directory and publishes outputs to Hub.
- Always clean scratch in `finally`; also use a janitor for abandoned temp artifacts where the platform allows it.
- Keep provider buckets private. Configure provider CORS for the exact deployed origin(s).
- Ensure the runtime has required fonts and native dependencies; `@napi-rs/canvas` must be explicit if needed by the chosen PDF engine and must be tested in the deployment build.
- Confirm actual Vercel function body, duration, memory and temporary disk limits at implementation/release time; do not hardcode assumptions from an old plan.
- Hub Storage does not make one long Nitro/Vercel invocation safe. Long work requires a durable job store and a worker outside the request lifecycle.

## 13. Hub API/SDK contract dependency

Use the contract in `TM-HUB-STORAGE-GATEWAY-IMPLEMENTATION.md` §7–8. Do not invent alternate route names or payload shapes. The expected SDK methods are:

```ts
client.storage.connections(appId?)
client.storage.initUpload(input, appId?)
client.storage.completeUpload(uploadId, receipt?, appId?)
client.storage.abortUpload(uploadId, appId?)
client.storage.createDownloadGrant(objectId, appId?)
client.storage.getObject(objectId, appId?)
client.storage.listObjects(params, appId?)
client.storage.listFolders(params, appId?)
client.storage.deleteObject(objectId, appId?)
client.storage.copyObject(input, appId?)
client.storage.createFolder(input, appId?)
client.storage.deleteFolder(input, appId?)
```

Hub may refine optional fields during implementation, but the route and type contract must be frozen before TM Tools enables cloud mode. The Hub agent must publish the exact SDK version and fixture data. Until that release is available, build against a local mock/contract fixture and keep the production feature flag off.

### 13.1 Status 2026-11-07 — gateway live, SDK namespace still absent

Verified against the local tm-hub (`http://localhost:4000`, app
`tm-tools_nttweh`) with `X-App-Id` + `X-App-Secret`:

```text
base    /api/v1/apps/:appId/storage
GET     /connections                 → { success: true, data: [...] }   (0 in this environment)
POST    /uploads/initiate            → uploadId, objectId, uploadUrl, headers, expiresAt, transferMode
POST    /uploads/:uploadId/complete  → HEAD-verified object (idempotent)
POST    /uploads/:uploadId/abort
GET     /objects/:objectId
POST    /objects/:objectId/download-grant
DELETE  /objects/:objectId
error   { error: true, statusCode, statusMessage: 'storage.*', message }
```

- `transferMode` is a single signed `PUT`; the gateway has no multipart route, so
  tm-tools refuses a multipart plan instead of splitting it into one part.
- Upload grant TTL 900 s, download grant 300 s, max object 5 GB. `objectId` is
  the durable handle; tm-tools never stores a bucket or key.
- `tm-hub-client@1.0.9` still has **no `storage` namespace**, so
  `server/utils/hubStorage.ts` calls these routes directly with the app identity
  (server-only) and maps `statusMessage` to typed tm-tools errors. Replace those
  calls with `client.storage.*` when a package version ships them; do not
  reimplement a route in a separate place before that.
- One upload grant goes to the signed-in browser (step 6 above); the download
  grant stays on the server and bytes stream through the authenticated route.
- **No Storage Connection exists yet** (live `GET /connections` → 200 with 0
  entries), which is owned by the Hub operator. Until one exists the provider
  answers `DOCUMENT_STORAGE_NOT_CONFIGURED` (`reason:
  no-hub-storage-connection`); it does not fabricate a connection or fall back
  to `/tmp` on a durable deployment. Implementation state lives in
  `docs/document-studio/` (`PHASE-STATUS.md`, `TEST-VERIFICATION.md` §10).

## 14. Implementation phases

### T0 — Audit and v3 readiness gate

1. Read `WORKSPACE-AUDIT.md`, `WORKSPACE-UPGRADE-PLAN.md`, v2 and v3 specs.
2. Verify the actual v3 phase status in the current branch. The plan currently says v3 must complete and pass gates before v4.
3. Run baseline `npx nuxt typecheck`, `npx eslint` using the repo's gate procedure, and `pnpm test`.
4. Inventory all direct `pdfDirs`, `AREA_DIRS`, `fs`, `createReadStream`, `writeFile`, `rename`, `trash`, checkpoint and directory operations in `server/modules/pdf/*` and `/api/v1/pdf/*`.
5. Produce a file-by-file storage migration map before changing routes.

**Exit:** v3 status and v4 readiness are explicit; baseline and current filesystem dependencies are recorded.

### T1 — Local abstraction with no behavior change

- Add `PdfRuntimePolicy`, `PdfWorkspaceStorage` and `LocalPdfStorage`.
- Route existing local operations through the abstraction one flow at a time.
- Keep `pdfDirs`, current layout and current API responses working through the local adapter.
- Add unit tests comparing current file list, upload, output, trash/restore and audit behavior.

**Exit:** Local and Electron behavior is unchanged; no Hub dependency is required for local operation.

### T2 — Hub SDK client and mocked adapter

- Upgrade `tm-hub-client` to the exact version published by the Hub agent.
- Add `server/utils/hubStorage.ts`.
- Implement `HubPdfStorage` using SDK methods only.
- Add fixture-based tests for connection discovery, upload initiation/completion, list/stat/download/delete and expected errors.
- Test that the App Secret is absent from renderer bundles, runtime public config, logs and HTTP responses.

**Exit:** Hub adapter tests pass against fixtures/mock; production flag still off.

### T3 — Workspace metadata and reads

- Map the eight areas and internal namespaces to Hub namespaces.
- Implement paginated file/folder listing and metadata conversion to existing `PdfDirectoryListing`, `PdfFileInfo`, `PdfFolderTreeNode` shapes.
- Implement Hub-backed `stat`, preview/download, folder create, rename/move and trash/restore semantics.
- Keep `word` read-only and root-folder rules in the existing descriptor layer.
- Do not load the entire bucket for each Explorer render.

**Exit:** Cloud workspace list, nested folder browsing, empty folders, preview, rename, trash and restore match current UI contracts.

### T4 — Direct upload and output publication

- Add cloud upload-initiate/complete/abort routes.
- Adapt `usePdfStudio.upload`, `uploadInputs` and `uploadWord` while preserving current caller-facing return types.
- For direct upload, return only short-lived grant URL + required headers to the browser.
- Add scratch materialization and `ResultWriter` publication for one simple operation first (e.g. split or convert), then port other operations individually.
- Publish outputs only after provider verification; clean scratch in `finally`.

**Exit:** one full source → process → output → refresh → preview/download workflow passes on a Vercel preview with a private test bucket.

### T5 — Remaining operations, trash and checkpoints

- Port all operations without changing `outputMapping`.
- Move/read/write checkpoints through explicit internal namespace.
- Complete trash, restore, purge and empty-folder behavior.
- Make output publishing idempotent and handle partial/multi-output failure.

**Exit:** all listed operations work using the same engine on local and Hub storage, with provider capabilities respected.

### T6 — Durable cloud jobs and deployment readiness

- Implement the separate persistent job store and worker plan before claiming extraction is durable on Vercel.
- Solve fonts, native canvas, SQLite/process.cwd and worker runtime blockers documented in v3 §12.
- Add retention, cleanup/janitor, audit, cancellation and restart recovery.
- Deploy preview; test real upload, restart, retry, cancellation, download and expiry.

**Exit:** cloud job survives request/process restart and has verified operational limits. If this is not completed, mark long-running extraction `BLOCKED` or `NOT SUPPORTED` in cloud mode rather than silently degrading.

## 15. Testing and acceptance checklist

### Compatibility

- [ ] All eight `PdfFileArea` values remain identical.
- [ ] `outputMapping` is unchanged.
- [ ] Existing `/api/v1/pdf/*` routes remain compatible with current callers.
- [ ] Existing local `.data/pdf` files remain visible and usable.
- [ ] `word` remains read-only.
- [ ] Current trash/restore and audit semantics remain intact.
- [ ] No new PDF engine or provider SDK is introduced into the renderer.

### Local/Electron

- [ ] Local dev works with no Hub Storage connection configured.
- [ ] Electron stores PDF data beneath `app.getPath('userData')` via `PDF_DATA_DIR` before Nitro import.
- [ ] Packaged app never writes user PDF data into the installation directory.
- [ ] Path traversal, symlink/junction escape and invalid area tests still pass.
- [ ] Existing regression test suite remains green.

### Cloud Storage

- [ ] Missing/disabled/revoked Hub connection returns a clear error; no fallback to persistent `/tmp`.
- [ ] Browser can upload a private PDF directly via a short-lived grant.
- [ ] Complete verifies actual object size/type before the file appears in Explorer.
- [ ] Wrong app, wrong namespace, wrong object ID or revoked grant is rejected by Hub.
- [ ] Upload failure/abort does not leave a visible `ready` object.
- [ ] Large input does not pass through a Vercel Function body when direct upload is supported.
- [ ] Directory listing is paginated and lazy.
- [ ] Empty folder semantics are preserved.
- [ ] Preview/download is private, filename/content type are correct, and range requests work where required.
- [ ] Rename/move physically updates the cloud object or is disabled with an honest capability message.
- [ ] Trash/restore/purge works after a process restart.
- [ ] Every output lands in the same area as the current mapping.
- [ ] Scratch and abandoned upload sessions are cleaned according to policy.

### Job reliability

- [ ] Job state is not process-local for production cloud extraction.
- [ ] A worker/queue handles work that cannot fit one request/function invocation.
- [ ] Cancel, retry, resume and checkpoint fingerprints are tested.
- [ ] Partial object publication is recoverable and not presented as success.

### Security

- [ ] `NUXT_HUB_APP_SECRET` is not in client bundle, public runtime config, localStorage, sessionStorage, user state or logs.
- [ ] Renderer cannot call provider APIs with credentials.
- [ ] No raw bucket/object key from browser is trusted without server validation.
- [ ] All PDF routes still require the current authenticated user.
- [ ] Hub calls are scoped to `tm-tools` App ID and the permitted Storage connection.
- [ ] Signed URLs are not persisted or logged.

### Gates

Use the repository's `nuxt-eslint-gate-after-prepare` process. At minimum:

```bash
npx nuxt typecheck
npx eslint <touched-files>
pnpm test
```

Lint must run after the final Nuxt typecheck/prepare step as required by the project skill. Record exact exit codes and test counts in `docs/pdf/VERIFICATION.md` or the current project verification file.

## 16. Environment configuration

Suggested Vercel environment values:

```env
NUXT_PUBLIC_HUB_URL=https://<your-hub-domain>
NUXT_PUBLIC_HUB_APP_ID=tm-tools
NUXT_HUB_APP_SECRET=<server-only TM Tools app secret>

PDF_STORAGE_DRIVER=hub
PDF_STORAGE_CONNECTION_ID=<optional preferred connection id>
PDF_STORAGE_NAMESPACE=tm-tools/pdf
PDF_STORAGE_MAX_INLINE_BYTES=<bounded value>
PDF_STORAGE_RETENTION_DAYS=<policy value>
```

For local/Electron:

```env
PDF_STORAGE_DRIVER=local
PDF_DATA_DIR=<userData>/pdf
```

Do not add `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY` or `SUPABASE_STORAGE_KEY` to TM Tools environment variables. Those secrets belong only in TM Hub Connections.

## 17. Explicit non-goals

- Do not rebuild TM Hub connection UI or the Storage provider wizard.
- Do not add direct AWS S3 / Cloudflare R2 / Supabase Storage SDK credentials to TM Tools.
- Do not rewrite PDF engine modules as separate cloud engines.
- Do not rename the eight PDF areas or reorganize the existing local workspace folders.
- Do not remove Cloudinary Media support or merge it into Storage Gateway.
- Do not automatically migrate local files to cloud without an explicit migration command/approval.
- Do not claim that R2 alone fixes Vercel duration, worker execution, database persistence, native fonts or canvas dependencies.
- Do not start cloud mode in production until Hub SDK contract and provider E2E gates are complete.

## 18. Source files reviewed

TM Tools:

- `package.json` (`tm-hub-client@1.0.9`)
- `nuxt.config.ts` (server-only `hubAppSecret` and public Hub URL/App ID)
- `app/composables/useHub.ts`
- `server/middleware/auth.ts`
- `electron/src/infrastructure/storage/StorageManager.ts`
- `server/modules/pdf/workspace.ts`
- `server/modules/pdf/paths.ts`
- `server/api/v1/pdf/upload.post.ts`
- `server/api/v1/pdf/inputs/upload.post.ts`
- `server/api/v1/pdf/file.get.ts`
- `server/api/v1/pdf/extract/start.post.ts`
- `server/modules/pdf/extract/jobs.ts`
- `app/composables/usePdfDirectory.ts`
- `app/composables/usePdfStudio.ts`
- `docs/pdf/WORKSPACE-AUDIT.md`
- `docs/pdf/WORKSPACE-UPGRADE-PLAN.md`
- `docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` (§12 multi-runtime design)

TM Hub / SDK:

- `tuanmjnh/tm-hub/server/modules/connections/registry.ts`
- `tuanmjnh/tm-hub/server/modules/connections/providers/{cloudflareR2,awsS3,supabaseStorage}.ts`
- `tuanmjnh/tm-hub/server/utils/authz.ts` (`requireAppAuth`)
- `tuanmjnh/tm-hub/server/api/v1/apps/[id]/ai/relay/*` (server-to-server reference)
- `tuanmjnh/tm-hub-client/src/client.ts`
- `tuanmjnh/tm-hub-client/src/types.ts`

**Audit boundary:** this brief reflects the reviewed GitHub `main` snapshots in the header. Re-audit the actual working tree and current v3 completion status before coding; local or unpushed changes are not represented here.
