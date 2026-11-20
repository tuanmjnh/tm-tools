import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))

describe('vercel config', () => {
  it('enables git deployment', () => {
    assert.equal(config.git?.deploymentEnabled, true)
  })
  it('keeps a schema reference', () => {
    assert.ok(config.$schema)
  })
})
