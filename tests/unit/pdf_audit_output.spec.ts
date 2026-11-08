import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  mkdirSync(join(dataRoot, 'input'), { recursive: true })
  mkdirSync(join(dataRoot, 'output'), { recursive: true })
  await writePdf(join(dataRoot, 'input', 'book.pdf'), 2)
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('tool outputs are audited', () => {
  it('records a split with its tool and output folder', async () => {
    await splitPdf(join(dataRoot, 'input', 'book.pdf'), join(dataRoot, 'output', 'split', 'book'))

    const event = lastEvent('output')
    assert.equal(event?.tool, 'split')
    assert.equal(event?.target, 'book')
  })

  it('records a merge with its output folder and file', async () => {
    await mergePdfFolder(join(dataRoot, 'output', 'split', 'book'), join(dataRoot, 'output', 'merged'), 'book_merged.pdf')

    const event = lastEvent('output')
    assert.equal(event?.tool, 'merge')
    assert.equal(event?.target, 'book_merged.pdf')
  })

  it('never writes page bytes into the log', async () => {
    await splitPdf(join(dataRoot, 'input', 'book.pdf'), join(dataRoot, 'output', 'split', 'book2'))

    const serialized = JSON.stringify(readAudit())
    assert.equal(serialized.includes('%PDF'), false)
  })
})

describe('trash mutations are audited', () => {
  it('records a restore at its original relative path', () => {
    mkdirSync(join(dataRoot, 'output', 'office'), { recursive: true })
    const target = join(dataRoot, 'output', 'office', 'restore-me.pdf')
    writeFileSync(target, 'pdf')

    const item = moveToTrash('output', target, 'office/restore-me.pdf')
    // The trash routes outside `output/` while it holds the item, so restoring
    // at the recorded relative path is the only way back to `office/`.
    assert.equal(existsSync(target), false)
    const restored = restoreTrashItem(item.id)

    const event = lastEvent('restore')
    assert.equal(event?.area, 'output')
    assert.equal(event?.target, 'office/restore-me.pdf')
    assert.equal(existsSync(target), true)
    assert.equal(restored.originalPath, target)
  })

  it('records a permanent purge', () => {
    const target = join(dataRoot, 'output', 'office', 'purge-me.pdf')
    writeFileSync(target, 'pdf')
    const item = moveToTrash('output', target, 'office/purge-me.pdf')
    deleteTrashItemPermanently(item.id)

    const event = lastEvent('purge')
    assert.equal(event?.area, 'output')
    assert.equal(event?.target, 'office/purge-me.pdf')
  })
})
