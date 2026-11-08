import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Config reads PDF_DATA_DIR at import time, so the temp root must exist first.
const dataRoot = mkdtempSync(join(tmpdir(), 'document-contracts-'))
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'

const { DOCUMENT_OPERATIONS, documentOperation, requireOperation, DocumentError } = await import('../../server/modules/document/operations')
const { runtimeCapabilities, detectRuntime, supportsOperation, EPHEMERAL_MAX_BYTES }
  = await import('../../server/modules/document/runtime')
const { documentDirs, jobRoot } = await import('../../server/modules/document/paths')
const { localTemporaryWorkspace, cleanupJobWorkspace } = await import('../../server/modules/document/temporary')
const { localJobRepository } = await import('../../server/modules/document/jobs')
const { localStorageProvider } = await import('../../server/modules/document/storage')
const { DOCUMENT_JOB_TRANSITIONS } = await import('../../shared/types/document')

const OWNER = 'user-1'
const OTHER = 'user-2'

function expiresIn(days = 7): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

async function newJob(operationId = 'pdf.split') {
  const operation = requireOperation(operationId)
  return localJobRepository.createJob({
    ownerId: OWNER,
    operationId: operation.id,
    operationVersion: operation.version,
    runtime: 'local',
    configSnapshot: {},
    expiresAt: expiresIn()
  })
}

