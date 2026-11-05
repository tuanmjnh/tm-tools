import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-lazy-tree-'))
process.env.PDF_DATA_DIR = dataRoot

const { getAreaFolderTree, getAreaFolderChildren } = await import('../../server/modules/pdf/directory')

before(() => {
  for (const area of ['sources', 'inputs', 'word', 'split', 'images', 'merged', 'products', 'office']) {
    mkdirSync(join(dataRoot, area), { recursive: true })
  }
  mkdirSync(join(dataRoot, 'sources', 'catalogue', '2026', 'q1'), { recursive: true })
  mkdirSync(join(dataRoot, 'sources', 'empty'), { recursive: true })
})

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('depth-limited area tree', () => {
  it('returns the full tree by default', () => {
    const [catalogue] = getAreaFolderTree('sources')
    assert.equal(catalogue?.label, 'catalogue')
    assert.equal(catalogue?.children?.[0]?.label, '2026')
    assert.equal(catalogue?.children?.[0]?.children?.[0]?.label, 'q1')
    assert.equal(catalogue?.hasChildren, undefined)
  })

  it('stops at the requested depth and flags the truncation', () => {
    const [catalogue] = getAreaFolderTree('sources', 1)
    assert.equal(catalogue?.label, 'catalogue')
    assert.equal(catalogue?.children, undefined)
    assert.equal(catalogue?.hasChildren, true)
  })

  it('does not flag a leaf folder as truncated', () => {
    const empty = getAreaFolderTree('sources', 1).find(node => node.label === 'empty')
    assert.equal(empty?.hasChildren, undefined)
  })
})

describe('folder children lookup', () => {
  it('returns only the immediate subfolders', () => {
    const children = getAreaFolderChildren('sources', 'catalogue', 1)
    assert.deepEqual(children.map(node => node.label), ['2026'])
    assert.equal(children[0]?.hasChildren, true)
  })

  it('returns the area root children for an empty folder', () => {
    const children = getAreaFolderChildren('sources', '', 1)
    assert.deepEqual(children.map(node => node.label).sort(), ['catalogue', 'empty'])
  })

  it('rejects a folder that does not exist', () => {
    assert.throws(() => getAreaFolderChildren('sources', 'missing', 1), /PDF_FOLDER_NOT_FOUND/)
  })

  it('rejects a path that escapes the area', () => {
    assert.throws(() => getAreaFolderChildren('sources', '../inputs', 1), /PDF_INVALID_PATH/)
  })
})
