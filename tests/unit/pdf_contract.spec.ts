import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

function errorCodes(source: string, marker: string): string[] {
  const block = source.slice(source.indexOf(marker))
  return [...block.matchAll(/^\s{2}(PDF_[A-Z0-9_]+):/gm)].map(match => match[1]!)
}

describe('error status contract', () => {
  const server = errorCodes(read('server/utils/pdfApi.ts'), 'PDF_ERROR_STATUS')
  const client = errorCodes(read('app/utils/pdfStudio.ts'), 'PDF_ERROR_KEYS')

  it('gives every client-side error code an HTTP status', () => {
    const unmapped = client.filter(code => !server.includes(code))
    assert.deepEqual(unmapped, [], `these codes fall through to 500:\n${unmapped.join('\n')}`)
  })

  it('classifies the three formerly-500 codes as client errors', async () => {
    const { pdfHttpStatus } = await import('../../server/utils/pdfApi')
    assert.equal(pdfHttpStatus('PDF_FOLDER_NAME_REQUIRED'), 422)
    assert.equal(pdfHttpStatus('PDF_TRASH_ITEM_NOT_FOUND'), 404)
    assert.equal(pdfHttpStatus('PDF_EXPORT_FAILED'), 422)
  })
})

describe('options the server actually honours', () => {
  it('never persists an extract format preference the route ignores', () => {
    const source = read('app/pages/pdf/extract.vue')
    assert.ok(!/outputFormats/.test(source), 'extract.vue still carries an outputFormats setting')
    assert.ok(!/pdf\.extract\.outputFormats/.test(source), 'extract.vue still renders the format checkbox')
  })

  it('keeps the library free of a page-wide overwrite toggle', () => {
    const source = read('app/pages/pdf/library.vue')
    const footer = source.match(/<template #footer>[\s\S]*?<\/template>/)?.[0] ?? ''
    assert.ok(!/UCheckbox/.test(footer), 'library.vue still has an overwrite checkbox in the browser footer')
  })

  it('asks before writing an output from a row action', () => {
    for (const page of ['library', 'split', 'images', 'import']) {
      const source = read(`app/pages/pdf/${page}.vue`)
      assert.ok(
        /<PdfConfirmAction/.test(source),
        `${page}.vue writes output from a row action without a confirm step`
      )
    }
  })

  it('asks before deleting a source, because that delete cascades', () => {
    for (const page of ['library', 'split', 'images', 'import', 'export', 'extract']) {
      const source = read(`app/pages/pdf/${page}.vue`)
      assert.ok(
        /<BaseConfirmModal/.test(source),
        `${page}.vue deletes through the explorer without asking`
      )
    }
  })
})

// The explorer deletes through `/directory/delete`, so the cascade the confirm
// text promises has to live there too — not only in `removeSource`.
const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-contract-'))
process.env.PDF_DATA_DIR = dataRoot

const { deleteAreaItem } = await import('../../server/modules/pdf/directory')

before(() => {
  for (const area of ['sources', 'inputs', 'word', 'split', 'images', 'merged', 'products', 'office', 'checkpoints']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  for (const path of [
    'sources/bang_gia.pdf',
    'split/bang_gia/page_0001.pdf',
    'images/bang_gia/page_0001.png',
    'checkpoints/bang_gia/1.json',
    'merged/bang_gia_merged.pdf',
    'merged/khac_merged.pdf',
    'products/bang_gia_products.csv',
    'products/khac_products.csv'
  ]) {
    mkdirSync(dirname(join(dataRoot, path)), { recursive: true })
    writeFileSync(join(dataRoot, path), 'x')
  }
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('source delete cascade', () => {
  it('removes the split folder, page images, checkpoints, merged PDF and products', () => {
    deleteAreaItem('sources', 'bang_gia.pdf')

    for (const path of [
      'sources/bang_gia.pdf',
      'split/bang_gia',
      'images/bang_gia',
      'checkpoints/bang_gia',
      'merged/bang_gia_merged.pdf',
      'products/bang_gia_products.csv'
    ]) {
      assert.equal(existsSync(join(dataRoot, path)), false, `${path} survived the cascade`)
    }
  })

  it('leaves files belonging to other sources alone', () => {
    assert.equal(existsSync(join(dataRoot, 'merged/khac_merged.pdf')), true)
    assert.equal(existsSync(join(dataRoot, 'products/khac_products.csv')), true)
  })
})
