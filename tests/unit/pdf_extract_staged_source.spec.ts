import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-extract-staged-'))
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'

const { resolveExtractSource } = await import('../../server/modules/pdf/extract/jobs')
const { pdfDirs } = await import('../../server/modules/pdf/paths')

/** Bytes that only exist in a document job workspace, never in the input library. */
function stagedJobPdf(name: string): string {
  const path = join(dataRoot, '.system', 'jobs', 'job-12345678', 'input', 'input-1', name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '%PDF-1.7\n% staged job bytes\n')
  return path
}

before(() => {
  process.env.PDF_DATA_DIR = dataRoot
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('extraction source resolution', () => {
  it('reads the file staged for a document job instead of the input library', () => {
    const staged = stagedJobPdf('price-list-probe.pdf')

    const resolved = resolveExtractSource('price-list-probe.pdf', { path: staged, kind: 'pdf' })

    assert.equal(resolved.path, staged)
    assert.equal(resolved.kind, 'pdf')
  })

  it('still resolves a library file when no staged source is given', () => {
    const name = `library-${Date.now()}.pdf`
    const libraryPath = join(pdfDirs.input, name)
    mkdirSync(pdfDirs.input, { recursive: true })
    writeFileSync(libraryPath, '%PDF-1.7\n% library bytes\n')

    const resolved = resolveExtractSource(name)

    assert.equal(resolved.path, libraryPath)
    assert.equal(resolved.kind, 'pdf')
  })

  it('rejects a bare file name that exists nowhere', () => {
    assert.throws(
      () => resolveExtractSource('missing-from-library.pdf'),
      /PDF_SOURCE_NOT_FOUND/
    )
  })

  it('rejects a staged path whose bytes are gone', () => {
    const gone = join(dataRoot, '.system', 'jobs', 'job-12345678', 'input', 'input-2', 'gone.pdf')

    assert.throws(
      () => resolveExtractSource('gone.pdf', { path: gone, kind: 'pdf' }),
      /PDF_SOURCE_NOT_FOUND/
    )
  })
})
