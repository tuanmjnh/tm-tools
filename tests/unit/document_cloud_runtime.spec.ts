import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Readable } from 'node:stream'

// Config reads these at import time, so they must be set before any module load.
const dataRoot = mkdtempSync(join(tmpdir(), 'document-cloud-runtime-'))
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'

const {
  operationSupport, supportsOperation, runtimeCapabilities, estimateScratchBytes, exceedsScratchBudget,
  isEphemeralRuntime, storageMode, EPHEMERAL_MAX_BYTES
} = await import('../../server/modules/document/runtime')
const { documentRuntime, requireOperationSupport, requireJobRoutes, resetDocumentRuntime }
  = await import('../../server/modules/document/runtime-context')
const { declareUpload, completeUpload } = await import('../../server/modules/document/uploads')
const { r2ObjectKey } = await import('../../server/modules/document/r2-storage')
const { runArtifactCleanup } = await import('../../server/modules/document/retention')
const { DocumentError, requireOperation } = await import('../../server/modules/document/operations')

const OWNER = 'owner-cloud'
const OTHER = 'owner-other'

before(() => {
  process.env.PDF_DATA_DIR = dataRoot
  resetDocumentRuntime()
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

function jobRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-0000-1111',
    ownerId: OWNER,
    operationId: 'pdf.split' as const,
    operationVersion: '1.0.0',
    status: 'created' as const,
    runtime: 'vercel' as const,
    configSnapshot: {},
    inputCount: 0,
    totalInputBytes: 0,
    outputCount: 0,
    progress: { totalUnits: 0, completedUnits: 0, failedUnits: 0 },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    cleanupStatus: 'pending' as const,
    ...overrides
  }
}

/**
 * Minimal stand-in for the R2 adapter. It records what the upload flow asked
 * for so the test can assert on the contract rather than on AWS internals.
 */
function fakeStorage(options: { objectSize?: number } = {}) {
  const calls: string[] = []
  const stored = new Map<string, { size: number, mimeType: string }>()

  const storage = {
    kind: 's3-compatible' as const,
    calls,
    stored,
    async createUploadTarget(input: { jobId: string, inputId: string, fileName: string, ownerId: string, size: number, mimeType: string }) {
      calls.push(`put:${input.fileName}`)
      const key = r2ObjectKey(input.ownerId, input.jobId, 'input', input.inputId, input.fileName)
      return {
        url: 'https://r2.example/signed',
        method: 'PUT' as const,
        headers: { 'content-type': input.mimeType },
        ref: { provider: 's3-compatible' as const, key, ownerId: input.ownerId, size: input.size, mimeType: input.mimeType },
        expiresAt: new Date(Date.now() + 600_000).toISOString()
      }
    },
    async createMultipartUpload(input: { jobId: string, inputId: string, fileName: string, ownerId: string, size: number }) {
      calls.push(`multipart:${input.fileName}`)
      return {
        uploadId: 'upload-1',
        key: r2ObjectKey(input.ownerId, input.jobId, 'input', input.inputId, input.fileName),
        partSize: 5 * 1024 * 1024,
        partCount: Math.ceil(input.size / (5 * 1024 * 1024))
      }
    },
    async signUploadPart(key: string, uploadId: string, partNumber: number) {
      calls.push(`sign:${partNumber}`)
      return { partNumber, url: `https://r2.example/${uploadId}/${partNumber}`, expiresAt: new Date().toISOString() }
    },
    async completeMultipartUpload(key: string) {
      calls.push('complete-multipart')
      stored.set(key, { size: options.objectSize ?? 0, mimeType: 'application/pdf' })
      return { ref: { provider: 's3-compatible', key, ownerId: OWNER, size: 0, mimeType: 'application/pdf' }, verified: true }
    },
    async abortMultipartUpload() {
      calls.push('abort-multipart')
    },
    async verifyUploadedObject(ref: { key: string, size: number }) {
      const object = stored.get(ref.key)
      if (!object) return { ref, verified: false, reason: 'missing' as const }
      if (object.size !== ref.size) return { ref, verified: false, reason: 'size-mismatch' as const }
      return { ref, verified: true }
    },
    async createReadStream(): Promise<Readable> {
      throw new Error('not used in this spec')
    },
    async putObject() {
      throw new Error('not used in this spec')
    },
    async deleteObject(ref: { key: string }) {
      calls.push(`delete:${ref.key}`)
      stored.delete(ref.key)
    },
    async getMetadata() {
      throw new Error('not used in this spec')
    },
    async headObject() {
      return null
    }
  }
  return storage
}

