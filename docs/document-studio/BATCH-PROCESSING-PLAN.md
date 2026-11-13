# Document Studio Batch Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-file batch processing (concurrency 1–10, default 1, short pause between files, pause/resume/stop, real progress, gentle animation) to all per-file Document Studio operations across every runtime.

**Architecture:** Client-side async pool fires one existing single-input document job per selected file through the unchanged `create → stage → start → artifacts` lifecycle. The scheduling core is a pure, framework-agnostic function (`app/utils/batchPool.ts`) translated from `electron/tools/task-manager.cjs`; a Vue composable (`useDocumentBatch`) wraps it with reactive state. Server change is metadata-only.

**Tech Stack:** Nuxt 4 (srcDir app/, ssr:false), Nuxt UI v4, Tailwind v4, Vue 3, TypeScript, node:test + tsx, pnpm.

**Spec:** `docs/document-studio/BATCH-PROCESSING-DESIGN.md`

## Global Constraints

- Frontend never imports server; server never imports app; shared contracts via `#shared/`.
- Per-file ops keep `input.mode='single-file'`, `input.maxFiles=1` (server per-job cardinality unchanged). Batch selection cap lives in new `batch.maxFiles`.
- AI-extract concurrency forced to 1 (`batch.maxConcurrency=1`, global lock `PDF_JOB_RUNNING`).
- Combine ops (merge, images-to-pdf) keep N→1 semantics; no batch field.
- One file fails → continue + mark partial. Never stop-on-first-error.
- i18n in BOTH `i18n/locales/en.json` and `vi.json`; NO inline `t()` fallbacks.
- Primary button `color="primary" variant="soft"` (one per surface); cancel `variant="ghost"`; destructive `color="error"`. Inputs `class="w-full"`.
- Motion budget 150–200ms ease; no hand-rolled `animate-*` except skeleton/live pulse. Status = one lucide icon + ≤2-word `UBadge variant="subtle"`; progress shows `{done}/{total}`.
- Triple state rule: loading / empty / error.
- Comments/logs/commits in English. No code comments unless WHY is non-obvious.
- Gate ladder: `npx nuxt typecheck` → eslint on touched files AFTER `.nuxt/eslint.config.mjs` regen → `pnpm test` → `pnpm build:electron`. Never mark PASS on typecheck/build alone; real verification required.
- Never edit a test to force PASS; unmet criterion → BLOCKED/DEFERRED with measurement.
- Test style: `node:test` + `node:assert/strict`; single spec `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/<name>.spec.ts`.

## File Structure

| File | Responsibility |
| :--- | :--- |
| `shared/types/document/index.ts` (modify) | add `DocumentOperationBatchSpec` + `definition.batch?` |
| `server/modules/document/operations.ts` (modify) | set `batch` on 5 per-file ops |
| `app/utils/batchPool.ts` (create) | pure async scheduling core (no Vue) |
| `app/composables/useDocumentRun.ts` (modify) | export `runSingleDocumentJob` helper; `run` becomes wrapper |
| `app/composables/useDocumentApi.ts` (modify) | optional `signal` on job lifecycle methods |
| `app/composables/useDocumentBatch.ts` (create) | reactive pool state + actions, wraps batchPool |
| `app/composables/useDocumentFiles.ts` (modify) | selection cap from `batch.maxFiles` |
| `app/composables/useDocumentOperationPage.ts` (modify) | `multiple`/`isPerFileBatch` derivation + run branch |
| `app/components/document-studio/BatchPanel.vue` (create) | concurrency/pause/retry controls + item list |
| `app/components/document-studio/OperationPageShell.vue` (modify) | dual-mode action bar + real progress + batch slot |
| `app/pages/document-studio/tools/[slug].vue` (modify) | wire batch state/actions |
| `i18n/locales/en.json`, `vi.json` (modify) | `document.batch.*` |
| `tests/unit/document_batch_*.spec.ts` (create) | contract / pool / helper / ui specs |

---

### Task 1: Batch contract metadata

**Files:**
- Modify: `shared/types/document/index.ts` (after `DocumentOperationInputSpec`, ~L56; and `DocumentOperationDefinition` ~L94)
- Modify: `server/modules/document/operations.ts:34,62,90,104,118`
- Test: `tests/unit/document_batch_contract.spec.ts`

