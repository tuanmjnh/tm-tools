import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-extract-checkpoint-'))
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'

const { checkpointFingerprint, fingerprintDir, promptVersion, presetFingerprint }
  = await import('../../server/modules/pdf/extract/checkpoint')
const { extractJobStore } = await import('../../server/modules/pdf/extract/job-store')
const { chunkWordText, readCachedRows } = await import('../../server/modules/pdf/extract/jobs')
const { pdfDirs } = await import('../../server/modules/pdf/paths')

const TARGET = { connectionId: 'conn-1', model: 'gemini-3.5-flash' }

async function samplePdf(pages: number): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 1; index <= pages; index++) {
    const page = doc.addPage([200, 200])
    page.drawText(`page ${index}`, { x: 20, y: 100, size: 16, font })
  }
  const path = join(dataRoot, `sample-${pages}-${Math.random().toString(36).slice(2)}.pdf`)
  writeFileSync(path, Buffer.from(await doc.save()))
  return path
}

before(() => {
  process.env.PDF_DATA_DIR = dataRoot
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('checkpoint fingerprint (guide §7.4)', () => {
  it('changes when the source bytes change, not only the file name', async () => {
    const first = await samplePdf(2)
    const second = await samplePdf(3)
    const a = checkpointFingerprint({ sourcePath: first, totalPages: 2, target: TARGET })
    const b = checkpointFingerprint({ sourcePath: second, totalPages: 3, target: TARGET })
    assert.notEqual(a.key, b.key)
    // The source part alone is enough to separate them.
    assert.notEqual(a.parts.source, b.parts.source)
  })

  it('is stable for identical inputs', async () => {
    const path = await samplePdf(2)
    const a = checkpointFingerprint({ sourcePath: path, totalPages: 2, target: TARGET })
    const b = checkpointFingerprint({ sourcePath: path, totalPages: 2, target: TARGET })
    assert.equal(a.key, b.key)
  })

  it('changes with the model and with the connection', async () => {
    const path = await samplePdf(1)
    const base = checkpointFingerprint({ sourcePath: path, totalPages: 1, target: TARGET })
    const model = checkpointFingerprint({
      sourcePath: path,
      totalPages: 1,
      target: { connectionId: 'conn-1', model: 'gemini-4-pro' }
    })
    const connection = checkpointFingerprint({
      sourcePath: path,
      totalPages: 1,
      target: { connectionId: 'conn-2', model: 'gemini-3.5-flash' }
    })
    assert.notEqual(base.key, model.key)
    assert.notEqual(base.key, connection.key)
  })

  it('changes when the preset guidance changes', async () => {
    const path = await samplePdf(1)
    const none = checkpointFingerprint({ sourcePath: path, totalPages: 1, target: TARGET })
    const withPreset = checkpointFingerprint({
      sourcePath: path,
      totalPages: 1,
      target: TARGET,
      instructions: { preset: 'Bảng giá', description: 'Cột giá theo chất liệu' }
    })
    const different = checkpointFingerprint({
      sourcePath: path,
      totalPages: 1,
      target: TARGET,
      instructions: { preset: 'Bảng giá', description: 'Cột giá theo màu' }
    })
    assert.notEqual(none.key, withPreset.key)
    assert.notEqual(withPreset.key, different.key)
    assert.notEqual(presetFingerprint({ preset: 'a' }), presetFingerprint({ preset: 'b' }))
  })

  it('produces a versioned, per-run directory so old pages are never reused by accident', async () => {
    const path = await samplePdf(1)
    const fingerprint = checkpointFingerprint({ sourcePath: path, totalPages: 1, target: TARGET })
    const dir = fingerprintDir('price-list', fingerprint)
    assert.ok(dir.startsWith(join(pdfDirs.checkpoints, 'price-list')))
    assert.match(dir, /v\d+-[0-9a-f]{16}$/)
    assert.equal(fingerprint.parts.checkpointVersion >= 2, true)
  })

  it('pins a prompt version that is independent of the fingerprint', () => {
    assert.match(promptVersion(null), /^[0-9a-f]{16}$/)
    assert.notEqual(promptVersion(null), promptVersion({ description: 'different guidance' }))
  })
})

describe('extraction job journal', () => {
  const state = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    status: 'done' as const,
    source: 'sources/price-list.pdf',
    model: 'gemini-3.5-flash',
    connectionId: 'conn-1',
    preset: null,
    totalPages: 3,
    processedPages: 3,
    cachedPages: 0,
    failedPages: [],
    currentPage: null,
    productCount: 12,
    rowCount: 12,
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    cancelRequested: false,
    ...overrides
  })

  it('survives a process restart by reading the journal from disk', () => {
    const record = state('11111111-2222-3333-4444-555555555555')
    extractJobStore.save(record as never)

    const directory = join(pdfDirs.system, 'extract-jobs')
    const files = readdirSync(directory)
    assert.ok(files.includes(`${record.id}.json`))

    const reloaded = extractJobStore.get(record.id)
    assert.equal(reloaded?.status, 'done')
    assert.equal(reloaded?.rowCount, 12)
  })

  it('orders newest first and ignores an unreadable entry', () => {
    const older = state('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      createdAt: '2026-01-01T00:00:00.000Z'
    })
    const newer = state('bbbbbbbb-cccc-dddd-eeee-ffffffffffff', {
      createdAt: '2026-02-01T00:00:00.000Z'
    })
    extractJobStore.save(older as never)
    extractJobStore.save(newer as never)

    const directory = join(pdfDirs.system, 'extract-jobs')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'broken.json'), '{"id":')

    const listed = extractJobStore.list()
    const olderIndex = listed.findIndex(entry => entry.id === older.id)
    const newerIndex = listed.findIndex(entry => entry.id === newer.id)
    assert.ok(newerIndex >= 0 && olderIndex >= 0)
    assert.ok(newerIndex < olderIndex, 'the February record must precede the January one')
    // The truncated file contributes no entry instead of throwing.
    assert.equal(listed.some(entry => entry.id === 'broken'), false)
  })

  it('refuses to build a path from a non-identifier id', () => {
    // The store treats an unreadable id as "no such job" rather than letting a
    // traversal-shaped string reach the filesystem.
    assert.equal(extractJobStore.get('../../escape'), null)
    assert.equal(extractJobStore.get(''), null)
  })
})

