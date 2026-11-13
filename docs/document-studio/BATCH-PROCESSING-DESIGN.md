# Document Studio — Batch Processing Design

**Date**: 2026-11-11
**Status**: Direction approved (Approach A — client-side async pool). Authorised to proceed to implementation ("làm tiếp cho xong").
**Scope**: All seven Document Studio operations. Multi-file selection, progress management, sequential/parallel processing (concurrency 1–10, default 1), a short pause between processes, and a loading/animation UI.

---

## 1. Requirements (verbatim intent)

> Nâng cấp toàn bộ công cụ document-studio: chọn nhiều file cùng lúc, quản lý tiến trình, xử lý tuần tự hoặc song song (1–10 luồng, mặc định 1), nghỉ ngắn giữa các tiến trình, UI loading + animation nhẹ.

Decisions locked through clarification:

| Question | Decision |
| :--- | :--- |
| Runtime scope | **All runtimes** (local-web browser + Electron + cloud/Hub). |
| One file fails | **Continue + mark partial** (matches existing `failedUnits` / `partial`). |
| Which tools | **Per-file ops → batch** (split, rasterize, convert, export, ai-extract). Combine ops (merge, images-to-pdf) keep N→1 semantics. AI-extract forced concurrency = 1 (global lock `PDF_JOB_RUNNING`). |
| Reuse `task-manager.cjs` | Reuse its **scheduling model + UX**, not the class (it spawns external exes and is Electron-main-only). |

## 2. Architecture decision

**Approach A — client-side async pool, N single-input jobs.** The browser/Electron renderer runs an async pool that fires one existing document job per selected file through the unchanged `create → stage → start → artifacts` lifecycle. Concurrency, pause-between-dispatch, pause/resume/stop and retry are the scheduling semantics of `electron/tools/task-manager.cjs` translated from a child-process pool to an async function pool.

Rejected:
- **B — server-side batch job** (1 job, N inputs, internal pool + queue + SSE): requires rewriting runner/dispatcher/jobs/start (all runtimes currently `await startDocumentJob` inside the HTTP request, no queue), cloud is request-bound and would time out on a 50-file batch, needs a worker that does not exist, conflicts with the AI-extract global lock. Wide blast radius.
- **C — literal `TaskProcessManager` over IPC**: spawns exes (document jobs are in-process JS) and is Electron-only (breaks local-web + cloud).

### Why A is safe (evidence from code)

- `server/modules/document/staging.ts:113` (`validateCount`) and every per-file executor (`executors.ts:86,144,190,209,279`) enforce **one input per job**. Keeping `input.maxFiles = 1` for per-file ops means the server pipeline is byte-for-byte unchanged; each batch item is a normal single-input job.
- `app/composables/useDocumentApi.ts` already exposes `job` (poll), `cancelJob`, `jobs`, `artifacts` — enough for pool progress + cancel without new endpoints.
- `shared/types/document/index.ts` already has `DocumentJobProgress { totalUnits, completedUnits, failedUnits }` and statuses `partial`, `cancel_requested`, `cancelled`.
- `app/composables/useToolTaskManager.ts` is the precedent for module-global, per-kind batch state that survives route navigation; `app/components/tools/video/BatchPanel.vue` is the UX precedent (threads input + matched-file list + Start).

## 3. Contract changes (metadata only)

New optional field on `DocumentOperationDefinition` (`shared/types/document/index.ts`), separating **per-job cardinality** (`input.*`, server-enforced) from **selection/pool** (`batch.*`, client-read):

```ts
export interface DocumentOperationBatchSpec {
  mode: 'per-file' | 'combine'
  /** Selection cap for one batch run (client-side). */
  maxFiles: number
  /** Upper bound for the concurrency slider; defaults to 10. */
  maxConcurrency?: number
}
// DocumentOperationDefinition.batch?: DocumentOperationBatchSpec
```

`server/modules/document/operations.ts`:

| Operation | `input.mode` / `input.maxFiles` | new `batch` |
| :--- | :--- | :--- |
| pdf.split | single-file / 1 (unchanged) | `{ mode:'per-file', maxFiles:50 }` |
| pdf.rasterize | single-file / 1 (unchanged) | `{ mode:'per-file', maxFiles:50 }` |
| document.convert-to-pdf | single-file / 1 (unchanged) | `{ mode:'per-file', maxFiles:50 }` |
| pdf.export | single-file / 1 (unchanged) | `{ mode:'per-file', maxFiles:50 }` |
| document.ai-extract | single-file / 1 (unchanged) | `{ mode:'per-file', maxFiles:50, maxConcurrency:1 }` |
| pdf.merge | multi-file / 50 (unchanged) | none → combine |
| pdf.images-to-pdf | multi-file / 200 (unchanged) | none → combine |