**Interfaces:**
- Produces: `DocumentOperationBatchSpec { mode:'per-file'|'combine', maxFiles:number, maxConcurrency?:number }`; `DocumentOperationDefinition.batch?: DocumentOperationBatchSpec`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { DOCUMENT_OPERATIONS, documentOperation } = await import('../../server/modules/document/operations')

const PER_FILE = ['pdf.split', 'pdf.rasterize', 'document.convert-to-pdf', 'pdf.export', 'document.ai-extract']
const COMBINE = ['pdf.merge', 'pdf.images-to-pdf']

describe('batch contract', () => {
  it('marks every per-file op as a per-file batch with a 50-file selection cap', () => {
    for (const id of PER_FILE) {
      const op = documentOperation(id)!
      assert.equal(op.batch?.mode, 'per-file', `${id} batch.mode`)
      assert.equal(op.batch?.maxFiles, 50, `${id} batch.maxFiles`)
    }
  })

  it('keeps per-job cardinality at one input for per-file ops', () => {
    for (const id of PER_FILE) {
      const op = documentOperation(id)!
      assert.equal(op.input.maxFiles, 1, `${id} input.maxFiles must stay 1`)
      assert.equal(op.input.mode, 'single-file', `${id} input.mode must stay single-file`)
    }
  })

  it('forces AI-extract concurrency to 1', () => {
    assert.equal(documentOperation('document.ai-extract')!.batch?.maxConcurrency, 1)
  })

  it('leaves combine ops without a batch field (N→1 semantics)', () => {
    for (const id of COMBINE) {
      assert.equal(documentOperation(id)!.batch, undefined, `${id} must not be per-file batch`)
    }
  })

  it('does not change the operation count', () => {
    assert.equal(DOCUMENT_OPERATIONS.length, 7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_batch_contract.spec.ts`
Expected: FAIL — `op.batch` undefined.

- [ ] **Step 3: Add the type**

In `shared/types/document/index.ts` add after `DocumentOperationInputSpec`:

```ts
export interface DocumentOperationBatchSpec {
  mode: 'per-file' | 'combine'
  maxFiles: number
  maxConcurrency?: number
}
```

Add to `DocumentOperationDefinition` (before `legacyTool?`):

```ts
  /** Client-side batch selection/pool metadata; per-job cardinality stays in input. */
  batch?: DocumentOperationBatchSpec
```

- [ ] **Step 4: Set batch on the 5 per-file ops**

In `server/modules/document/operations.ts`, add to each per-file definition (after `execution`):
- split/rasterize/convert/export: `batch: { mode: 'per-file', maxFiles: 50 }`
- ai-extract: `batch: { mode: 'per-file', maxFiles: 50, maxConcurrency: 1 }`

Leave `input` blocks unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run: same command. Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add shared/types/document/index.ts server/modules/document/operations.ts tests/unit/document_batch_contract.spec.ts
git commit -m "feat(document): add per-file batch metadata to operation contracts"
```

---

### Task 2: Pure async scheduling core

**Files:**
- Create: `app/utils/batchPool.ts`
- Test: `tests/unit/document_batch_pool.spec.ts`

**Interfaces:**
- Produces:
  - `type PoolItemStatus = 'waiting'|'running'|'done'|'failed'|'cancelled'`
  - `interface PoolItem { id:string, status:PoolItemStatus, retry:number }`
  - `interface BatchPoolOptions<T extends PoolItem> { concurrency:()=>number, pauseMs:()=>number, maxRetry:()=>number, isPaused:()=>boolean, isStopping:()=>boolean, run:(item:T)=>Promise<void>, delay?:(ms:number)=>Promise<void>, tickMs?:number }`
  - `interface BatchPoolResult { done:number, failed:number, cancelled:number }`
  - `async function runBatchPool<T extends PoolItem>(items:T[], opts:BatchPoolOptions<T>):Promise<BatchPoolResult>`
- Behavior: single dispatch loop + active-slot counter (task-manager.runSingle translated). Each pass launches up to `concurrency()-active` waiting items, then rests `pauseMs` (or `tickMs` when nothing launched). `run` resolves → done; throws → retry (requeue waiting, retry++) up to `maxRetry()`, else failed. `isStopping` → waiting items cancelled, drain active, exit. `isPaused` → no launches. Mutates `item.status`/`item.retry` in place (works on Vue-reactive items transparently).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { runBatchPool } = await import('../../app/utils/batchPool')

const flush = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve() }
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), status: 'waiting' as const, retry: 0 }))
const base = { pauseMs: () => 0, maxRetry: () => 0, isPaused: () => false, isStopping: () => false, delay: async () => {}, tickMs: 0 }

