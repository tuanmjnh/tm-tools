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
  it('caps concurrency at the operation limit', () => {
    assert.match(src, /concurrencyCap/)
  })
  it('locks concurrency to 1 for AI-extract with a hint', () => {
    assert.match(src, /extractLocked/)
  })
  it('shows a per-item status badge and progress', () => {
    assert.match(src, /UBadge/)
    assert.match(src, /UProgress/)
  })
  it('offers retry on failed items', () => {
    assert.match(src, /emit\('retry'/)
  })
  it('caps the item scroll height', () => {
    assert.match(src, /max-h-64/)
  })
  it('uses only token-based motion (no stray animate-*)', () => {
    const stray = [...src.matchAll(/animate-(?!pulse)/g)]
    assert.equal(stray.length, 0)
  })
})

describe('shell batch mode', () => {
  const shell = read('app/components/document-studio/OperationPageShell.vue')
  it('mounts the batch panel in the advanced slot', () => {
    assert.match(shell, /DocumentStudioBatchPanel/)
  })
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

// The friendly routes (/tools/extract, /split, …) resolve to these STATIC pages,
// which shadow [slug].vue. They are the real contract surface: a per-file run is
// routed to batch.start() + selection.clear() by the funnel, so each page MUST
// hand the shell the batch view model or the run executes invisibly.
describe('live per-file tool pages wire batch', () => {
  for (const name of ['extract', 'split', 'convert', 'export', 'images']) {
    const src = read(`app/pages/document-studio/tools/${name}.vue`)
    it(`${name} passes the batch view model to the shell`, () => {
      assert.match(src, /:batch="page\.batchViewModel\.value"/)
    })
    it(`${name} renders batch results, not single-session artifacts`, () => {
      assert.match(src, /:artifacts="page\.resultArtifacts\.value"/)
    })
    it(`${name} wires batch start and lifecycle controls`, () => {
      assert.match(src, /@batch-start/)
      assert.match(src, /@batch-pause="page\.batch\.pause"/)
      assert.match(src, /@batch-resume="page\.batch\.resume"/)
      assert.match(src, /@batch-stop="page\.batch\.stop"/)
      assert.match(src, /@batch-retry="page\.batch\.retryItem"/)
    })
    it(`${name} forwards concurrency, pause and retry settings`, () => {
      assert.match(src, /@update:concurrency="page\.batch\.setConcurrency"/)
      assert.match(src, /@update:pause-ms="page\.batch\.setPauseMs"/)
      assert.match(src, /@update:max-retry="page\.batch\.setMaxRetry"/)
    })
    it(`${name} allows multi-file selection`, () => {
      assert.match(src, /:multiple="page\.multiple\.value"/)
    })
    it(`${name} routes artifact deletion through the funnel`, () => {
      assert.match(src, /@deleted="page\.removeArtifact"/)
    })
  }
})

describe('operation funnel exposes batch view helpers', () => {
  const src = read('app/composables/useDocumentOperationPage.ts')
  it('derives a batch view model only for per-file ops', () => {
    assert.match(src, /batchViewModel/)
    assert.match(src, /isPerFileBatch\.value \? batch\.viewModel\.value : null/)
  })
  it('routes results to batch or session by operation kind', () => {
    assert.match(src, /resultArtifacts/)
    assert.match(src, /isPerFileBatch\.value \? batch\.artifacts\.value : session\.artifacts\.value/)
  })
  it('dispatches artifact deletion to batch or session', () => {
    assert.match(src, /function removeArtifact/)
    assert.match(src, /batch\.removeArtifact/)
    assert.match(src, /session\.removeArtifact/)
  })
})
