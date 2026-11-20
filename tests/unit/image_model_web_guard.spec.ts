import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const ROUTES = [
  'server/api/v1/documents/image-model/install.post.ts',
  'server/api/v1/documents/image-model/status.get.ts'
]

describe('image-model routes refuse the cloud runtime', () => {
  for (const route of ROUTES) {
    it(`${route} guards on detectRuntime vercel`, () => {
      const src = read(route)
      assert.match(src, /detectRuntime/)
      assert.match(src, /'vercel'/)
      assert.match(src, /DOCUMENT_OPERATION_NOT_SUPPORTED/)
    })
  }
})
