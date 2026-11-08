import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

process.env.DOCUMENT_RUNTIME = 'local'

const { dispatcherFor } = await import('../../server/modules/document/dispatcher')
const { DocumentError } = await import('../../server/modules/document/operations')

const MB = 1024 * 1024

function job(operationId: string, runtime: 'local' | 'electron' | 'vercel' | 'worker') {
  return { operationId, runtime } as never
}

describe('job dispatcher (guide §8.6)', () => {
  it('runs everything inline on the local runtime', () => {
    const plan = dispatcherFor('local').plan(job('pdf.rasterize', 'local'), 500 * MB)
    assert.equal(plan.mode, 'inline')
    assert.equal(plan.error, undefined)
  })

  it('runs a bounded operation inside a Function when it fits', () => {
    const plan = dispatcherFor('vercel').plan(job('pdf.split', 'vercel'), 10 * MB)
    assert.equal(plan.mode, 'bounded')
    assert.equal(plan.error, undefined)
  })

  it('routes an oversized Function job to a worker with the measured size', () => {
    // Exporting a large PDF to images expands 6× (pages rendered at scale 2),
    // so 90 MB of input already needs ~540 MB of scratch against a 350 MB cap.
    const plan = dispatcherFor('vercel').plan(job('pdf.export', 'vercel'), 90 * MB)
    assert.equal(plan.mode, 'worker')
    assert.equal(plan.reason, 'scratch-budget-exceeded')
    assert.ok(plan.error instanceof DocumentError)
    assert.equal(plan.error?.code, 'DOCUMENT_WORKER_REQUIRED')
    assert.equal((plan.error?.details as { totalInputBytes?: number })?.totalInputBytes, 90 * MB)
  })

  it('keeps a small job on the Function even when the operation is expensive per byte', () => {
    // 5 MB × 6 = 30 MB of scratch, well inside the budget.
    const plan = dispatcherFor('vercel').plan(job('pdf.export', 'vercel'), 5 * MB)
    assert.equal(plan.mode, 'bounded')
  })

  it('routes an operation that has no Function adapter to a worker, not to a silent failure', () => {
    const raster = dispatcherFor('vercel').plan(job('pdf.rasterize', 'vercel'), 1 * MB)
    assert.equal(raster.mode, 'worker')
    assert.equal(raster.error?.code, 'DOCUMENT_RUNTIME_NOT_SUPPORTED')

    const extract = dispatcherFor('vercel').plan(job('document.ai-extract', 'vercel'), 1 * MB)
    assert.equal(extract.mode, 'worker')
    assert.equal(extract.error?.code, 'DOCUMENT_WORKER_REQUIRED')
  })

  it('lets a real worker accept the heavy operations', () => {
    for (const id of ['pdf.rasterize', 'document.ai-extract', 'pdf.split']) {
      const plan = dispatcherFor('worker').plan(job(id, 'worker'), 500 * MB)
      assert.equal(plan.mode, 'worker')
      assert.equal(plan.error, undefined, `${id} must be acceptable on a worker`)
    }
  })

  it('falls back to the inline dispatcher for an unknown runtime name', () => {
    assert.equal(dispatcherFor('martian' as never).name, 'local-inline')
  })
})