before(() => {
  process.env.PDF_DATA_DIR = dataRoot
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('operation registry', () => {
  it('declares every id once with a unique version', () => {
    const ids = DOCUMENT_OPERATIONS.map(entry => entry.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const operation of DOCUMENT_OPERATIONS) {
      assert.match(operation.version, /^\d+\.\d+\.\d+$/, `${operation.id} needs a semantic version`)
    }
  })

  it('never promises an unproven input count', () => {
    const merge = documentOperation('pdf.merge')
    assert.ok(merge)
    // The v3 engine merges one split folder, not an arbitrary file set.
    assert.equal(merge.input.mode, 'multi-file')
    assert.ok(merge.input.minFiles >= 2)
    assert.equal(merge.input.ordered, true)
  })

  it('keeps AI extraction as the only async operation', () => {
    const async = DOCUMENT_OPERATIONS.filter(entry => entry.execution.mode !== 'inline')
    assert.deepEqual(async.map(entry => entry.id), ['document.ai-extract'])
    assert.equal(async[0]?.execution.supportsCancel, true)
  })

  it('rejects an unknown operation with a typed error', () => {
    assert.throws(() => requireOperation('pdf.compress'), (error: unknown) => {
      assert.ok(error instanceof DocumentError)
      assert.equal(error.code, 'DOCUMENT_OPERATION_NOT_SUPPORTED')
      assert.equal(error.status, 404)
      return true
    })
  })

  it('maps every declared error code to a client status', () => {
    for (const code of ['DOCUMENT_TEMP_CAPACITY_EXCEEDED', 'DOCUMENT_JOB_NOT_OWNED', 'DOCUMENT_OUTPUT_EXPIRED'] as const) {
      const error = new DocumentError(code)
      assert.ok(error.status >= 400 && error.status < 600, `${code} needs a real HTTP status`)
    }
  })
})

describe('runtime capabilities', () => {
  it('detects the override before any platform signal', () => {
    process.env.DOCUMENT_RUNTIME = 'electron'
    assert.equal(detectRuntime(), 'electron')
    process.env.DOCUMENT_RUNTIME = 'local'
    assert.equal(detectRuntime(), 'local')
  })

  it('refuses operations that need a native raster canvas on the cloud runtime', () => {
    assert.equal(supportsOperation('pdf.rasterize', 'vercel'), false)
    assert.equal(supportsOperation('document.ai-extract', 'vercel'), false)
    assert.equal(supportsOperation('pdf.split', 'vercel'), true)
    assert.equal(supportsOperation('pdf.rasterize', 'local'), true)
  })

  it('reports a download delivery requirement only outside the local filesystem', () => {
    assert.equal(runtimeCapabilities('local').requiresDownloadDelivery, false)
    assert.equal(runtimeCapabilities('local').supportsLocalOutputFolder, true)
    assert.equal(runtimeCapabilities('electron').requiresDownloadDelivery, false)
    assert.equal(runtimeCapabilities('vercel').requiresDownloadDelivery, true)
  })

  it('caps a bucket-less cloud deployment to one inline request payload', () => {
    const capabilities = runtimeCapabilities('vercel')
    assert.equal(capabilities.ephemeralResults, true)
    assert.equal(capabilities.maxFileBytes, EPHEMERAL_MAX_BYTES)
    assert.equal(capabilities.maxOutputBytes, EPHEMERAL_MAX_BYTES)
    assert.equal(capabilities.supportsDirectUpload, false)
    assert.equal(capabilities.supportsAsyncJobs, false)
  })
})

describe('job state machine', () => {
  it('rejects a transition the graph does not allow', async () => {
    const job = await newJob()
    await localJobRepository.updateStatus(job.id, { to: 'queued' })
    await assert.rejects(
      localJobRepository.updateStatus(job.id, { to: 'completed' }),
      /DOCUMENT_JOB_STATE_INVALID/
    )
  })

  it('records start and finish timestamps on real transitions', async () => {
    const job = await newJob()
    await localJobRepository.updateStatus(job.id, { to: 'queued' })
    await localJobRepository.updateStatus(job.id, { to: 'running' })
    await localJobRepository.updateStatus(job.id, { to: 'publishing' })
    await localJobRepository.updateStatus(job.id, { to: 'completed' })

    const stored = await localJobRepository.getJob(job.id, OWNER)
    assert.equal(stored?.status, 'completed')
    assert.ok(stored?.startedAt)
    assert.ok(stored?.finishedAt)
  })

  it('keeps a manifest on disk so state survives a restart', async () => {
    const job = await newJob()
    await localJobRepository.updateStatus(job.id, { to: 'queued' })

    const manifest = join(jobRoot(job.id), 'manifest.json')
    assert.equal(existsSync(manifest), true)
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { job: { id: string, status: string } }
    assert.equal(parsed.job.id, job.id)
    assert.equal(parsed.job.status, 'queued')
  })

  it('marks every terminal state in the graph so the janitor can find it', () => {
    for (const [from, targets] of Object.entries(DOCUMENT_JOB_TRANSITIONS)) {
      assert.ok(Array.isArray(targets), `${from} must declare its transitions`)
    }
    assert.deepEqual(DOCUMENT_JOB_TRANSITIONS.completed, ['expired'])
    assert.deepEqual(DOCUMENT_JOB_TRANSITIONS.expired, [])
  })
})

describe('job ownership', () => {
  it('hides a job from another user', async () => {
    const job = await newJob()
    assert.equal(await localJobRepository.getJob(job.id, OTHER), null)
    assert.deepEqual(await localJobRepository.listJobs({ ownerId: OTHER }), [])
  })

  it('refuses to read artifacts of a job it does not own', async () => {
    const job = await newJob()
    await localJobRepository.addArtifact({
      id: 'artifact-1',
      jobId: job.id,
      ownerId: OWNER,
      fileName: 'page_0001.pdf',
      mimeType: 'application/pdf',
      size: 10,
      storageProvider: 'local',
      storageKey: `job/${job.id}/output/page_0001.pdf`,
      status: 'ready',
      downloadCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: expiresIn()
    })

    assert.equal((await localJobRepository.listArtifacts(job.id, OWNER)).length, 1)
    assert.deepEqual(await localJobRepository.listArtifacts(job.id, OTHER), [])
  })

  it('lists only the requested owner and operation', async () => {
    const split = await newJob('pdf.split')
    const raster = await newJob('pdf.rasterize')
    const all = await localJobRepository.listJobs({ ownerId: OWNER, operationId: 'pdf.split' })
    const ids = all.map(job => job.id)

    assert.ok(ids.includes(split.id))
    assert.equal(ids.includes(raster.id), false)
  })
})

describe('temp workspace', () => {
  it('creates the three job directories and the manifest is reachable', async () => {
    const job = await newJob()
    const workspace = await localTemporaryWorkspace.create(job.id)

    for (const dir of [workspace.inputDir, workspace.workingDir, workspace.outputDir]) {
      assert.equal(existsSync(dir), true, `${dir} must exist`)
    }
    assert.ok(workspace.root.startsWith(documentDirs.jobs))
  })

  it('refuses a job id that is not a plain identifier', async () => {
    await assert.rejects(localTemporaryWorkspace.create('../../escape'), /DOCUMENT_JOB_NOT_FOUND/)
    await assert.rejects(localTemporaryWorkspace.create(''), /DOCUMENT_JOB_NOT_FOUND/)
  })

  it('enforces the temp budget before staging', async () => {
    const job = await newJob()
    await localTemporaryWorkspace.create(job.id)
    await assert.rejects(
      localTemporaryWorkspace.ensureCapacity(job.id, runtimeCapabilities('local').maxTempBytes + 1),
      /DOCUMENT_TEMP_CAPACITY_EXCEEDED/
    )
  })

  it('cleans up only the job directory it was asked about', async () => {
    const job = await newJob()
    const other = await newJob()
    const workspace = await localTemporaryWorkspace.create(job.id)
    await localTemporaryWorkspace.create(other.id)
    writeFileSync(join(workspace.outputDir, 'page_0001.pdf'), 'pdf')

    const report = cleanupJobWorkspace(job.id)
    // The manifest and the staged output both count as removed entries.
    assert.ok(report.removedEntries >= 1)
    assert.ok(report.removedBytes >= 3)
    assert.equal(existsSync(workspace.root), false)
    assert.equal(existsSync(jobRoot(other.id)), true)
  })

  it('reports orphan jobs older than the cutoff only', async () => {
    const job = await newJob()
    await localTemporaryWorkspace.create(job.id)

    const future = new Date(Date.now() + 60_000)
    const orphans = await localTemporaryWorkspace.listOrphans(future)
    assert.ok(orphans.includes(job.id))

    const past = new Date(Date.now() - 60_000)
    assert.equal((await localTemporaryWorkspace.listOrphans(past)).includes(job.id), false)
  })
})

describe('local storage provider', () => {
  it('writes an object inside the job output dir and reads it back', async () => {
    const job = await newJob()
    await localTemporaryWorkspace.create(job.id)
    const key = `job/${job.id}/output/page_0001.pdf`

    const ref = await localStorageProvider.putObject({
      ownerId: OWNER,
      key,
      data: Buffer.from('%PDF-1.7'),
      mimeType: 'application/pdf'
    })
    assert.equal(ref.size, 8)

    const metadata = await localStorageProvider.getMetadata(ref)
    assert.ok(metadata.localPath?.endsWith('page_0001.pdf'))
    const verified = await localStorageProvider.verifyUploadedObject(ref)
    assert.equal(verified.verified, true)

    await localStorageProvider.deleteObject(ref)
    const missing = await localStorageProvider.verifyUploadedObject(ref)
    assert.equal(missing.verified, false)
    assert.equal(missing.reason, 'missing')
  })

  it('flags a size mismatch instead of trusting the client claim', async () => {
    const job = await newJob()
    await localTemporaryWorkspace.create(job.id)
    const key = `job/${job.id}/input/input-1/file.pdf`
    await localStorageProvider.putObject({ ownerId: OWNER, key, data: Buffer.from('1234'), mimeType: 'application/pdf' })

    const verified = await localStorageProvider.verifyUploadedObject({
      provider: 'local',
      key,
      ownerId: OWNER,
      size: 999,
      mimeType: 'application/pdf'
    })
    assert.equal(verified.verified, false)
    assert.equal(verified.reason, 'size-mismatch')
  })

  it('refuses an object key that escapes the job directory', async () => {
    await assert.rejects(
      localStorageProvider.putObject({
        ownerId: OWNER,
        key: 'job/..%2F/../../etc/passwd/output/x',
        data: Buffer.from('x'),
        mimeType: 'text/plain'
      }),
      /DOCUMENT_JOB_NOT_FOUND/
    )
  })
})
