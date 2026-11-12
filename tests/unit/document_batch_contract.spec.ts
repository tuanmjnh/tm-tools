import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { DOCUMENT_OPERATIONS, documentOperation } = await import('../../server/modules/document/operations')

const PER_FILE = ['pdf.split', 'pdf.rasterize', 'document.convert-to-pdf', 'pdf.export', 'document.ai-extract']
const COMBINE = ['pdf.merge', 'pdf.images-to-pdf']

describe('batch contract', () => {
  it('marks every per-file op as a per-file batch with a 50-file selection cap', () => {
    for (const id of PER_FILE) {
      const op = documentOperation(id)!
      assert.equal(op.batch?.mode, 'per-file', `${id} batch.mode`)
      assert.equal(op.batch?.maxFiles, 50, `${id} batch.maxFiles`)
    }
  })

  it('keeps per-job cardinality at one input for per-file ops', () => {
    for (const id of PER_FILE) {
      const op = documentOperation(id)!
      assert.equal(op.input.maxFiles, 1, `${id} input.maxFiles must stay 1`)
      assert.equal(op.input.mode, 'single-file', `${id} input.mode must stay single-file`)
    }
  })

  it('forces AI-extract concurrency to 1', () => {
    assert.equal(documentOperation('document.ai-extract')!.batch?.maxConcurrency, 1)
  })

  it('leaves combine ops without a batch field (N→1 semantics)', () => {
    for (const id of COMBINE) {
      assert.equal(documentOperation(id)!.batch, undefined, `${id} must not be per-file batch`)
    }
  })

  it('does not change the operation count', () => {
    assert.equal(DOCUMENT_OPERATIONS.length, 7)
  })
})
