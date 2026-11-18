import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Per-operation settings survive a reload. The module touches `window`, so a
// minimal Storage stands in for it: the behaviour under test is the merge and
// the read-modify-write, not the browser's implementation.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = readFileSync(join(root, 'app/utils/documentPrefs.ts'), 'utf8')

class MemoryStorage {
  map = new Map<string, string>()
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const store = new MemoryStorage()
;(globalThis as unknown as { window: unknown }).window = { localStorage: store }

const { loadConfig, loadBatchSettings, savePrefs, clearPrefs } = await import('../../app/utils/documentPrefs')

describe('document preferences', () => {
  beforeEach(() => store.map.clear())

  it('returns the caller defaults when nothing was saved', () => {
    const config = loadConfig('pdf.split', { createSubfolder: true })
    assert.deepEqual(config, { createSubfolder: true })
  })

  it('merges saved values over the defaults, so a new field keeps its default', () => {
    savePrefs('document.ai-extract', { config: { model: 'gemini-3.5-flash', formats: ['csv'] } })
    const config = loadConfig('document.ai-extract', { model: '', formats: ['csv'], force: false })
    assert.equal(config.model, 'gemini-3.5-flash')
    assert.deepEqual(config.formats, ['csv'])
    // A field added in a later release is absent from storage, so its default wins.
    assert.equal(config.force, false)
  })

  it('keeps config and pool settings when each is written separately', () => {
    savePrefs('pdf.split', { config: { createSubfolder: false } })
    savePrefs('pdf.split', { concurrency: 4, pauseMs: 150, maxRetry: 2 })
    const config = loadConfig('pdf.split', { createSubfolder: true })
    const pool = loadBatchSettings('pdf.split')
    assert.deepEqual(config, { createSubfolder: false }, 'the config write must survive the pool write')
    assert.equal(pool.concurrency, 4)
    assert.equal(pool.pauseMs, 150)
    assert.equal(pool.maxRetry, 2)
  })

  it('scopes keys per operation so two tools do not overwrite each other', () => {
    savePrefs('pdf.split', { config: { createSubfolder: false } })
    savePrefs('pdf.rasterize', { config: { createSubfolder: true } })
    assert.equal(loadConfig('pdf.split', { createSubfolder: true }).createSubfolder, false)
    assert.equal(loadConfig('pdf.rasterize', { createSubfolder: false }).createSubfolder, true)
  })

  it('survives corrupt storage instead of throwing', () => {
    store.setItem('document_studio:prefs:pdf.split', '{not json')
    assert.deepEqual(loadConfig('pdf.split', { createSubfolder: true }), { createSubfolder: true })
    assert.deepEqual(loadBatchSettings('pdf.split'), {})
  })

  it('forgets an operation on clear', () => {
    savePrefs('pdf.merge', { config: { outputName: 'x' } })
    clearPrefs('pdf.merge')
    assert.deepEqual(loadConfig('pdf.merge', { outputName: '' }), { outputName: '' })
  })

  it('reads nothing when there is no window (server render)', () => {
    // The composable is imported by pages that a SPA still renders once on the
    // server; touching localStorage there would throw.
    assert.match(source, /typeof window === 'undefined'/)
  })
})