Client derivations (in `useDocumentOperationPage` / `useDocumentFiles`):
- `isPerFileBatch = definition.batch?.mode === 'per-file'`
- `multiple = input.mode !== 'single-file' || isPerFileBatch`
- `selectionCap = batch?.maxFiles ?? input.maxFiles`
- `concurrencyCap = batch?.maxConcurrency ?? 10`

No executor, staging, runner, dispatcher or repository change. No new server endpoint.

## 4. Client — helper extraction + pool

### 4a. `runSingleDocumentJob` helper (extracted from `useDocumentRun.run`)

Pure function (no reactive refs) so N can run concurrently without clobbering shared state. Exported from `app/composables/useDocumentRun.ts` (keeps the job lifecycle in one module).

```ts
export async function runSingleDocumentJob(api, opts: {
  operationId: string
  files: File[]
  config: Record<string, unknown>
  directUpload?: boolean
  inline?: boolean
  idempotencyKey?: string   // generated once per item, reused on retry
  signal?: AbortSignal      // client-side abort frees the pool slot
  onJobId?: (id: string) => void
}): Promise<{ job: DocumentJobView, artifacts: DocumentArtifactView[] }>
```

Body = the existing `useDocumentRun.run` logic (inline / local multipart / cloud signed-plan), minus the refs. `useDocumentRun.run` becomes a thin reactive wrapper around it for the combine/single path. `useDocumentApi` gains an optional `signal` parameter on `createJob`, `uploadInputs`, `startJob`, `declareInput`, `completeInput`, `runInline`, passed to `$fetch` (authorised helper upgrade).

### 4b. `useDocumentBatch(operationId)` composable

Module-global state per `operationId` (mirrors `useToolTaskManager.globalStates`) so the batch survives route changes while the tab is open. `File` blobs live in a non-reactive `Map` keyed by item id; reactive items hold only metadata.

```ts
interface BatchItem {
  id: string
  name: string
  size: number
  status: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled' | 'retrying'
  jobId?: string
  progress: number                 // 0–100 from job.progress
  artifacts: DocumentArtifactView[]
  error?: DocumentErrorPayload
  retry: number
}
type BatchStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'done' | 'partial'
```

Returned surface: `items`, `concurrency` (1..cap, default 1), `pauseMs` (default 300), `maxRetry` (default 0), `status`, computed `total/done/failed/running/waiting`, `overallProgress`, flattened `artifacts`; actions `start(files, config, {directUpload, inline})`, `pause()`, `resume()`, `stop()`, `retryItem(id)`, `clear()`, `setConcurrency`, `setPauseMs`.

**Scheduling algorithm** = `task-manager.runSingle` translated to async (single dispatch loop + active-slot counter, reads `concurrency` each tick so the slider applies live):

```
start: build waiting items + blobs; status = running; run dispatch loop
dispatch loop (tick ~200ms):
  while hasWaiting or active > 0:
    if status == stopping: break
    if status == paused: await delay(50); continue
    while active < concurrency and nextWaiting exists:
      launch runItem(next)            // active++ ; not awaited
    await delay(since-last-launch < pauseMs ? remainder : tick)
  finalize()
runItem(item):
  item.status = running
  try {job, artifacts} = await runSingleDocumentJob(... idempotencyKey, signal, onJobId)
    item.artifacts = artifacts; item.progress = 100; item.status = done
  catch e:
    if aborted/stopping → cancelled
    else if retry < maxRetry → retry++, status = retrying, requeue waiting
    else → failed, item.error = e
  finally active--
finalize: status = failed > 0 ? partial : done; stop polling
```

**Progress polling**: one interval (~1s) polls `api.job(jobId)` for running items in parallel (`Promise.all`), maps `progress.completedUnits/totalUnits` → percent, stops when no running items, cleared on finalize/clear (no timer leak).

**pause** stops dispatching (in-flight items finish); **resume** continues; **stop** sets `stopping`, marks waiting items cancelled, aborts running items' client signal + best-effort `api.cancelJob(jobId)`, waits `active === 0`, then finalizes.

### 4c. Funnel branch (`useDocumentOperationPage.run`)

```
if (isPerFileBatch) { batch.start(selection.uploadPayload(), executionConfig, {directUpload, inline}); selection.clear(); return }
// else: existing session.run(allFiles) for combine/single
```

`outputDir` injection for local stays as today. Selection clears once at batch start (files move into items), not per item.

## 5. UI

### 5a. `OperationPageShell.vue` (presentational, dual-mode)

