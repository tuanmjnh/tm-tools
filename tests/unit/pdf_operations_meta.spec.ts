import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PDF_FILE_AREAS } from '../../shared/types/pdf'
import { PDF_OPERATIONS, PDF_OPERATION_GROUPS, pdfOperation } from '../../app/utils/pdfOperations'
import { outputMapping } from '../../server/modules/pdf/workspace'

describe('PDF_OPERATIONS', () => {
  it('describes every running operation exactly once', () => {
    const ids = PDF_OPERATIONS.map(operation => operation.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.deepEqual([...ids].sort(), [
      'convertInput',
      'export',
      'extract',
      'imagesToPdf',
      'merge',
      'rasterize',
      'split'
    ])
  })

  it('maps every operation to a real server output key', () => {
    const serverKeys = Object.keys(outputMapping)
    for (const operation of PDF_OPERATIONS) {
      assert.ok(
        serverKeys.includes(operation.output.mappingKey),
        `${operation.id} → ${operation.output.mappingKey} is not in outputMapping`
      )
    }
  })

  it('never declares an operation over an unknown area', () => {
    for (const operation of PDF_OPERATIONS) {
      for (const area of operation.input.areas) {
        assert.ok(
          (PDF_FILE_AREAS as readonly string[]).includes(area),
          `${operation.id} targets unknown area ${area}`
        )
      }
    }
  })

  it('keeps every operation single-input', () => {
    for (const operation of PDF_OPERATIONS) {
      assert.ok(
        operation.input.mode === 'single-file' || operation.input.mode === 'folder',
        `${operation.id} uses an unsupported input mode`
      )
    }
  })

  it('groups every operation under a declared Home group', () => {
    for (const operation of PDF_OPERATIONS) {
      assert.ok(
        PDF_OPERATION_GROUPS.includes(operation.group),
        `${operation.id} has an unknown group`
      )
    }
  })

  it('only marks the job-backed operation as async and cancellable', () => {
    const asyncOps = PDF_OPERATIONS.filter(operation => operation.execution.mode === 'async')
    assert.deepEqual(asyncOps.map(operation => operation.id), ['extract'])
    assert.equal(asyncOps[0]?.execution.supportsCancel, true)
  })

  it('rejects an unknown operation id instead of returning undefined', () => {
    // @ts-expect-error — the guard is what is under test.
    assert.throws(() => pdfOperation('compress'), /Unknown PDF operation/)
  })
})
