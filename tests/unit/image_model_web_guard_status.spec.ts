/**
 * The ISNet model is installed into a writable data directory and is served by
 * the local/Electronic runtime only. A hosted runtime has neither the directory
 * nor the native engine, so both routes must answer 501 (not 404): the route
 * exists, the runtime cannot serve it. The spec pins the code because the shared
 * status map assigns 501 only to DOCUMENT_RUNTIME_NOT_SUPPORTED.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')

for (const file of [
  'server/api/v1/documents/image-model/status.get.ts',
  'server/api/v1/documents/image-model/install.post.ts'
]) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(source, /detectRuntime\(\)\s*===\s*'vercel'/, `${file} must guard the vercel runtime`)
  assert.match(
    source,
    /DOCUMENT_RUNTIME_NOT_SUPPORTED/,
    `${file} must answer 501 via DOCUMENT_RUNTIME_NOT_SUPPORTED, not 404`
  )
  assert.doesNotMatch(
    source,
    /DOCUMENT_OPERATION_NOT_SUPPORTED/,
    `${file} must not use the 404 operation code for a runtime refusal`
  )
}

const operations = readFileSync(join(root, 'server/modules/document/operations.ts'), 'utf8')
assert.match(
  operations,
  /DOCUMENT_RUNTIME_NOT_SUPPORTED:\s*501/,
  'DOCUMENT_RUNTIME_NOT_SUPPORTED must map to 501'
)

console.log('image_model_web_guard.spec: all assertions passed')