describe('batch pool scheduling', () => {
  it('never exceeds the concurrency cap', async () => {
    const list = items(6)
    let active = 0, peak = 0
    const gates = new Map<string, () => void>()
    const run = (item: { id: string }) => {
      active++; peak = Math.max(peak, active)
      return new Promise<void>((resolve) => { gates.set(item.id, () => { active--; resolve() }) })
    }
    const p = runBatchPool(list, { ...base, concurrency: () => 2, run })
    await flush()
    assert.equal(peak, 2)
    for (const [, open] of gates) { open(); await flush() }
    const res = await p
    assert.equal(res.done, 6)
    assert.ok(peak <= 2)
  })

  it('continues past a failure and reports partial counts', async () => {
    const list = items(3)
    const run = async (item: { id: string }) => { if (item.id === '1') throw new Error('boom') }
    const res = await runBatchPool(list, { ...base, concurrency: () => 1, run })
    assert.equal(res.done, 2)
    assert.equal(res.failed, 1)
    assert.equal(list[1]!.status, 'failed')
  })

  it('retries a failed item up to maxRetry then succeeds', async () => {
    const list = items(1)
    let attempts = 0
    const run = async () => { attempts++; if (attempts < 2) throw new Error('again') }
    const res = await runBatchPool(list, { ...base, concurrency: () => 1, maxRetry: () => 1, run })
    assert.equal(res.done, 1)
    assert.equal(list[0]!.retry, 1)
    assert.equal(attempts, 2)
  })

  it('cancels waiting items when stopping', async () => {
    const list = items(4)
    let stopping = false
    const gates: Array<() => void> = []
    const run = (item: { id: string }) => new Promise<void>((resolve) => { gates.push(() => resolve()) })
    const p = runBatchPool(list, { ...base, concurrency: () => 1, isStopping: () => stopping, run })
    await flush()
    stopping = true
    await flush()
    for (const open of gates) { open(); await flush() }
    const res = await p
    assert.equal(res.cancelled, 3)
    assert.equal(list.filter(i => i.status === 'cancelled').length, 3)
  })

  it('does not launch while paused', async () => {
    const list = items(2)
    let paused = true, launched = 0
    const run = async () => { launched++ }
    const p = runBatchPool(list, { ...base, concurrency: () => 1, isPaused: () => paused, run })
    await flush()
    assert.equal(launched, 0)
    paused = false
    const res = await p
    assert.equal(res.done, 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_batch_pool.spec.ts`
Expected: FAIL — cannot resolve `app/utils/batchPool`.

- [ ] **Step 3: Implement the core**

Create `app/utils/batchPool.ts`:

```ts
export type PoolItemStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'

export interface PoolItem {
  id: string
  status: PoolItemStatus
  retry: number
}

export interface BatchPoolOptions<T extends PoolItem> {
  concurrency: () => number
  pauseMs: () => number
  maxRetry: () => number
  isPaused: () => boolean
  isStopping: () => boolean
  run: (item: T) => Promise<void>
  delay?: (ms: number) => Promise<void>
  tickMs?: number
}

export interface BatchPoolResult {
  done: number
  failed: number
  cancelled: number
}

const realDelay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function runBatchPool<T extends PoolItem>(items: T[], opts: BatchPoolOptions<T>): Promise<BatchPoolResult> {
  const delay = opts.delay ?? realDelay
  const tick = opts.tickMs ?? 200
  let active = 0

  const launch = (item: T) => {
    item.status = 'running'
    active++
    void (async () => {
      try {
        await opts.run(item)
        item.status = 'done'
      } catch {
        if (item.retry < opts.maxRetry()) {
          item.retry++
          item.status = 'waiting'
        } else {
          item.status = 'failed'
        }
      } finally {
        active--
      }
    })()
  }

  const nextWaiting = () => items.find(item => item.status === 'waiting')
  const pending = () => items.some(item => item.status === 'waiting' || item.status === 'running')

  while (pending()) {
    if (opts.isStopping()) {
      for (const item of items) if (item.status === 'waiting') item.status = 'cancelled'
      if (active === 0) break
      await delay(tick)
      continue
    }
    if (opts.isPaused()) {
      await delay(tick)
      continue
    }
    let launched = 0
    while (active < opts.concurrency()) {
      const item = nextWaiting()
      if (!item) break
      launch(item)
      launched++
    }
    await delay(launched > 0 ? opts.pauseMs() : tick)
  }

  return {
    done: items.filter(item => item.status === 'done').length,
    failed: items.filter(item => item.status === 'failed').length,
    cancelled: items.filter(item => item.status === 'cancelled').length
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command. Expected: PASS (5/5). If the concurrency test flakes on microtask flushing, increase `flush` iterations — do NOT weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add app/utils/batchPool.ts tests/unit/document_batch_pool.spec.ts
git commit -m "feat(document): add pure async batch scheduling core"
```

---

### Task 3: Single-job helper + abort signal

**Files:**
- Modify: `app/composables/useDocumentRun.ts:19-83`
- Modify: `app/composables/useDocumentApi.ts` (createJob/uploadInputs/startJob/declareInput/completeInput/runInline)
- Test: `tests/unit/document_run_helper.spec.ts`

**Interfaces:**
- Consumes: `useDocumentApi()` shape.
- Produces: `runSingleDocumentJob(api, opts:{ operationId:string, files:File[], config:Record<string,unknown>, directUpload?:boolean, inline?:boolean, idempotencyKey?:string, signal?:AbortSignal, onJobId?:(id:string)=>void }):Promise<{ job:DocumentJobView, artifacts:DocumentArtifactView[] }>`. Throws `DocumentErrorPayload` on failure. `useDocumentRun.run` delegates to it.

- [ ] **Step 1: Write the failing test (source contract + order)**

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('single-job helper', () => {
  const src = read('app/composables/useDocumentRun.ts')

  it('exports a ref-free runSingleDocumentJob helper', () => {
    assert.match(src, /export async function runSingleDocumentJob\(/)
  })

  it('threads an abort signal and idempotency key through the helper', () => {
    assert.match(src, /signal\?: AbortSignal/)
    assert.match(src, /idempotencyKey\?: string/)
  })

  it('keeps create → upload → start order', () => {
    const body = src.slice(src.indexOf('export async function runSingleDocumentJob'))
    assert.ok(body.indexOf('createJob') < body.indexOf('startJob'))
  })

  it('useDocumentRun.run delegates to the helper', () => {
    assert.match(src, /runSingleDocumentJob\(api,/)
  })
})

describe('api abort support', () => {
  const api = read('app/composables/useDocumentApi.ts')
  it('accepts an optional signal on startJob', () => {
    assert.match(api, /startJob: \(jobId: string, signal\?: AbortSignal\)/)
  })
})
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_run_helper.spec.ts`
Expected: FAIL — helper not exported.

- [ ] **Step 3: Extract the helper**

Move the body of `useDocumentRun.run` (inline/local/cloud branches) into exported `runSingleDocumentJob(api, opts)` returning `{ job, artifacts }` and throwing the caught payload. Generate `idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID()`. Call `opts.onJobId?.(draft.id)` after createJob. Pass `opts.signal` to api calls. `useDocumentRun.run` becomes: set running/uploading refs, `try { const { job, artifacts } = await runSingleDocumentJob(api, {...}); job.value=job; artifacts.value=artifacts; return true } catch { error.value=...; return false } finally { running=false }`.

- [ ] **Step 4: Add signal to api methods**

Add optional `signal?: AbortSignal` param to `createJob`, `uploadInputs`, `startJob`, `declareInput`, `completeInput`, `runInline`; pass `{ signal }` into the underlying `$fetch`/`post` options. Extend `post`/`get` helpers to accept and forward `signal`.

- [ ] **Step 5: Run to verify PASS**

Run: same command. Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add app/composables/useDocumentRun.ts app/composables/useDocumentApi.ts tests/unit/document_run_helper.spec.ts
git commit -m "refactor(document): extract single-job helper with abort signal support"
```

---

### Task 4: Reactive batch composable + funnel branch

**Files:**
- Create: `app/composables/useDocumentBatch.ts`
- Modify: `app/composables/useDocumentFiles.ts:18` (maxFiles cap)
- Modify: `app/composables/useDocumentOperationPage.ts:40,51-73`
- Test: `tests/unit/document_batch_composable.spec.ts` (source contract)

**Interfaces:**
- Consumes: `runBatchPool` (Task 2), `runSingleDocumentJob` (Task 3), `useDocumentApi`.
- Produces: `useDocumentBatch(operationId)` returning `{ items, concurrency, pauseMs, maxRetry, status, total, done, failed, running, waiting, overallProgress, artifacts, start, pause, resume, stop, retryItem, clear, setConcurrency, setPauseMs, concurrencyCap }`. `BatchItem { id,name,size,status,jobId?,progress,artifacts,error?,retry }`. Module-global state per operationId; `File` blobs in a non-reactive Map.

- [ ] **Step 1: Write the failing source-contract test**

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('batch composable', () => {
  const src = read('app/composables/useDocumentBatch.ts')
  it('wraps the pure scheduling core', () => { assert.match(src, /runBatchPool/) })
  it('keeps File blobs outside reactive state', () => { assert.match(src, /new Map<string, File>/) })
  it('exposes pause/resume/stop and retry', () => {
    for (const fn of ['function pause', 'function resume', 'async function stop', 'retryItem']) assert.match(src, new RegExp(fn))
  })
  it('polls job progress and clears the timer', () => {
    assert.match(src, /api\.job\(/)
    assert.match(src, /clearInterval/)
  })
  it('finalizes to partial when any item failed', () => { assert.match(src, /'partial'/) })
})

describe('funnel branch', () => {
  const page = read('app/composables/useDocumentOperationPage.ts')
  it('derives per-file batch from definition.batch', () => { assert.match(page, /batch\?\.mode === 'per-file'/) })
  it('routes per-file runs through the batch composable', () => { assert.match(page, /batch\.start\(/) })
  const files = read('app/composables/useDocumentFiles.ts')
  it('uses the batch selection cap when present', () => { assert.match(files, /batch\?\.maxFiles/) })
})
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_batch_composable.spec.ts`
Expected: FAIL — composable missing.

- [ ] **Step 3: Implement `useDocumentBatch`**

Module-global `Map<operationId, state>`. State: `items = ref<BatchItem[]>([])`, `concurrency = ref(1)`, `pauseMs = ref(300)`, `maxRetry = ref(0)`, `status = ref<BatchStatus>('idle')`, blob Map, poll timer handle, AbortControllers per item. `start(files, config, {directUpload, inline})`: build items (waiting), store blobs + idempotency keys, status='running', `void runBatchPool(reactiveItems, { concurrency:()=>concurrency.value, pauseMs:()=>pauseMs.value, maxRetry:()=>maxRetry.value, isPaused:()=>status.value==='paused', isStopping:()=>status.value==='stopping', run: item => runItem(item, config, opts) }).then(finalize)`. `runItem`: set jobId via onJobId, call `runSingleDocumentJob(api,{operationId, files:[blob], config, directUpload, inline, idempotencyKey, signal, onJobId})`, on success set artifacts+progress=100, on throw set error (core handles status/retry). Start a 1s poll interval over running items with jobId → `api.job` → progress percent; clear when none running. `pause`: status='paused'. `resume`: status='running'. `stop`: status='stopping', abort running controllers + best-effort `api.cancelJob(jobId)`, core drains. `finalize`: status = failed>0?'partial':'done', clear timer. `retryItem(id)`: reset item to waiting, retry preserved, re-run pool if idle. Computed totals + `overallProgress = round(done/total*100)` + flattened artifacts. `concurrencyCap` from definition (passed in or read via api.operations cached).

- [ ] **Step 4: Selection cap + funnel branch**

`useDocumentFiles`: `maxFiles = computed(() => spec.value?.batch?.maxFiles ?? spec.value?.input.maxFiles ?? 1)`.
`useDocumentOperationPage`: add `isPerFileBatch = computed(() => definition.value?.batch?.mode === 'per-file')`; `multiple = computed(() => definition.value?.input.mode !== 'single-file' || isPerFileBatch.value)`; instantiate `batch = useDocumentBatch(operationId)`; in `run`, if `isPerFileBatch.value` → `batch.start(selection.uploadPayload(), executionConfig, {directUpload, inline}); selection.clear(); return true`. Expose `batch`, `isPerFileBatch`.

- [ ] **Step 5: Run to verify PASS**

Run: same command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useDocumentBatch.ts app/composables/useDocumentFiles.ts app/composables/useDocumentOperationPage.ts tests/unit/document_batch_composable.spec.ts
git commit -m "feat(document): add reactive batch composable and per-file run funnel"
```

---

### Task 5: i18n keys (en + vi)

**Files:**
- Modify: `i18n/locales/en.json` (document block, after `actions` ~L3220)
- Modify: `i18n/locales/vi.json` (matching document block)
- Test: `tests/unit/document_batch_ui.spec.ts` (i18n section; created here, extended in Tasks 6–7)

**Interfaces:**
- Produces: `document.batch.{title,concurrency,concurrencyHint,pauseBetween,maxRetry,start,pause,resume,stop,retry,overall,empty,extractLocked,status.{waiting,running,done,failed,cancelled,retrying}}`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (loc: string) => JSON.parse(readFileSync(join(root, `i18n/locales/${loc}.json`), 'utf8'))

const KEYS = ['title', 'concurrency', 'concurrencyHint', 'pauseBetween', 'maxRetry', 'start', 'pause', 'resume', 'stop', 'retry', 'overall', 'empty', 'extractLocked']
const STATUS = ['waiting', 'running', 'done', 'failed', 'cancelled', 'retrying']

describe('batch i18n', () => {
  for (const loc of ['en', 'vi']) {
    it(`has every batch key in ${loc}`, () => {
      const batch = load(loc).document.batch
      assert.ok(batch, `${loc} document.batch missing`)
      for (const k of KEYS) assert.equal(typeof batch[k], 'string', `${loc} batch.${k}`)
      for (const s of STATUS) assert.equal(typeof batch.status?.[s], 'string', `${loc} batch.status.${s}`)
    })
  }
})
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_batch_ui.spec.ts`
Expected: FAIL — `document.batch` missing.

- [ ] **Step 3: Add keys to en.json**

```json
"batch": {
  "title": "Batch processing",
  "concurrency": "Parallel files",
  "concurrencyHint": "How many files run at once (1–{max}).",
  "pauseBetween": "Pause between files (ms)",
  "maxRetry": "Retries per file",
  "start": "Start batch",
  "pause": "Pause",
  "resume": "Resume",
  "stop": "Stop",
  "retry": "Retry",
  "overall": "{done}/{total} files",
  "empty": "No files in the batch yet.",
  "extractLocked": "AI extraction runs one file at a time.",
  "status": { "waiting": "Waiting", "running": "Running", "done": "Done", "failed": "Failed", "cancelled": "Cancelled", "retrying": "Retrying" }
}
```

- [ ] **Step 4: Add matching keys to vi.json**

```json
"batch": {
  "title": "Xử lý hàng loạt",
  "concurrency": "Số file song song",
  "concurrencyHint": "Số file chạy cùng lúc (1–{max}).",
  "pauseBetween": "Nghỉ giữa các file (ms)",
  "maxRetry": "Số lần thử lại mỗi file",
  "start": "Bắt đầu batch",
  "pause": "Tạm dừng",
  "resume": "Tiếp tục",
  "stop": "Dừng",
  "retry": "Thử lại",
  "overall": "{done}/{total} file",
  "empty": "Chưa có file trong batch.",
  "extractLocked": "AI extraction chạy từng file một.",
  "status": { "waiting": "Chờ", "running": "Đang chạy", "done": "Xong", "failed": "Lỗi", "cancelled": "Đã hủy", "retrying": "Thử lại" }
}
```

- [ ] **Step 5: Run to verify PASS**

Run: same command. Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add i18n/locales/en.json i18n/locales/vi.json tests/unit/document_batch_ui.spec.ts
git commit -m "feat(document): add batch i18n keys in en and vi"
```

---

### Task 6: BatchPanel component

**Files:**
- Create: `app/components/document-studio/BatchPanel.vue`
- Test: `tests/unit/document_batch_ui.spec.ts` (extend)

**Interfaces:**
- Consumes: batch view-model props.
- Produces: `<DocumentStudioBatchPanel>` with props `{ items, concurrency, pauseMs, maxRetry, status, concurrencyCap, disabled }`, emits `{ 'update:concurrency', 'update:pauseMs', 'update:maxRetry', retry:[id] }`.

- [ ] **Step 1: Extend the failing test**

Append to `document_batch_ui.spec.ts`:

```ts
describe('BatchPanel component', () => {
  const src = read('app/components/document-studio/BatchPanel.vue')
  it('caps concurrency at the operation limit', () => { assert.match(src, /concurrencyCap/) })
  it('locks concurrency to 1 for AI-extract with a hint', () => { assert.match(src, /extractLocked/) })
  it('shows a per-item status badge and progress', () => {
    assert.match(src, /UBadge/)
    assert.match(src, /UProgress/)
  })
  it('offers retry on failed items', () => { assert.match(src, /emit\('retry'/) })
  it('caps the item scroll height', () => { assert.match(src, /max-h-64/) })
  it('uses only token-based motion (no stray animate-*)', () => {
    const stray = [...src.matchAll(/animate-(?!pulse)/g)]
    assert.equal(stray.length, 0)
  })
})
```

(Add `const read = ...` reuse from Task 5 file header.)

- [ ] **Step 2: Run to verify FAIL** — component missing.

- [ ] **Step 3: Implement BatchPanel.vue**

`<script setup lang="ts">` with the props/emits above, `useI18n()`. Concurrency `UInput type="number" min=1 :max=concurrencyCap class="w-full"` (disabled when cap===1, hint `extractLocked`); pause + maxRetry `UInput type="number" class="w-full"`. Item list `ul.max-h-64.overflow-auto` rows: lucide status icon (`i-lucide-clock/loader-circle/check-circle-2/x-circle/ban/rotate-cw`), truncated name, `UBadge variant="subtle"` with `t('document.batch.status.'+item.status)`, `UProgress :model-value=item.progress size="xs"`, retry `UButton` ghost icon on failed. Empty state `t('document.batch.empty')`. Transitions via `transition-all duration-150 ease-out`; running icon `animate-pulse` only. Scrollbar from palette tokens.

- [ ] **Step 4: Run to verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add app/components/document-studio/BatchPanel.vue tests/unit/document_batch_ui.spec.ts
git commit -m "feat(document): add batch panel with concurrency, pause and per-file progress"
```

---

### Task 7: Shell dual-mode + page wiring

**Files:**
- Modify: `app/components/document-studio/OperationPageShell.vue` (props/emits, action bar L576-602, advanced slot L573)
- Modify: `app/pages/document-studio/tools/[slug].vue`
- Test: `tests/unit/document_batch_ui.spec.ts` (extend)

**Interfaces:**
- Consumes: `DocumentStudioBatchPanel`, page `batch` state.
- Produces: shell optional `batch` prop (view-model) + emits `batch-start/batch-pause/batch-resume/batch-stop/batch-retry/update:concurrency/update:pauseMs/update:maxRetry`.

- [ ] **Step 1: Extend the failing test**

```ts
describe('shell batch mode', () => {
  const shell = read('app/components/document-studio/OperationPageShell.vue')
  it('mounts the batch panel in the advanced slot', () => { assert.match(shell, /DocumentStudioBatchPanel/) })
  it('replaces the fake progress with real batch progress', () => {
    assert.match(shell, /batch\.overallProgress|batchOverallProgress/)
    assert.doesNotMatch(shell, /uploading \? 15 : 60/)
  })
  it('renders start/pause/resume/stop controls', () => {
    for (const e of ['batch-start', 'batch-pause', 'batch-resume', 'batch-stop']) assert.match(shell, new RegExp(e))
  })
  const page = read('app/pages/document-studio/tools/[slug].vue')
  it('wires batch state and actions', () => {
    assert.match(page, /page\.batch/)
    assert.match(page, /@batch-start/)
  })
})
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Shell changes**

Add optional `batch` prop (items/status/concurrency/pauseMs/maxRetry/concurrencyCap/total/done/overallProgress) + the batch emits. In the action bar: when `batch` present, show `UProgress :model-value="batch.overallProgress"` + `{done}/{total}` label and Start/Pause/Resume/Stop buttons (primary soft Start; ghost Pause/Resume; error Stop) driven by `batch.status`; else keep the existing single Run + real session progress. Remove the `uploading ? 15 : 60` fake computed; for single mode use a real session-derived value or indeterminate. Mount `<DocumentStudioBatchPanel>` in `#advanced` when batch present, binding props/emits.

- [ ] **Step 4: Page wiring**

In `[slug].vue`, when `page.isPerFileBatch.value`, pass `:batch="batchViewModel"` (computed from `page.batch`) and wire `@batch-start="page.batch.start(...)"` etc. Keep `handleRun` for combine/single. Pass concurrency/pause/maxRetry updates to `page.batch`.

- [ ] **Step 5: Run to verify PASS.**

- [ ] **Step 6: Commit**

```bash
git add app/components/document-studio/OperationPageShell.vue app/pages/document-studio/tools/[slug].vue tests/unit/document_batch_ui.spec.ts
git commit -m "feat(document): wire batch mode into the operation shell and tool page"
```

---

### Task 8: Gates, real verification, docs

**Files:**
- Modify: `docs/document-studio/V5-IMPLEMENTATION-STATUS.md` (new batch section)

- [ ] **Step 1: Typecheck** — `npx nuxt typecheck > .gate-typecheck.txt 2>&1; echo TC_EXIT=$?`; record `.nuxt/eslint.config.mjs` mtime. Expected exit 0, 0 `error TS`.

- [ ] **Step 2: Lint touched files AFTER regen** — `npx eslint <touched> > .gate-eslint.txt 2>&1; echo LINT_EXIT=$?`. Style-only failures → `--fix` touched files only, re-read diffs, re-lint. If config mtime changed, re-lint.

- [ ] **Step 3: Full unit suite** — `pnpm test`. Expected all specs pass, exit 0.

- [ ] **Step 4: Build** — `pnpm build:electron` (background if >2min). Expected exit 0.

- [ ] **Step 5: Real browser verification** — signed-in local pass on `:4002`: split batch of 3 PDFs at concurrency 2 (observe per-file progress + `{done}/{total}`), a deliberately invalid file → partial; extract batch concurrency locked to 1. Clean all probe data. No fabricated signed-in claim; if no legitimate session, record BLOCKED.

- [ ] **Step 6: Update docs** — add batch section to `V5-IMPLEMENTATION-STATUS.md` (architecture, contract, runtime limits, evidence table with real numbers).

- [ ] **Step 7: Commit**

```bash
git add docs/document-studio/V5-IMPLEMENTATION-STATUS.md
git commit -m "docs(document): record batch processing architecture and verification"
```

---

## Self-Review

**Spec coverage:** §3 contract → Task 1; §4a helper → Task 3; §4b pool → Tasks 2+4; §4c funnel → Task 4; §5 UI → Tasks 6+7; §5c i18n → Task 5; §6 runtime limits → enforced by Task 1 (extract cap) + Task 4 (forced concurrency) + documented Task 8; §7 testing → every task + Task 8; §8 docs → Task 8. No gaps.

**Placeholder scan:** core tasks (1–3) carry full test + implementation code; UI tasks (6–7) carry concrete component contracts + source-regex tests matching repo convention; no TBD/TODO.

**Type consistency:** `runBatchPool`/`PoolItem`/`BatchPoolOptions` (Task 2) consumed unchanged in Task 4; `runSingleDocumentJob` signature (Task 3) consumed in Task 4; `document.batch.*` keys (Task 5) consumed in Tasks 6–7; `batch` prop/emits names consistent Tasks 6–7. Core statuses are waiting/running/done/failed/cancelled; `retrying` is a UI-only label derived from retry>0 (Task 6), not a core status.