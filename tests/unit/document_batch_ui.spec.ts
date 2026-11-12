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

describe('BatchPanel component', () => {
  const src = read('app/components/document-studio/BatchPanel.vue')
  it('caps concurrency at the operation limit', () => { assert.match(src, /concurrencyCap/) })
  it('locks concurrency to 1 for AI-extract with a hint', () => { assert.match(src, /extractLocked/) })
  it('shows a per-item status badge and progress', () => {
    assert.match(src, /UBadge/)
    assert.match(src, /UProgress/)
  })
  it('offers retry on failed items', () => { assert.match(src, /emit\('retry'/) })
  it('caps the item scroll height', () => { assert.match(src, /max-h-64/) })
  it('uses only token-based motion (no stray animate-*)', () => {
    const stray = [...src.matchAll(/animate-(?!pulse)/g)]
    assert.equal(stray.length, 0)
  })
})

describe('shell batch mode', () => {
  const shell = read('app/components/document-studio/OperationPageShell.vue')
  it('mounts the batch panel in the advanced slot', () => { assert.match(shell, /DocumentStudioBatchPanel/) })
  it('replaces the fake progress with real batch progress', () => {
    assert.match(shell, /batch\.overallProgress|batchOverallProgress/)
    assert.doesNotMatch(shell, /uploading \? 15 : 60/)
  })
  it('renders start/pause/resume/stop controls', () => {
    for (const e of ['batch-start', 'batch-pause', 'batch-resume', 'batch-stop']) assert.match(shell, new RegExp(e))
  })
  const page = read('app/pages/document-studio/tools/[slug].vue')
  it('wires batch state and actions', () => {
    assert.match(page, /page\.batch/)
    assert.match(page, /@batch-start/)
  })
})