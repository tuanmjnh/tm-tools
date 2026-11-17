import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { verifyModel } = await import('../../server/modules/image/model-store')
const { maskFromImage } = await import('../../server/modules/image/matte')

describe('model store', () => {
  it('accepts a file whose hash matches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-'))
    try {
      const file = join(dir, 'm.onnx')
      writeFileSync(file, 'hello')
      const hash = createHash('sha256').update('hello').digest('hex')
      assert.equal(verifyModel(file, hash), true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a file whose hash does not match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-'))
    try {
      const file = join(dir, 'm.onnx')
      writeFileSync(file, 'tampered')
      const hash = createHash('sha256').update('hello').digest('hex')
      assert.equal(verifyModel(file, hash), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a missing file rather than throwing', () => {
    assert.equal(verifyModel(join(tmpdir(), 'definitely-absent.onnx'), 'abc'), false)
  })

  it('refuses to infer without an installed model', async () => {
    await assert.rejects(
      maskFromImage({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
      /IMAGE_MODEL_MISSING/
    )
  })
})
