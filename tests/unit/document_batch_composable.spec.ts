import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('batch composable', () => {
  const src = read('app/composables/useDocumentBatch.ts')
  it('wraps the pure scheduling core', () => {
    assert.match(src, /runBatchPool/)
  })
  it('keeps File blobs outside reactive state', () => {
    assert.match(src, /new Map<string, File>/)
  })
  it('exposes pause/resume/stop and retry', () => {
    for (const fn of ['function pause', 'function resume', 'async function stop', 'retryItem']) assert.match(src, new RegExp(fn))
  })
  it('delegates progress polling to the shared single-job runner', () => {
    // The batch pool no longer owns a timer: one poll per job lives in
    // runSingleDocumentJob, so two intervals never read the same record.
    assert.doesNotMatch(src, /setInterval/)
    assert.match(src, /onProgress/)
  })
  it('finalizes to partial when any item failed', () => {
    assert.match(src, /'partial'/)
  })
  it('exposes clear to reset batch queue and state', () => {
    assert.match(src, /function clear/)
  })
  it('counts in-flight item progress in the overall bar', () => {
    // A whole-file counter would pin the bar at 0% while a single large file
    // (ai-extract is maxConcurrency 1) is being processed.
    assert.match(src, /item\.progress \/ 100/)
  })
})

describe('single job runner', () => {
  const run = read('app/composables/useDocumentRun.ts')
  it('polls the draft while start stays open', () => {
    assert.match(run, /api\.job\(/)
    assert.match(run, /setInterval/)
    assert.match(run, /clearInterval/)
  })
  it('reports the finished job progress to the caller', () => {
    assert.match(run, /opts\.onProgress\?\.\(finished\.progress\)/)
  })
})

describe('funnel branch', () => {
  const page = read('app/composables/useDocumentOperationPage.ts')
  it('derives per-file batch from definition.batch', () => {
    assert.match(page, /batch\?\.mode === 'per-file'/)
  })
  it('routes per-file runs through the batch composable', () => {
    assert.match(page, /batch\.start\(/)
  })
  it('fetches the operation catalogue once per mount', () => {
    // loadDefinition shares its /operations response with the runtime probe;
    // calling runtime.load() alongside it issued the same request twice.
    assert.match(page, /runtime\.load\(catalog\)/)
    assert.doesNotMatch(page, /Promise\.all\(\[loadDefinition\(\), runtime\.load\(\)\]\)/)
  })
  const files = read('app/composables/useDocumentFiles.ts')
  it('uses the batch selection cap when present', () => {
    assert.match(files, /batch\?\.maxFiles/)
  })
})