function fakeJobs() {
  const inputs = new Map<string, unknown>()
  return {
    inputs,
    // Ownership scoping mirrors the Postgres repository: a foreign caller sees
    // no inputs at all, which is what turns the finalize into "not found".
    async listInputs(_jobId: string, ownerId: string) {
      return [...inputs.values()].filter(entry => (entry as { ownerId: string }).ownerId === ownerId) as never
    },
    async addInput(input: { id: string }) {
      inputs.set(input.id, input)
    }
  }
}

describe('per-operation runtime capability', () => {
  it('names the exact reason an operation is unavailable instead of blocking the runtime', () => {
    const rasterize = operationSupport('pdf.rasterize', 'vercel')
    assert.equal(rasterize.enabled, false)
    assert.equal(rasterize.reasonDisabled, 'native-canvas-unavailable')

    // Split stays available on the same runtime; that is the whole point of a
    // per-operation table.
    assert.equal(operationSupport('pdf.split', 'vercel').enabled, true)
    assert.equal(operationSupport('pdf.merge', 'electron').enabled, true)
  })

  it('keeps AI extraction reachable on a worker and blocked in a Function', () => {
    assert.equal(operationSupport('document.ai-extract', 'vercel').enabled, false)
    assert.equal(operationSupport('document.ai-extract', 'worker').enabled, true)
    assert.equal(operationSupport('document.ai-extract', 'local').enabled, true)
  })

  it('lists only supported operations per runtime', () => {
    assert.equal(runtimeCapabilities('vercel').supportedOperations.includes('pdf.rasterize'), false)
    assert.equal(runtimeCapabilities('vercel').supportedOperations.includes('pdf.split'), true)
    assert.equal(supportsOperation('pdf.split', 'vercel'), true)
  })

  it('rejects one operation with a typed error while the rest keep working', () => {
    process.env.DOCUMENT_RUNTIME = 'vercel'
    try {
      assert.throws(
        () => requireOperationSupport('pdf.rasterize'),
        (error: unknown) => {
          assert.ok(error instanceof DocumentError)
          assert.equal(error.code, 'DOCUMENT_RUNTIME_NOT_SUPPORTED')
          assert.equal(error.status, 501)
          assert.equal((error.details as { operationId?: string })?.operationId, 'pdf.rasterize')
          return true
        }
      )
      assert.doesNotThrow(() => requireOperationSupport('pdf.split'))
    } finally {
      process.env.DOCUMENT_RUNTIME = 'local'
    }
  })

  it('estimates scratch before a cloud job starts and routes oversized work to a worker', () => {
    const input = 10 * 1024 * 1024
    assert.ok(estimateScratchBytes('pdf.rasterize', input) > estimateScratchBytes('pdf.split', input))
    assert.equal(exceedsScratchBudget('pdf.split', 10 * 1024 * 1024, 'vercel'), false)
    // 100 MB of input for rasterize needs 800 MB of scratch, above the 350 MB budget.
    assert.equal(exceedsScratchBudget('pdf.rasterize', 100 * 1024 * 1024, 'vercel'), true)
  })
})

