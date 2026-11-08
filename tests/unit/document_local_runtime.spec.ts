import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Config reads PDF_DATA_DIR at import time, so the temp root must exist first.
const dataRoot = mkdtempSync(join(tmpdir(), 'document-local-runtime-'))
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'

const { documentRuntime } = await import('../../server/modules/document/runtime-context')
const { createDraftJob, startDocumentJob, jobView } = await import('../../server/modules/document/runner')
const { stageInput, validateCount, signatureMatches } = await import('../../server/modules/document/staging')
const { requireOperation } = await import('../../server/modules/document/operations')
const { cleanupOrphans } = await import('../../server/modules/document/cleanup')
const { documentDirs, jobInputDir, jobOutputDir, jobRoot } = await import('../../server/modules/document/paths')
const { localJobRepository } = await import('../../server/modules/document/jobs')
const { DocumentError } = await import('../../server/modules/document/operations')

const OWNER = 'owner-local'

async function samplePdf(pages = 3): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 1; index <= pages; index++) {
    const page = doc.addPage([200, 200])
    page.drawText(`page ${index}`, { x: 20, y: 100, size: 16, font })
  }
  return Buffer.from(await doc.save())
}

async function deps() {
  const runtime = await documentRuntime()
  return { jobs: runtime.jobs, temp: runtime.temp, storage: runtime.storage, delivery: runtime.delivery }
}

async function draft(operationId: string, config: Record<string, unknown> = {}) {
  return createDraftJob(await deps(), {
    ownerId: OWNER,
    operationId,
    runtime: 'local',
    config,
    retentionDays: 7
  })
}

async function stage(jobId: string, operationId: string, fileName: string, data: Buffer) {
  const job = await localJobRepository.getJob(jobId, OWNER)
  assert.ok(job)
  const staged = stageInput({
    jobId,
    ownerId: OWNER,
    operation: requireOperation(operationId),
    fileName,
    data,
    expiresAt: job.expiresAt,
    maxFileBytes: 200 * 1024 * 1024
  })
  await localJobRepository.addInput(staged.record)
  return staged
}

