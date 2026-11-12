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
