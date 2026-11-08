# TM Document Studio v4 — Architecture

Implements [`docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md`](../pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md).
Phases 0–4 are implemented and verified. Phases 5–6 are implemented but not
deployed: the Neon schema, R2 provider, per-operation capability gate and bounded
scratch exist, with no live service in this environment. Phases 7–9 are not
started. Evidence: [`TEST-VERIFICATION.md`](./TEST-VERIFICATION.md); cloud
decisions: [`CLOUD-ARCHITECTURE.md`](./CLOUD-ARCHITECTURE.md).

## 1. Product flow

```
CHOOSE  → pick files anywhere the runtime allows (dropzone / picker)
PROCESS → pick an operation, set its options, run
SAVE    → artifacts land in `output/` (local) or arrive via the download route (cloud)
```

No operation page mounts the area tree. The legacy explorer survives only on
`/pdf/library` for the compatibility period.

## 2. Layers

```
app/pages/document-studio/**          SPA pages (one per operation)
app/components/document-studio/**     presentation only
app/composables/useDocument*.ts       application services (API + selection state)
─────────────────────────────────────────────────────────────────────────────
server/api/v1/documents/**            HTTP boundary (auth, ownership, errors)
server/modules/document/**            domain: registry, runtime, storage, jobs, runner
server/modules/pdf/**                 existing engines (unchanged)
─────────────────────────────────────────────────────────────────────────────
<data root>/input | output | .system   storage layout
```

Rules enforced by `tests/unit/document_studio_ui.spec.ts`:

- pages never import `#server/**` or `node:*`;
- pages never compose filesystem paths or mention `PDF_DATA_DIR`;
- the client never base64-encodes a payload — uploads are multipart `FormData`.

## 3. Server modules

| Module | Responsibility |
| --- | --- |
| `operations.ts` | Operation registry (business metadata) + `DocumentError` with HTTP status and retryability |
| `runtime.ts` | Runtime detection, resource policy, per-runtime supported operations |
| `runtime-context.ts` | Picks the adapter set for the current runtime; refuses the cloud stack until it exists |
| `paths.ts` | `<root>/input`, `<root>/output`, `<root>/.system/jobs`; job-path containment |
| `temporary.ts` | Per-job temp dirs, quota, staging release, orphan listing |
| `storage.ts` | `DocumentStorageProvider` over the local filesystem |
| `jobs.ts` | `DocumentJobRepository` persisted as one JSON manifest per job |
| `staging.ts` | Extension + magic-byte validation, stage-once write |
| `executors.ts` | One adapter per operation wrapping the existing v3 engine |
| `runner.ts` | Draft → upload → start → publish state machine |
| `output.ts` | Output delivery (`output/` copy vs. download-only) |
| `cleanup.ts` | Startup janitor for expired job directories |

## 4. Job lifecycle

Server-owned transitions, declared once in `shared/types/document/index.ts`:

```
created → uploading → queued → running → publishing → completed
   │           │          │        │           ├→ partial
   │           │          │        ├→ cancel_requested → cancelled
   │           │          └→ cancelled / failed
   │           └→ failed   └→ failed
   └→ failed / cancelled
completed|partial|failed|cancelled → expired
```

`LocalJobRepository.updateStatus` rejects any edge not in that table, so a
handler cannot invent a shortcut. Terminal states stamp `finishedAt`.

## 5. Execution model

1. `POST /jobs` creates the draft and its temp directory.
2. `POST /jobs/:id/inputs` streams multipart bytes, validates extension **and**
   leading bytes, then writes them under `jobs/<id>/input/<inputId>/`.
3. `POST /jobs/:id/start` marks `queued` → `running`, calls the operation's
   executor, validates the produced files are non-empty, publishes artifacts,
   then marks `publishing` → `completed`/`partial`.
4. Input and working bytes are dropped in `finally`; `output/` survives until
   retention expires because artifact downloads read it.

Engine adapters never accept a client path: they receive `stagedPath` resolved
from the job workspace. Merge and Images→PDF copy inputs into a zero-padded
folder so the engines' own `naturalCompare` ordering matches the user's order.

## 6. Error handling

`runDocument()` normalizes every thrown value into `{ ok:false, error:{ code,
message, retryable }, requestId }` with an HTTP status from
`ERROR_STATUS`. Unknown failures become `DOCUMENT_STORAGE_UNAVAILABLE`; the
original message is only surfaced in `details`, never in the response body.

Client-side, `useDocumentApi` re-reads `statusMessage`/`data.error.code` and the
pages render `document.errors.<CODE>`. Every code has both locales.

## 7. What is intentionally absent

- No cloud storage adapter: `documentRuntime()` throws
  `DOCUMENT_RUNTIME_NOT_SUPPORTED` when the runtime is not local/electron,
  instead of writing to a `/tmp` that Vercel will discard.
- No queue, worker, or lease implementation: the local runtime runs inline and
  the job manifest records the outcome before the response returns.
- No AI extraction executor: the v3 extraction stays on `/pdf/extract` with its
  own in-memory job map until phase 7 moves it behind the repository.
