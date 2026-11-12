import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const load = (loc: string) => JSON.parse(read(`i18n/locales/${loc}.json`))

const KEYS = ['title', 'concurrency', 'concurrencyHint', 'pauseBetween', 'maxRetry', 'start', 'pause', 'resume', 'stop', 'retry', 'overall', 'empty', 'extractLocked']
const STATUS = ['waiting', 'running', 'done', 'failed', 'cancelled', 'retrying']

describe('batch i18n', () => {
  for (const loc of ['en', 'vi']) {
    it(`has every batch key in ${loc}`, () => {
      const batch = load(loc).document.batch
      assert.ok(batch, `${loc} document.batch missing`)
      for (const k of KEYS) assert.equal(typeof batch[k], 'string', `${loc} batch.${k}`)
      for (const s of STATUS) assert.equal(typeof batch.status?.[s], 'string', `${loc} batch.status.${s}`)
    })
  }
})