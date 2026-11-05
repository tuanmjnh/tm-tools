import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument } from 'pdf-lib'

const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-audit-output-'))
process.env.PDF_DATA_DIR = dataRoot

const { readAudit } = await import('../../server/modules/pdf/audit')
const { splitPdf } = await import('../../server/modules/pdf/document')
const { mergePdfFolder } = await import('../../server/modules/pdf/merge')
const { moveToTrash, restoreTrashItem, deleteTrashItemPermanently } = await import('../../server/modules/pdf/trash')

async function writePdf(path: string, pages: number): Promise<void> {
  const doc = await PDFDocument.create()
  for (let index = 0; index < pages; index++) doc.addPage()
  writeFileSync(path, await doc.save())
}

function lastEvent(action: string) {
  return readAudit().filter(event => event.action === action).at(-1)
}

before(async () => {
  for (const area of ['sources', 'inputs', 'word', 'split', 'images', 'merged', 'products', 'office']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  await writePdf(join(dataRoot, 'sources', 'book.pdf'), 2)
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('tool outputs are audited', () => {
  it('records a split with its tool and output folder', async () => {
    await splitPdf(join(dataRoot, 'sources', 'book.pdf'), join(dataRoot, 'split', 'book'))

    const event = lastEvent('output')
    assert.equal(event?.area, 'split')
    assert.equal(event?.tool, 'split')
    assert.equal(event?.target, 'book')
  })

  it('records a merge with its output file', async () => {
    await mergePdfFolder(join(dataRoot, 'split', 'book'), join(dataRoot, 'merged'), 'book_merged.pdf')

    const event = lastEvent('output')
    assert.equal(event?.area, 'merged')
    assert.equal(event?.tool, 'merge')
    assert.equal(event?.target, 'book_merged.pdf')
  })

  it('never writes page bytes into the log', async () => {
    await splitPdf(join(dataRoot, 'sources', 'book.pdf'), join(dataRoot, 'split', 'book2'))

    const serialized = JSON.stringify(readAudit())
    assert.equal(serialized.includes('%PDF'), false)
  })
})

describe('trash mutations are audited', () => {
  it('records a restore into its original area', () => {
    writeFileSync(join(dataRoot, 'sources', 'restore-me.pdf'), 'pdf')
    const item = moveToTrash('sources', join(dataRoot, 'sources', 'restore-me.pdf'), 'restore-me.pdf')
    restoreTrashItem(item.id)

    const event = lastEvent('restore')
    assert.equal(event?.area, 'sources')
    assert.equal(event?.target, 'restore-me.pdf')
  })

  it('records a permanent purge', () => {
    writeFileSync(join(dataRoot, 'sources', 'purge-me.pdf'), 'pdf')
    const item = moveToTrash('sources', join(dataRoot, 'sources', 'purge-me.pdf'), 'purge-me.pdf')
    deleteTrashItemPermanently(item.id)

    const event = lastEvent('purge')
    assert.equal(event?.area, 'sources')
    assert.equal(event?.target, 'purge-me.pdf')
  })
})