describe('cloud adapter selection', () => {
  it('keeps the local runtime on filesystem adapters with no cloud credentials', async () => {
    process.env.DOCUMENT_RUNTIME = 'local'
    resetDocumentRuntime()
    delete process.env.DATABASE_URL
    delete process.env.R2_ACCESS_KEY_ID

    const runtime = await documentRuntime()
    assert.equal(runtime.storage.kind, 'local')
    assert.equal(runtime.delivery.mode, 'folder')
    assert.equal(runtime.capabilities.requiresDownloadDelivery, false)
    resetDocumentRuntime()
  })

  it('serves a cloud runtime with no storage connection from /tmp for one request', async () => {
    process.env.DOCUMENT_RUNTIME = 'vercel'
    delete process.env.DATABASE_URL
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.NUXT_HUB_APP_SECRET
    resetDocumentRuntime()
    try {
      // No bucket means no job may outlive the invocation, so the policy answer
      // is explicit rather than a silent fallback.
      assert.equal(storageMode(), 'ephemeral')
      assert.equal(isEphemeralRuntime(), true)

      const runtime = await documentRuntime()
      assert.equal(runtime.storage.kind, 'local')
      assert.equal(runtime.delivery.mode, 'download')
      assert.equal(runtime.capabilities.ephemeralResults, true)
      assert.equal(runtime.capabilities.supportsDirectUpload, false)
      assert.equal(runtime.capabilities.supportsAsyncJobs, false)
      assert.ok(runtime.capabilities.maxOutputBytes <= EPHEMERAL_MAX_BYTES)

      // A job id written here cannot be read by the next request, so the routes
      // that address one refuse with the supported alternative.
      assert.throws(() => requireJobRoutes(), (error: unknown) => {
        assert.ok(error instanceof DocumentError)
        assert.equal(error.code, 'DOCUMENT_RUNTIME_NOT_SUPPORTED')
        assert.equal((error.details as { reason?: string })?.reason, 'use-single-request-run')
        return true
      })
    } finally {
      process.env.DOCUMENT_RUNTIME = 'local'
      resetDocumentRuntime()
    }
  })
})