New optional `batch` view-model prop + batch action emits. When `batch` is absent (combine/single), behaviour is unchanged. When present (per-file):
- `#advanced` slot hosts `DocumentStudioBatchPanel`.
- Action bar replaces the fake `uploading ? 15 : 60` bar with **real** aggregate progress: `UProgress` bound to `batch.overallProgress` + `{done}/{total}` label; buttons Start / Pause / Resume / Stop (one primary `color="primary" variant="soft"`, others ghost; Stop `color="error"`).
- Results list flattens artifacts from done items (existing artifact rows/menus unchanged).
- Selected-files list shows pre-start selection; once started, items live in BatchPanel.

### 5b. `DocumentStudioBatchPanel.vue` (new)

- Concurrency control: `USlider`/`UInput` 1..`concurrencyCap`, default 1. For ai-extract cap = 1 → disabled with hint `document.batch.extractLocked`.
- Pause-between-files input (ms, default 300) + optional max-retry input (default 0).
- Item list: one row per file = lucide status icon + truncated name + `UBadge variant="subtle"` (≤2-word label) + per-item `UProgress` + retry icon on failed. Capped scroll (`max-h-64 overflow-auto`), scrollbar styled from palette tokens.
- Motion budget 150–200ms ease for status/entrance transitions; running icon uses the allowed gentle live pulse. No other hand-rolled `animate-*`.
- Triple state: loading (running), empty (`document.batch.empty`), error (failed rows surfaced with retry).

### 5c. i18n (both `i18n/locales/en.json` + `vi.json`, no inline fallbacks)

New `document.batch.*`: `title, concurrency, concurrencyHint, pauseBetween, maxRetry, start, pause, resume, stop, retry, overall ({done}/{total}), empty, extractLocked, status.{waiting,running,done,failed,cancelled,retrying}`.

## 6. Runtime behaviour & limits (honest)

- **Local / Electron**: inline, no queue. CPU-bound PDF engines serialize on the single JS thread, so concurrency mainly overlaps I/O and AI-relay network — not true CPU parallelism. Stated in UI hint/docs.
- **Cloud (Vercel)**: bounded dispatcher; a file over scratch budget → `DOCUMENT_WORKER_REQUIRED` → that item failed → batch partial. Concurrency bounded by Hub request budget; each `start` holds a request open for the job duration.
- **Ephemeral cloud**: `runInline` per item (3 MB cap), bytes returned inline.
- **AI-extract**: concurrency forced 1 (global lock). Sequential items are safe because the executor polls until the job is terminal before returning, releasing the lock.
- **Cancel**: client abort + `cancelJob` status (`cancel_requested`). The server engine is **not** truly aborted (`runner.ts:187` signal never wired) — deferred, recorded as a known gap. In-flight engine may finish; its result is discarded client-side.

## 7. Testing & gates

Unit specs (RED first):
- `document_batch_contract.spec.ts` — per-file ops carry `batch.mode='per-file'`, `maxFiles=50`, `input.maxFiles` stays 1; extract `maxConcurrency=1`; combine ops have no batch.
- `document_batch_pool.spec.ts` — concurrency cap respected, pause-between-dispatch, pause/resume, stop cancels waiting, failure→partial, retry reuses idempotency key (fake api + fake timers).
- `document_run_helper.spec.ts` — `runSingleDocumentJob` create→stage→start order, signal abort, idempotency reuse.
- `document_batch_ui.spec.ts` — source contract: shell branches on batch + real progress (no fake bar), BatchPanel concurrency cap/pause/status, i18n keys present in both locales.

Gate ladder (nuxt-eslint-gate-after-prepare): `npx nuxt typecheck` → eslint on touched files **after** `.nuxt/eslint.config.mjs` regeneration → `pnpm test` → `pnpm build:electron`. Single spec: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/<name>.spec.ts`.

Real verification: signed-in local pass on `:4002` — split batch of 3 PDFs at concurrency 2 (observe per-file progress + aggregate), a deliberately bad file → partial; extract batch concurrency locked to 1. Clean all probe data afterwards. No fabricated signed-in claim.

## 8. Docs

Update `docs/document-studio/V5-IMPLEMENTATION-STATUS.md` with a batch-processing section (architecture, contract, runtime limits, evidence). This spec is the design record.

## 9. Out of scope / deferred

- True server engine abort (wire `AbortController` in runner + executor signal checks) — separate server change, deferred.
- Server-side batch job / queue / worker (Approach B) — rejected.
- Batch surviving tab close — not supported (client pool lives in the open tab).
- Per-page percent within split/rasterize (engine reports totalPages at once) — per-file percent only.