import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Config reads PDF_DATA_DIR at import time, so the temp root must exist first.
const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-area-guard-'))
process.env.PDF_DATA_DIR = dataRoot

const { createAreaFolder, deleteAreaItem, getAreaFolderTree, listAreaDirectory, renameAreaItem } = await import('../../server/modules/pdf/directory')
const { moveToTrash, restoreTrashItem } = await import('../../server/modules/pdf/trash')
const { saveWord, removeWord } = await import('../../server/modules/pdf/library')
before(() => {
  for (const area of ['sources', 'inputs', 'word', 'split', 'images', 'merged', 'products', 'office']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  mkdirSync(join(dataRoot, 'split', 'pages'), { recursive: true })
  writeFileSync(join(dataRoot, 'split', 'pages', 'page_0001.pdf'), 'pdf')
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('folder permissions on disk', () => {
  it('lets the source area create, rename and delete its own folders', () => {
    const created = createAreaFolder('sources', '', 'catalogue')
    assert.equal(created.relativePath, 'catalogue')

    const renamed = renameAreaItem('sources', 'catalogue', 'archive')
    assert.equal(renamed.newRelativePath, 'archive')

    const deleted = deleteAreaItem('sources', 'archive')
    assert.ok(deleted)
    assert.equal(existsSync(join(dataRoot, 'sources', 'archive')), false)
  })

  it('lets a generated area manage subfolders while its root stays fixed', () => {
    const created = createAreaFolder('split', '', 'manual')
    assert.equal(created.relativePath, 'manual')

    const renamed = renameAreaItem('split', 'manual', 'manual-renamed')
    assert.equal(renamed.newRelativePath, 'manual-renamed')

    assert.ok(deleteAreaItem('split', 'manual-renamed'))
    assert.equal(existsSync(join(dataRoot, 'split', 'manual-renamed')), false)
  })

  it('never addresses the area root itself', () => {
    assert.throws(() => renameAreaItem('split', '', 'renamed'), /PDF_INVALID_PATH/)
    assert.throws(() => deleteAreaItem('split', ''), /PDF_INVALID_PATH/)
    assert.equal(existsSync(join(dataRoot, 'split')), true)
  })

  it('refuses folder mutations in the legacy word area', () => {
    assert.throws(() => createAreaFolder('word', '', 'extra'), /PDF_FOLDER_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'extra')), false)
  })

  it('refuses file mutations in the legacy word area', () => {
    writeFileSync(join(dataRoot, 'word', 'legacy.docx'), 'docx')

    assert.throws(() => renameAreaItem('word', 'legacy.docx', 'renamed.docx'), /PDF_FILE_IMMUTABLE/)
    assert.throws(() => deleteAreaItem('word', 'legacy.docx'), /PDF_FILE_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'legacy.docx')), true)
  })

  it('allows a case-only rename without reporting a name clash', () => {
    writeFileSync(join(dataRoot, 'split', 'lower.pdf'), 'pdf')

    const renamed = renameAreaItem('split', 'lower.pdf', 'LOWER.pdf')
    assert.equal(renamed.newRelativePath, 'LOWER.pdf')
    assert.equal(existsSync(join(dataRoot, 'split', 'LOWER.pdf')), true)
  })

  it('still refuses a rename that lands on a different existing file', () => {
    writeFileSync(join(dataRoot, 'split', 'taken.pdf'), 'pdf')
    writeFileSync(join(dataRoot, 'split', 'other.pdf'), 'pdf')

    assert.throws(() => renameAreaItem('split', 'other.pdf', 'taken.pdf'), /PDF_FILE_ALREADY_EXISTS/)
  })

  it('counts only files, not subfolders, in a folder badge', () => {
    mkdirSync(join(dataRoot, 'split', 'mixed', 'nested'), { recursive: true })
    writeFileSync(join(dataRoot, 'split', 'mixed', 'a.pdf'), 'pdf')

    const listing = listAreaDirectory('split')
    const row = listing.folders.find(folder => folder.name === 'mixed')
    assert.equal(row?.fileCount, 1)

    const node = getAreaFolderTree('split').find(entry => entry.label === 'mixed')
    assert.equal(node?.fileCount, 1)
  })

  it('still manages files inside a generated folder', () => {
    assert.ok(deleteAreaItem('split', 'pages/page_0001.pdf'))
    assert.equal(existsSync(join(dataRoot, 'split', 'pages', 'page_0001.pdf')), false)
  })

  it('still lists a generated folder', () => {
    const listing = listAreaDirectory('split')
    assert.ok(listing.folders.some(folder => folder.name === 'pages'))
  })
})

describe('trash restore permissions', () => {
  it('refuses to restore a file into the read-only word area', () => {
    writeFileSync(join(dataRoot, 'word', 'old.docx'), 'docx')
    const item = moveToTrash('word', join(dataRoot, 'word', 'old.docx'), 'old.docx')

    assert.throws(() => restoreTrashItem(item.id), /PDF_FILE_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'old.docx')), false)
  })

  it('restores a file into a writable area', () => {
    writeFileSync(join(dataRoot, 'split', 'keep.pdf'), 'pdf')
    const item = moveToTrash('split', join(dataRoot, 'split', 'keep.pdf'), 'keep.pdf')

    const restored = restoreTrashItem(item.id)
    assert.equal(restored.originalName, 'keep.pdf')
    assert.equal(existsSync(join(dataRoot, 'split', 'keep.pdf')), true)
  })
})

describe('legacy word area is read-only end to end', () => {
  it('refuses to upload a document into word', () => {
    assert.throws(() => saveWord('price-list.docx', Buffer.from('docx')), /PDF_FILE_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'price-list.docx')), false)
  })

  it('refuses to remove a document from word', () => {
    writeFileSync(join(dataRoot, 'word', 'keep-me.docx'), 'docx')

    assert.throws(() => removeWord('keep-me.docx'), /PDF_FILE_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'keep-me.docx')), true)
  })
})
