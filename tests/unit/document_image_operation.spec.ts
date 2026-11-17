import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const { DOCUMENT_OPERATIONS, documentOperation } = await import('../../server/modules/document/operations')

describe('image.watermark-remove registration', () => {
  it('is a single-file image operation', () => {
    const op = documentOperation('image.watermark-remove')
    assert.ok(op, 'the operation is registered')
    assert.equal(op.input.mode, 'single-file')
    assert.deepEqual([...op.input.acceptedExtensions].sort(), ['jpeg', 'jpg', 'png', 'webp'])
  })

  it('runs per file with a 50-file batch', () => {
    const op = documentOperation('image.watermark-remove')!
    assert.equal(op.batch?.mode, 'per-file')
    assert.equal(op.batch?.maxFiles, 50)
  })

  it('declares progress support', () => {
    const op = documentOperation('image.watermark-remove')!
    assert.equal(op.execution.supportsProgress, true)
  })

  it('is disabled on vercel with a stated reason', () => {
    const runtime = read('server/modules/document/runtime.ts')
    assert.match(runtime, /'image\.watermark-remove':\s*\{[^}]*enabled:\s*false/)
    assert.match(runtime, /native-canvas-unavailable/)
  })

  it('has a scratch multiplier', () => {
    const runtime = read('server/modules/document/runtime.ts')
    assert.match(runtime, /'image\.watermark-remove':\s*4/)
  })

  it('is offered on the Document Studio home page', () => {
    const studio = read('app/utils/documentStudio.ts')
    assert.match(studio, /image\.watermark-remove/)
    assert.match(studio, /'watermark':\s*'image\.watermark-remove'/)
  })

  it('has labels in both locales', () => {
    for (const locale of ['en', 'vi']) {
      const json = JSON.parse(read(`i18n/locales/${locale}.json`))
      assert.equal(typeof json.document.operations.watermark?.title, 'string', `${locale} title`)
      assert.equal(typeof json.document.operations.watermark?.description, 'string', `${locale} description`)
    }
  })

  it('registers an executor', () => {
    const ops = DOCUMENT_OPERATIONS.map(o => o.id)
    assert.ok(ops.includes('image.watermark-remove'))
    const executors = read('server/modules/document/executors.ts')
    assert.match(executors, /image\.watermark-remove/)
  })
})
