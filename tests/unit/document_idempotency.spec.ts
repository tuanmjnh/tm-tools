import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Config resolves the data root at import time, so the temp path goes first.
const dataRoot = mkdtempSync(join(tmpdir(), 'document-idempotency-'))
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'

const { documentRuntime } = await import('../../server/modules/document/runtime-context')
const { createDraftJob, toView } = await import('../../server/modules/document/runner')

before(() => {
  process.env.PDF_DATA_DIR = dataRoot
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

async function draft(ownerId: string, idempotencyKey?: string) {
  const runtime = await documentRuntime()
  return createDraftJob(
    { jobs: runtime.jobs, temp: runtime.temp, storage: runtime.storage, delivery: runtime.delivery },
    { ownerId, operationId: 'pdf.split', runtime: 'local', config: {}, retentionDays: 7, idempotencyKey }
  )
}

describe('create-job idempotency (guide §5.2)', () => {
  it('returns the first job when the same owner retries with the same key', async () => {
    const first = await draft('owner-a', 'retry-token-0001')
    const second = await draft('owner-a', 'retry-token-0001')

    assert.equal(second.id, first.id)
    assert.equal(second.createdAt, first.createdAt)
  })

  it('creates a new job for a different key', async () => {
    const first = await draft('owner-a', 'retry-token-0002')
    const second = await draft('owner-a', 'retry-token-0003')

    assert.notEqual(second.id, first.id)
  })

  it('never reuses a key across owners', async () => {
    const mine = await draft('owner-a', 'shared-token-0001')
    const theirs = await draft('owner-b', 'shared-token-0001')

    assert.notEqual(theirs.id, mine.id)
    assert.equal(theirs.ownerId, 'owner-b')
  })

  it('creates independent jobs when no key is supplied', async () => {
    const first = await draft('owner-a')
    const second = await draft('owner-a')

    assert.notEqual(second.id, first.id)
  })

  it('keeps the retry token out of the client view', async () => {
    const job = await draft('owner-a', 'retry-token-0004')
    const view = toView(job, []) as Record<string, unknown>

    assert.equal('idempotencyKey' in view, false)
    assert.equal('configSnapshot' in view, false)
  })
})
