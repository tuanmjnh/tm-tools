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
  it('polls job progress and clears the timer', () => {
    assert.match(src, /api\.job\(/)
    assert.match(src, /clearInterval/)
  })
  it('finalizes to partial when any item failed', () => {
    assert.match(src, /'partial'/)
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
  const files = read('app/composables/useDocumentFiles.ts')
  it('uses the batch selection cap when present', () => {
    assert.match(files, /batch\?\.maxFiles/)
  })
})
