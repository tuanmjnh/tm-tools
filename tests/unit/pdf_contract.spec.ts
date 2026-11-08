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

describe('row action feedback', () => {
  // The actions store `relativePath || name`; `file.path` is absolute, so a
  // spinner keyed on it never matches and the row looks frozen during the run.
  it('keys the row spinner on the identifier the action stores', () => {
    for (const page of ['library', 'split', 'images', 'import']) {
      const source = read(`app/pages/pdf/${page}.vue`)
      assert.ok(
        !/=== file\.path"/.test(source),
        `${page}.vue compares a relative marker against the absolute file.path`
      )
    }
  })
})

describe('lazy explorer reload', () => {
  // The shallow tree carries one level, so dropping the child cache on reload
  // leaves expanded folders open around nothing.
  it('re-fetches the folders that were open before the reload', () => {
    const source = read('app/composables/usePdfExplorer.ts')
    const body = source.match(/async function loadExplorer\(\)[\s\S]*?\n {2}\}/)?.[0] ?? ''
    assert.ok(body, 'loadExplorer not found')
    assert.ok(
      /Object\.keys\(loadedChildren\.value\)/.test(body),
      'loadExplorer discards the opened folders instead of refreshing them'
    )
    assert.ok(
      !/loadedChildren\.value = \{\}/.test(body),
      'loadExplorer still clears the child cache outright'
    )
  })
})

describe('desktop actions in the PDF workspaces', () => {
  it('lets the tree create a folder in either root', () => {
    for (const page of ['library', 'split', 'images', 'import', 'export', 'extract']) {
      const source = read(`app/pages/pdf/${page}.vue`)
      assert.ok(
        /@create="explorer\.openCreateFolder"/.test(source),
        `${page}.vue cannot create a folder in the output tree`
      )
      assert.ok(
        /:can-create="explorer\.foldersWritable\.value"/.test(source),
        `${page}.vue does not ask the server whether its area accepts subfolders`
      )
    }
  })

  it('keeps the result panel able to preview, reveal and open output', () => {
    const source = read('app/components/pdf/OperationResult.vue')
    assert.ok(/<PdfFileRow/.test(source), 'the result panel no longer lists the files it wrote')
    assert.ok(/openLocalPath/.test(source), 'the result panel cannot open the output folder')
    assert.ok(/revealLocalPath/.test(source), 'the result panel cannot reveal the output folder')
    assert.ok(/<UDropdownMenu/.test(source), 'the result panel has no context menu')
  })

  it('deletes through a confirmation modal on every workspace page', () => {
    for (const page of ['library', 'split', 'images', 'import', 'export', 'extract']) {
      const source = read(`app/pages/pdf/${page}.vue`)
      assert.ok(/<BaseConfirmModal/.test(source), `${page}.vue deletes without a confirm modal`)
    }
  })

  it('names only the two workspace roots', () => {
    for (const page of ['library', 'split', 'images', 'import', 'export', 'extract', 'index']) {
      const source = read(`app/pages/pdf/${page}.vue`)
      assert.ok(
        !/'sources'|'inputs'|'split'\s*,\s*'images'/.test(source),
        `${page}.vue still addresses a removed area`
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
  for (const area of ['input', 'output', 'checkpoints']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  for (const path of [
    'input/bang_gia.pdf',
    'output/split/bang_gia/page_0001.pdf',
    'output/images/bang_gia/page_0001.png',
    'checkpoints/bang_gia/1.json',
    'output/merged/bang_gia_merged.pdf',
    'output/merged/khac_merged.pdf',
    'output/products/bang_gia_products.csv',
    'output/products/khac_products.csv'
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
    deleteAreaItem('input', 'bang_gia.pdf')

    for (const path of [
      'input/bang_gia.pdf',
      'output/split/bang_gia',
      'output/images/bang_gia',
      'checkpoints/bang_gia',
      'output/merged/bang_gia_merged.pdf',
      'output/products/bang_gia_products.csv'
    ]) {
      assert.equal(existsSync(join(dataRoot, path)), false, `${path} survived the cascade`)
    }
  })

  it('leaves files belonging to other sources alone', () => {
    assert.equal(existsSync(join(dataRoot, 'output/merged/khac_merged.pdf')), true)
    assert.equal(existsSync(join(dataRoot, 'output/products/khac_products.csv')), true)
  })
})
