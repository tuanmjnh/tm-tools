import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const { documentOperation } = await import('../../server/modules/document/operations')

describe('image.background-remove registration', () => {
  it('is a single-file image operation', () => {
    const op = documentOperation('image.background-remove')
    assert.ok(op)
    assert.equal(op.input.mode, 'single-file')
    assert.deepEqual([...op.input.acceptedExtensions].sort(), ['jpeg', 'jpg', 'png', 'webp'])
  })

  it('declares progress support', () => {
    assert.equal(documentOperation('image.background-remove')!.execution.supportsProgress, true)
  })

  it('is disabled on vercel', () => {
    assert.match(read('server/modules/document/runtime.ts'), /'image\.background-remove':\s*\{[^}]*enabled:\s*false/)
  })

  it('is offered on the home page with a slug', () => {
    const studio = read('app/utils/documentStudio.ts')
    assert.match(studio, /image\.background-remove/)
    assert.match(studio, /'remove-bg':\s*'image\.background-remove'/)
  })

  it('has labels in both locales', () => {
    for (const locale of ['en', 'vi']) {
      const json = JSON.parse(read(`i18n/locales/${locale}.json`))
      assert.equal(typeof json.document.operations.removeBackground?.title, 'string')
      assert.equal(typeof json.document.operations.removeBackground?.description, 'string')
    }
  })

  it('registers an executor', () => {
    assert.match(read('server/modules/document/executors.ts'), /image\.background-remove/)
  })
})
