import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-lazy-tree-'))
process.env.PDF_DATA_DIR = dataRoot

const { getAreaFolderTree, getAreaFolderChildren } = await import('../../server/modules/pdf/directory')

before(() => {
  for (const area of ['input', 'output']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  mkdirSync(join(dataRoot, 'input', 'catalogue', '2026', 'q1'), { recursive: true })
  mkdirSync(join(dataRoot, 'input', 'empty'), { recursive: true })
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('depth-limited area tree', () => {
  it('returns the full tree by default', () => {
    const [catalogue] = getAreaFolderTree('input')
    assert.equal(catalogue?.label, 'catalogue')
    assert.equal(catalogue?.children?.[0]?.label, '2026')
    assert.equal(catalogue?.children?.[0]?.children?.[0]?.label, 'q1')
    assert.equal(catalogue?.hasChildren, undefined)
  })

  it('stops at the requested depth and flags the truncation', () => {
    const [catalogue] = getAreaFolderTree('input', 1)
    assert.equal(catalogue?.label, 'catalogue')
    assert.equal(catalogue?.children, undefined)
    assert.equal(catalogue?.hasChildren, true)
  })

  it('does not flag a leaf folder as truncated', () => {
    const empty = getAreaFolderTree('input', 1).find(node => node.label === 'empty')
    assert.equal(empty?.hasChildren, undefined)
  })
})

describe('folder children lookup', () => {
  it('returns only the immediate subfolders', () => {
    const children = getAreaFolderChildren('input', 'catalogue', 1)
    assert.deepEqual(children.map(node => node.label), ['2026'])
    assert.equal(children[0]?.hasChildren, true)
  })

  it('returns the area root children for an empty folder', () => {
    const children = getAreaFolderChildren('input', '', 1)
    assert.deepEqual(
      children.map(node => node.label).filter(label => label === 'catalogue' || label === 'empty').sort(),
      ['catalogue', 'empty']
    )
  })

  it('rejects a folder that does not exist', () => {
    assert.throws(() => getAreaFolderChildren('input', 'missing', 1), /PDF_FOLDER_NOT_FOUND/)
  })

  it('rejects a path that escapes the area', () => {
    assert.throws(() => getAreaFolderChildren('input', '../output', 1), /PDF_INVALID_PATH/)
  })
})
