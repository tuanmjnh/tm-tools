import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Config reads PDF_DATA_DIR at import time, so the temp root must exist first.
const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-workspace-'))
process.env.PDF_DATA_DIR = dataRoot

const workspace = await import('../../server/modules/pdf/workspace')

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('workspace repair', () => {
  it('recreates every missing area root', () => {
    const before = workspace.workspaceReport()
    assert.equal(before.needsRepair, true)

    const result = workspace.repairWorkspace()
    assert.ok(result.created.length > 0)
    for (const area of result.created) {
      assert.ok(existsSync(join(dataRoot, area)))
    }
    assert.equal(result.needsRepair, false)
    assert.equal(workspace.workspaceReport().needsRepair, false)
  })

  it('creates nothing when every area already exists', () => {
    const result = workspace.repairWorkspace()
    assert.deepEqual(result.created, [])
    assert.equal(result.needsRepair, false)
  })

  it('never touches existing files', () => {
    const sample = join(dataRoot, 'sources', 'keep-me.pdf')
    writeFileSync(sample, 'pdf')
    rmSync(join(dataRoot, 'split'), { recursive: true, force: true })

    const result = workspace.repairWorkspace()
    assert.deepEqual(result.created, ['split'])
    assert.ok(existsSync(sample))
  })
})