describe('word chunking stays deterministic', () => {
  it('splits on paragraph boundaries and keeps order', () => {
    const chunks = chunkWordText('a\nb\nc', 4)
    assert.deepEqual(chunks, ['a\nb\n', 'c\n'])
  })

  it('hard-breaks a single oversized paragraph', () => {
    const chunks = chunkWordText('x'.repeat(10), 4)
    assert.equal(chunks.join('').length, 10)
    assert.ok(chunks.length >= 3)
  })
})

describe('cached rows survive the fingerprint layout change', () => {
  const page = (pageId: string) => ({
    pageId,
    pageCategorySlugs: 'noi-that-the-one',
    products: [{
      sku: `SKU-${pageId}`,
      title: `Product ${pageId}`,
      isNewProduct: false,
      width: '100',
      depth: '100',
      height: '100',
      description: '',
      shortDesc: '',
      opt1Name: '',
      variants: [{ opt1Val: '', price: '1000' }]
    }]
  })

  it('reads the flat legacy directory', () => {
    const stem = `legacy-${Date.now()}`
    const dir = join(pdfDirs.checkpoints, stem)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'page_0001.json'), JSON.stringify(page('page_0001')))

    const rows = readCachedRows(`${stem}.pdf`)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.sku, 'SKU-page_0001')
  })

  it('reads a fingerprinted subdirectory, so an export after extraction still works', () => {
    const stem = `fingerprinted-${Date.now()}`
    const dir = join(pdfDirs.checkpoints, stem, 'v2-0123456789abcdef')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'page_0001.json'), JSON.stringify(page('page_0001')))
    writeFileSync(join(dir, 'page_0002.json'), JSON.stringify(page('page_0002')))

    const rows = readCachedRows(`${stem}.pdf`)
    assert.equal(rows.length, 2)
  })

  it('prefers the newest fingerprint when both layouts exist', () => {
    const stem = `mixed-${Date.now()}`
    const flat = join(pdfDirs.checkpoints, stem)
    const older = join(flat, 'v2-aaaaaaaaaaaaaaaa')
    const newer = join(flat, 'v2-bbbbbbbbbbbbbbbb')
    mkdirSync(older, { recursive: true })
    mkdirSync(newer, { recursive: true })
    writeFileSync(join(flat, 'page_0001.json'), JSON.stringify(page('page_0001')))
    writeFileSync(join(older, 'page_0001.json'), JSON.stringify(page('old')))
    writeFileSync(join(newer, 'page_0001.json'), JSON.stringify(page('new')))

    const rows = readCachedRows(`${stem}.pdf`)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.sku, 'SKU-new')
  })
})