describe('cloud upload intent and finalize', () => {
  it('declares a small input as a single signed PUT, not a Function upload', async () => {
    const storage = fakeStorage()
    const declared = await declareUpload({
      job: jobRecord() as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      fileName: 'catalogue.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    })

    assert.equal(declared.plan.mode, 'browser-put')
    assert.match(declared.plan.url ?? '', /^https:\/\//)
    assert.equal(declared.input.status, 'pending')
    assert.equal(declared.input.storageProvider, 's3-compatible')
    // The key carries a hashed owner segment, never the raw user id.
    assert.equal(declared.input.storageKey.includes(OWNER), false)
    assert.ok(declared.input.storageKey.includes(declared.input.id))
  })

  it('plans a multipart upload above the size threshold', async () => {
    const storage = fakeStorage()
    const declared = await declareUpload({
      job: jobRecord() as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      fileName: 'scans.pdf',
      size: 30 * 1024 * 1024,
      mimeType: 'application/pdf',
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    })

    assert.equal(declared.plan.mode, 'multipart')
    assert.ok(declared.plan.multipart)
    assert.equal(declared.plan.multipart?.partCount, 6)
    assert.equal(declared.plan.multipart?.parts.length, 6)
    assert.ok(storage.calls.includes('sign:1'))
  })

  it('falls back to one signed PUT when the provider has no multipart', async () => {
    const storage = fakeStorage()
    delete (storage as Record<string, unknown>).createMultipartUpload
    delete (storage as Record<string, unknown>).signUploadPart

    const declared = await declareUpload({
      job: jobRecord() as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      fileName: 'scans.pdf',
      size: 30 * 1024 * 1024,
      mimeType: 'application/pdf',
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    })

    assert.equal(declared.plan.mode, 'browser-put')
    assert.equal(declared.plan.multipart, undefined)
    assert.ok(storage.calls.some(call => call.startsWith('put:')))
  })

  it('refuses an unsupported type and an oversized file before signing anything', async () => {
    const storage = fakeStorage()
    const base = {
      job: jobRecord() as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    }

    await assert.rejects(
      declareUpload({ ...base, fileName: 'notes.docx', size: 100 }),
      /DOCUMENT_INPUT_TYPE_NOT_SUPPORTED/
    )
    await assert.rejects(
      declareUpload({ ...base, fileName: 'huge.pdf', size: 101 * 1024 * 1024 }),
      /DOCUMENT_INPUT_TOO_LARGE/
    )
    assert.deepEqual(storage.calls, [])
  })

  it('flips an input to verified only after the stored size matches', async () => {
    const storage = fakeStorage({ objectSize: 2048 })
    const jobs = fakeJobs()
    const job = jobRecord()

    const declared = await declareUpload({
      job: job as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      fileName: 'catalogue.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    })
    storage.stored.set(declared.input.storageKey, { size: 2048, mimeType: 'application/pdf' })
    await jobs.addInput(declared.input)

    const completed = await completeUpload({
      jobs: jobs as never,
      storage: storage as never,
      job: job as never,
      inputId: declared.input.id,
      ownerId: OWNER
    })
    assert.equal(completed.status, 'verified')
  })

  it('rejects a finalize whose stored object never arrived', async () => {
    const storage = fakeStorage()
    const jobs = fakeJobs()
    const job = jobRecord()

    const declared = await declareUpload({
      job: job as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      fileName: 'missing.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    })
    await jobs.addInput(declared.input)

    await assert.rejects(
      completeUpload({
        jobs: jobs as never,
        storage: storage as never,
        job: job as never,
        inputId: declared.input.id,
        ownerId: OWNER
      }),
      /DOCUMENT_UPLOAD_INCOMPLETE/
    )
  })

  it('does not let another owner finalize the input', async () => {
    const storage = fakeStorage()
    const jobs = fakeJobs()
    const job = jobRecord()
    const declared = await declareUpload({
      job: job as never,
      operation: requireOperation('pdf.split'),
      existingCount: 0,
      fileName: 'private.pdf',
      size: 512,
      mimeType: 'application/pdf',
      maxFileBytes: 100 * 1024 * 1024,
      storage: storage as never
    })
    await jobs.addInput(declared.input)

    await assert.rejects(
      completeUpload({
        jobs: jobs as never,
        storage: storage as never,
        job: job as never,
        inputId: declared.input.id,
        ownerId: OTHER
      }),
      /DOCUMENT_JOB_NOT_FOUND/
    )
  })
})

describe('retention cleanup', () => {
  function artifact(overrides: Record<string, unknown> = {}) {
    return {
      id: 'artifact-1',
      jobId: 'job-1',
      ownerId: OWNER,
      fileName: 'page_0001.pdf',
      mimeType: 'application/pdf',
      size: 100,
      storageProvider: 's3-compatible',
      storageKey: 'document/abc/job-1/output/page_0001.pdf',
      status: 'ready',
      downloadCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      ...overrides
    }
  }

  function repository(artifacts: unknown[]) {
    const state = { artifacts, expired: false }
    return {
      state,
      async findExpired() {
        return [{ jobId: 'job-1', ownerId: OWNER, expiresAt: new Date(Date.now() - 1000).toISOString() }]
      },
      async listArtifacts() {
        return artifacts as never
      },
      async listInputs() {
        return [] as never
      },
      async updateArtifact(updated: { id: string }) {
        const index = artifacts.findIndex(entry => (entry as { id: string }).id === updated.id)
        if (index >= 0) artifacts[index] = updated
      },
      async markExpired() {
        state.expired = true
      }
    }
  }

  it('deletes the exact stored key and marks the artifact deleted', async () => {
    const storage = fakeStorage()
    storage.calls.length = 0
    const items = [artifact()]
    const jobs = repository(items)

    const summary = await runArtifactCleanup({ jobs: jobs as never, storage: storage as never })

    assert.equal(summary.objectsDeleted, 1)
    assert.equal(summary.failures, 0)
    assert.deepEqual(storage.calls, ['delete:document/abc/job-1/output/page_0001.pdf'])
    assert.equal((items[0] as { status: string }).status, 'deleted')
    assert.equal(jobs.state.expired, true)
  })

  it('leaves a live artifact alone', async () => {
    const storage = fakeStorage()
    storage.calls.length = 0
    const items = [artifact({ expiresAt: new Date(Date.now() + 60_000).toISOString() })]
    const jobs = repository(items)

    const summary = await runArtifactCleanup({ jobs: jobs as never, storage: storage as never })

    assert.equal(summary.objectsDeleted, 0)
    assert.deepEqual(storage.calls, [])
    assert.equal((items[0] as { status: string }).status, 'ready')
  })

  it('does not mark a job expired when a delete failed, so the next pass retries', async () => {
    const storage = fakeStorage()
    storage.deleteObject = async () => {
      throw new Error('r2 down')
    }
    const jobs = repository([artifact()])

    const summary = await runArtifactCleanup({ jobs: jobs as never, storage: storage as never })

    assert.equal(summary.failures, 1)
    assert.equal(summary.objectsDeleted, 0)
    assert.equal(jobs.state.expired, false)
  })
})
