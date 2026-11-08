import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Config reads PDF_DATA_DIR at import time, so the temp root must exist first.
const root = mkdtempSync(join(tmpdir(), 'pdf-escape-'))
const dataRoot = join(root, 'pdf')
const outside = join(root, 'outside')
process.env.PDF_DATA_DIR = dataRoot

mkdirSync(join(dataRoot, 'input'), { recursive: true })
mkdirSync(outside, { recursive: true })
writeFileSync(join(outside, 'secret.pdf'), 'TOP-SECRET')

const { listAreaDirectory, getAreaFolderTree, renameAreaItem, deleteAreaItem } = await import('../../server/modules/pdf/directory')
const { resolveAreaFile } = await import('../../server/modules/pdf/inspect')

// Windows refuses file symlinks without elevation but always allows junctions.
const linkType = process.platform === 'win32' ? 'junction' : 'dir'
const linked = (() => {
  try {
    symlinkSync(outside, join(dataRoot, 'input', 'escape'), linkType)
    return true
  } catch {
    return false
  }
})()

after(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('directory links cannot escape the area root', { skip: linked ? false : 'symlink not permitted on this host' }, () => {
  it('refuses to resolve a file reached through a link', () => {
    assert.throws(() => resolveAreaFile('input', 'escape/secret.pdf'), /PDF_INVALID_PATH/)
  })

  it('does not list the link as a folder', () => {
    const listing = listAreaDirectory('input')
    assert.deepEqual(listing.folders.map(folder => folder.name), [])
  })

  it('does not build a tree node for the link', () => {
    assert.deepEqual(getAreaFolderTree('input'), [])
  })

  it('refuses to read the link as a folder', () => {
    assert.throws(() => listAreaDirectory('input', 'escape'), /PDF_INVALID_PATH/)
  })

  it('refuses to rename or delete through the link', () => {
    assert.throws(() => renameAreaItem('input', 'escape/secret.pdf', 'stolen.pdf'), /PDF_INVALID_PATH/)
    assert.throws(() => deleteAreaItem('input', 'escape/secret.pdf'), /PDF_INVALID_PATH/)
  })

  it('still resolves a real file inside the area', () => {
    writeFileSync(join(dataRoot, 'input', 'real.pdf'), 'pdf')
    assert.equal(resolveAreaFile('input', 'real.pdf').name, 'real.pdf')
  })
})
