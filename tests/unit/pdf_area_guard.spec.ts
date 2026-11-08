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
const { saveSource, removeSource } = await import('../../server/modules/pdf/library')
const { removeInput } = await import('../../server/modules/pdf/inputs')
const { resolveAreaFile } = await import('../../server/modules/pdf/inspect')
const { readAudit } = await import('../../server/modules/pdf/audit')

before(() => {
  for (const area of ['input', 'output', 'word', 'checkpoints']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  mkdirSync(join(dataRoot, 'output', 'split', 'pages'), { recursive: true })
  writeFileSync(join(dataRoot, 'output', 'split', 'pages', 'page_0001.pdf'), 'pdf')
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('folder permissions on disk', () => {
  it('lets the input root create, rename and delete its own folders', () => {
    const created = createAreaFolder('input', '', 'catalogue')
    assert.equal(created.relativePath, 'catalogue')

    const renamed = renameAreaItem('input', 'catalogue', 'archive')
    assert.equal(renamed.newRelativePath, 'archive')

    const deleted = deleteAreaItem('input', 'archive')
    assert.ok(deleted)
    assert.equal(existsSync(join(dataRoot, 'input', 'archive')), false)
  })

  it('lets the output root manage subfolders', () => {
    const created = createAreaFolder('output', '', 'manual')
    assert.equal(created.relativePath, 'manual')

    const renamed = renameAreaItem('output', 'manual', 'manual-renamed')
    assert.equal(renamed.newRelativePath, 'manual-renamed')

    assert.ok(deleteAreaItem('output', 'manual-renamed'))
    assert.equal(existsSync(join(dataRoot, 'output', 'manual-renamed')), false)
  })

  it('never addresses the area root itself', () => {
    assert.throws(() => renameAreaItem('output', '', 'renamed'), /PDF_INVALID_PATH/)
    assert.throws(() => deleteAreaItem('output', ''), /PDF_INVALID_PATH/)
    assert.equal(existsSync(join(dataRoot, 'output')), true)
  })

  it('allows a case-only rename without reporting a name clash', () => {
    writeFileSync(join(dataRoot, 'output', 'lower.pdf'), 'pdf')

    const renamed = renameAreaItem('output', 'lower.pdf', 'LOWER.pdf')
    assert.equal(renamed.newRelativePath, 'LOWER.pdf')
    assert.equal(existsSync(join(dataRoot, 'output', 'LOWER.pdf')), true)
  })

  it('still refuses a rename that lands on a different existing file', () => {
    writeFileSync(join(dataRoot, 'output', 'taken.pdf'), 'pdf')
    writeFileSync(join(dataRoot, 'output', 'other.pdf'), 'pdf')

    assert.throws(() => renameAreaItem('output', 'other.pdf', 'taken.pdf'), /PDF_FILE_ALREADY_EXISTS/)
  })

  it('counts only files, not subfolders, in a folder badge', () => {
    mkdirSync(join(dataRoot, 'output', 'mixed', 'nested'), { recursive: true })
    writeFileSync(join(dataRoot, 'output', 'mixed', 'a.pdf'), 'pdf')

    const listing = listAreaDirectory('output')
    const row = listing.folders.find(folder => folder.name === 'mixed')
    assert.equal(row?.fileCount, 1)

    const node = getAreaFolderTree('output').find(entry => entry.label === 'mixed')
    assert.equal(node?.fileCount, 1)
    assert.equal(node?.children?.length, 1, 'the nested folder is still a child node')
  })

  it('still manages files inside a tool folder', () => {
    assert.ok(deleteAreaItem('output', 'split/pages/page_0001.pdf'))
    assert.equal(existsSync(join(dataRoot, 'output', 'split', 'pages', 'page_0001.pdf')), false)
  })

  it('still lists a tool folder', () => {
    const listing = listAreaDirectory('output')
    assert.ok(listing.folders.some(folder => folder.name === 'split'))
  })
})

// The legacy `word/` folder still exists on disk for files uploaded before the
// two-root layout. It is served under `input` but never written to again.
describe('legacy word folder is read-only', () => {
  it('refuses to upload or delete through the word helpers', () => {
    assert.throws(() => saveSource('missing.pdf', Buffer.alloc(0)), /PDF_EMPTY_UPLOAD/)
    assert.throws(() => removeSource('never-there.pdf'), /PDF_SOURCE_NOT_FOUND/)

    writeFileSync(join(dataRoot, 'word', 'keep-me.docx'), 'docx')
    assert.throws(() => removeInput('keep-me.docx'), /PDF_FILE_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'keep-me.docx')), true)
  })
})

// Files uploaded before `input/` existed are served under `input` while they
// physically sit in `word/`. Reading them must work; changing them must not.
describe('legacy inputs served from the word folder', () => {
  it('resolves a legacy input for reading', () => {
    writeFileSync(join(dataRoot, 'word', 'old-price.docx'), 'docx')

    const resolved = resolveAreaFile('input', 'old-price.docx')
    assert.equal(resolved.path, join(dataRoot, 'word', 'old-price.docx'))
  })

  it('marks the legacy row so the UI hides rename and delete', () => {
    writeFileSync(join(dataRoot, 'word', 'flagged.docx'), 'docx')
    writeFileSync(join(dataRoot, 'input', 'flagged-input.docx'), 'docx')

    const listing = listAreaDirectory('input')
    assert.equal(listing.files.find(file => file.name === 'flagged.docx')?.legacy, true)
    assert.equal(listing.files.find(file => file.name === 'flagged-input.docx')?.legacy, undefined)
  })

  it('refuses to delete or remove a legacy input through the input area', () => {
    writeFileSync(join(dataRoot, 'word', 'guarded.docx'), 'docx')

    assert.throws(() => deleteAreaItem('input', 'guarded.docx'), /PDF_FILE_IMMUTABLE/)
    assert.throws(() => removeInput('guarded.docx'), /PDF_FILE_IMMUTABLE/)
    assert.equal(existsSync(join(dataRoot, 'word', 'guarded.docx')), true)
  })

  it('still deletes a real input', () => {
    writeFileSync(join(dataRoot, 'input', 'temp-input.docx'), 'docx')

    assert.ok(deleteAreaItem('input', 'temp-input.docx'))
    assert.equal(existsSync(join(dataRoot, 'input', 'temp-input.docx')), false)
  })
})

describe('trash restore', () => {
  it('restores a file into its original relative path', () => {
    writeFileSync(join(dataRoot, 'output', 'keep.pdf'), 'pdf')
    const item = moveToTrash('output', join(dataRoot, 'output', 'keep.pdf'), 'keep.pdf')

    const restored = restoreTrashItem(item.id)
    assert.equal(restored.originalName, 'keep.pdf')
    assert.equal(existsSync(join(dataRoot, 'output', 'keep.pdf')), true)
  })

  it('normalises a trash item written under the old area names', async () => {
    const { mkdirSync: mkdir, readFileSync, writeFileSync: write } = await import('node:fs')
    const trashDir = join(dataRoot, '.trash')
    mkdir(trashDir, { recursive: true })
    write(join(trashDir, 'legacy_item'), 'pdf')
    write(join(trashDir, 'trash_metadata.json'), JSON.stringify({
      legacy_item: {
        id: 'legacy_item',
        originalName: 'old.pdf',
        originalRelativePath: 'old.pdf',
        originalPath: join(dataRoot, 'sources', 'old.pdf'),
        area: 'sources',
        isDirectory: false,
        size: 3,
        deletedAt: new Date().toISOString()
      }
    }))

    const { listTrashItems } = await import('../../server/modules/pdf/trash')
    assert.equal(listTrashItems()[0]?.area, 'input')

    restoreTrashItem('legacy_item')
    assert.equal(existsSync(join(dataRoot, 'input', 'old.pdf')), true)
    assert.ok(readFileSync(join(dataRoot, 'input', 'old.pdf'), 'utf8').includes('pdf'))
  })
})

describe('mutations are audited', () => {
  it('records a folder create, a rename and a delete', () => {
    createAreaFolder('input', '', 'audit-src')
    renameAreaItem('input', 'audit-src', 'audit-dst')
    deleteAreaItem('input', 'audit-dst')

    const actions = readAudit().map(event => event.action)
    assert.ok(actions.includes('folder-create'), 'expected folder-create')
    assert.ok(actions.includes('rename'), 'expected rename')
    assert.ok(actions.includes('delete'), 'expected delete')
  })

  it('does not audit a refused legacy-word delete as a mutation', () => {
    writeFileSync(join(dataRoot, 'word', 'denied.docx'), 'docx')
    assert.throws(() => removeInput('denied.docx'), /PDF_FILE_IMMUTABLE/)

    const actions = readAudit().map(event => event.action)
    assert.equal(actions.includes('delete'), true, 'other tests still record deletes')
    assert.equal(
      readAudit().filter(event => event.action === 'delete' && event.target === 'denied.docx').length,
      0,
      'the refused delete must not be logged as performed'
    )
  })
})