before(() => {
  process.env.PDF_DATA_DIR = dataRoot
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('stage-once upload', () => {
  it('writes the picked bytes into the job input directory, not a library folder', async () => {
    const job = await draft('pdf.split')
    const staged = await stage(job.id, 'pdf.split', 'price list.pdf', await samplePdf())

    assert.equal(existsSync(staged.stagedPath), true)
    assert.ok(staged.stagedPath.startsWith(jobInputDir(job.id)))
    // `input/` is the optional library and must stay empty for a use-once file.
    const library = existsSync(documentDirs.input) ? readdirSync(documentDirs.input) : []
    assert.deepEqual(library, [])
  })

  it('rejects a type the operation does not accept', async () => {
    const job = await draft('pdf.split')
    await assert.rejects(
      stage(job.id, 'pdf.split', 'notes.docx', await samplePdf()),
      (error: unknown) => error instanceof DocumentError && error.code === 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED'
    )
  })

  it('rejects a file whose bytes contradict its extension', async () => {
    const job = await draft('pdf.split')
    const fake = Buffer.from('PK\u0003\u0004 not really a pdf')
    await assert.rejects(
      stage(job.id, 'pdf.split', 'fake.pdf', fake),
      /DOCUMENT_INPUT_TYPE_NOT_SUPPORTED/
    )
  })

  it('checks magic bytes for the formats it knows', () => {
    assert.equal(signatureMatches('pdf', Buffer.from('%PDF-1.7')), true)
    assert.equal(signatureMatches('png', Buffer.from([0x89, 0x50, 0x4e, 0x47])), true)
    assert.equal(signatureMatches('docx', Buffer.from([0x50, 0x4b, 0x03, 0x04])), true)
    assert.equal(signatureMatches('docx', Buffer.from('%PDF')), false)
  })

  it('enforces the operation cardinality before executing', () => {
    const merge = requireOperation('pdf.merge')
    assert.throws(() => validateCount(merge, 1), /DOCUMENT_INPUT_COUNT_INVALID/)
    assert.doesNotThrow(() => validateCount(merge, 2))

    const split = requireOperation('pdf.split')
    assert.throws(() => validateCount(split, 2), /DOCUMENT_INPUT_COUNT_INVALID/)
  })
})

describe('split runs through the new pipeline', () => {
  it('produces one artifact per page and publishes copies to output/', async () => {
    const job = await draft('pdf.split')
    await stage(job.id, 'pdf.split', 'catalogue.pdf', await samplePdf(3))

    const result = await startDocumentJob(await deps(), job.id, OWNER)

    assert.equal(result.status, 'completed')
    assert.equal(result.artifacts.length, 3)
    assert.deepEqual(result.artifacts.map(entry => entry.fileName).sort(), ['catalogue/page_0001.pdf', 'catalogue/page_0002.pdf', 'catalogue/page_0003.pdf'])

    for (const artifact of result.artifacts) {
      assert.ok(artifact.downloadPath.includes(`/jobs/${job.id}/artifacts/`))
      assert.ok(existsSync(join(documentDirs.output, artifact.fileName)), `${artifact.fileName} must be published`)
      assert.ok(existsSync(join(jobOutputDir(job.id), artifact.fileName)))
    }
  })

  it('can split into root output folder without subfolder if createSubfolder is false', async () => {
    const job = await draft('pdf.split', { createSubfolder: false })
    await stage(job.id, 'pdf.split', 'flat.pdf', await samplePdf(2))

    const result = await startDocumentJob(await deps(), job.id, OWNER)
    assert.equal(result.status, 'completed')
    assert.equal(result.artifacts.length, 2)
    assert.deepEqual(result.artifacts.map(entry => entry.fileName).sort(), ['page_0001.pdf', 'page_0002.pdf'])
  })

  it('drops input and working bytes but keeps the output for download', async () => {
    const job = await draft('pdf.split')
    await stage(job.id, 'pdf.split', 'retained.pdf', await samplePdf(2))
    await startDocumentJob(await deps(), job.id, OWNER)

    assert.equal(existsSync(jobInputDir(job.id)), false)
    assert.equal(existsSync(jobOutputDir(job.id)), true)
  })

  it('records progress and a finished timestamp in the manifest', async () => {
    const job = await draft('pdf.split')
    await stage(job.id, 'pdf.split', 'progress.pdf', await samplePdf(2))
    await startDocumentJob(await deps(), job.id, OWNER)

    const stored = await localJobRepository.getJob(job.id, OWNER)
    assert.equal(stored?.progress.totalUnits, 2)
    assert.equal(stored?.progress.completedUnits, 2)
    assert.ok(stored?.finishedAt)
    assert.equal(stored?.cleanupStatus, 'pending')
  })

  it('refuses to start a job with no staged input', async () => {
    const job = await draft('pdf.split')
    await assert.rejects(startDocumentJob(await deps(), job.id, OWNER), /DOCUMENT_INPUT_REQUIRED/)
  })

  it('refuses to start another user\'s job', async () => {
    const job = await draft('pdf.split')
    await assert.rejects(startDocumentJob(await deps(), job.id, 'someone-else'), /DOCUMENT_JOB_NOT_FOUND/)
  })

  it('never copies a user artifact outside the configured root', async () => {
    const job = await draft('pdf.split')
    await stage(job.id, 'pdf.split', '../../escape.pdf', await samplePdf(1))
    const result = await startDocumentJob(await deps(), job.id, OWNER)

    for (const artifact of result.artifacts) {
      assert.ok(existsSync(join(documentDirs.output, artifact.fileName)))
      assert.equal(existsSync(join(dataRoot, '..', artifact.fileName)), false)
    }
  })
})

describe('merge and images-to-pdf keep the requested order', () => {
  it('merges staged PDFs in upload order', async () => {
    const job = await draft('pdf.merge')
    // Page counts differ so the merged total proves both files were included.
    await stage(job.id, 'pdf.merge', 'b.pdf', await samplePdf(2))
    await stage(job.id, 'pdf.merge', 'a.pdf', await samplePdf(3))

    const result = await startDocumentJob(await deps(), job.id, OWNER)
    assert.equal(result.status, 'completed')
    assert.equal(result.artifacts.length, 1)

    const merged = await PDFDocument.load(
      (await import('node:fs')).readFileSync(join(jobOutputDir(job.id), result.artifacts[0]!.fileName))
    )
    assert.equal(merged.getPageCount(), 5)
  })

  it('supports custom outputName and folderName for merge', async () => {
    const jobCustom = await draft('pdf.merge', { outputName: 'custom_catalog.pdf' })
    await stage(jobCustom.id, 'pdf.merge', 'page1.pdf', await samplePdf(1))
    await stage(jobCustom.id, 'pdf.merge', 'page2.pdf', await samplePdf(1))
    const resCustom = await startDocumentJob(await deps(), jobCustom.id, OWNER)
    assert.equal(resCustom.artifacts[0]?.fileName, 'custom_catalog.pdf')

    const jobFolder = await draft('pdf.merge', { folderName: 'hoa-phat-split' })
    await stage(jobFolder.id, 'pdf.merge', 'p1.pdf', await samplePdf(1))
    await stage(jobFolder.id, 'pdf.merge', 'p2.pdf', await samplePdf(1))
    const resFolder = await startDocumentJob(await deps(), jobFolder.id, OWNER)
    assert.equal(resFolder.artifacts[0]?.fileName, 'hoa-phat-split_merged.pdf')
  })

  it('converts staged PNGs to a single PDF', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    const job = await draft('pdf.images-to-pdf')
    await stage(job.id, 'pdf.images-to-pdf', 'one.png', png)
    await stage(job.id, 'pdf.images-to-pdf', 'two.png', png)

    const result = await startDocumentJob(await deps(), job.id, OWNER)
    assert.equal(result.artifacts.length, 1)
    const converted = await PDFDocument.load(
      (await import('node:fs')).readFileSync(join(jobOutputDir(job.id), result.artifacts[0]!.fileName))
    )
    assert.equal(converted.getPageCount(), 2)
  })
})

describe('job views and cleanup', () => {
  it('hides the config snapshot from the client view', async () => {
    const job = await draft('pdf.split', { internal: 'secret' })
    const view = await jobView(await deps(), job.id, OWNER)
    assert.ok(view)
    assert.equal('configSnapshot' in view, false)
  })

  it('removes an expired job directory and keeps a live one', async () => {
    const expired = await draft('pdf.split')
    const live = await draft('pdf.split')

    const manifestPath = join(jobRoot(expired.id), 'manifest.json')
    const manifest = JSON.parse((await import('node:fs')).readFileSync(manifestPath, 'utf8')) as { job: { expiresAt: string } }
    manifest.job.expiresAt = new Date(Date.now() - 1000).toISOString()
    ;(await import('node:fs')).writeFileSync(manifestPath, JSON.stringify(manifest))

    const result = cleanupOrphans({ ttlMs: 0 })
    assert.ok(result.removed.includes(expired.id))
    assert.equal(existsSync(jobRoot(expired.id)), false)
    assert.equal(existsSync(jobRoot(live.id)), true)
  })

  it('keeps a manifest whose job is still active', async () => {
    const job = await draft('pdf.split')
    await localJobRepository.updateStatus(job.id, { to: 'queued' })

    const manifestPath = join(jobRoot(job.id), 'manifest.json')
    const manifest = JSON.parse((await import('node:fs')).readFileSync(manifestPath, 'utf8')) as { job: { expiresAt: string } }
    manifest.job.expiresAt = new Date(Date.now() - 1000).toISOString()
    ;(await import('node:fs')).writeFileSync(manifestPath, JSON.stringify(manifest))

    const result = cleanupOrphans({ ttlMs: 0 })
    assert.equal(result.removed.includes(job.id), false)
    assert.ok(readdirSync(jobRoot(job.id)).includes('manifest.json'))
  })
})

describe('export writes every artifact inside the job output dir', () => {
  it('produces a docx beside the job output root so the artifact key resolves', async () => {
    const job = await draft('pdf.export', { formats: ['docx'] })
    await stage(job.id, 'pdf.export', 'price-list.pdf', await samplePdf(2))

    const result = await startDocumentJob(await deps(), job.id, OWNER)
    assert.equal(result.status, 'completed')
    assert.equal(result.artifacts.length, 1)

    const artifact = result.artifacts[0]!
    assert.equal(artifact.fileName, 'price-list.docx')
    // The stored key is `job/<id>/output/<fileName>`; a nested folder would break it.
    assert.equal(artifact.downloadPath.includes('/artifacts/'), true)
    assert.ok(existsSync(join(jobOutputDir(job.id), artifact.fileName)))
  })

  it('fails the job when the only requested format has nothing to export', async () => {
    const job = await draft('pdf.export', { formats: ['csv'] })
    await stage(job.id, 'pdf.export', 'no-rows.pdf', await samplePdf(1))

    await assert.rejects(
      startDocumentJob(await deps(), job.id, OWNER),
      (error: unknown) => error instanceof DocumentError && error.code === 'DOCUMENT_OUTPUT_NOT_READY'
    )
    const stored = await localJobRepository.getJob(job.id, OWNER)
    assert.equal(stored?.status, 'failed')
  })
})
