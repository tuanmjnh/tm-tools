import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  mergePresets,
  parsePresetFile,
  presetFileName,
  serializePresetFile
} from '../../shared/utils/presetTransfer'

// The server module resolves its root at import time, so the env must be set
// before the dynamic import inside the store test.
const dataRoot = mkdtempSync(join(tmpdir(), 'preset-transfer-'))
process.env.PDF_DATA_DIR = dataRoot

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('extraction preset transfer', () => {
  it('round-trips a serialized preset list', () => {
    const json = serializePresetFile([
      { name: 'Price list', description: 'One row per variant', sample: '{"price":12}' }
    ], '2026-11-10T00:00:00.000Z')
    const parsed = parsePresetFile(json)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.entries.length, 1)
    assert.equal(parsed.entries[0]?.name, 'Price list')
    assert.equal(parsed.entries[0]?.description, 'One row per variant')
    assert.equal(parsed.entries[0]?.sample, '{"price":12}')
  })

  it('accepts the bare preset array the server writes to presets.json', () => {
    const parsed = parsePresetFile(JSON.stringify([
      { id: 'a', name: 'Legacy', description: '', sample: '', updatedAt: '2026-01-01T00:00:00.000Z' }
    ]))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.entries.length, 1)
    assert.equal(parsed.entries[0]?.id, 'a')
  })

  it('accepts a single preset object', () => {
    const parsed = parsePresetFile(JSON.stringify({ name: 'Solo', description: 'Only one' }))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.entries.length, 1)
    assert.equal(parsed.entries[0]?.name, 'Solo')
    assert.equal(parsed.entries[0]?.sample, undefined)
  })

  it('rejects text that is not JSON', () => {
    assert.deepEqual(parsePresetFile('name,price'), { ok: false, error: 'not-json' })
  })

  it('rejects JSON with no presets in it', () => {
    assert.deepEqual(parsePresetFile('{}'), { ok: false, error: 'invalid-shape' })
    assert.deepEqual(parsePresetFile('null'), { ok: false, error: 'invalid-shape' })
    assert.deepEqual(parsePresetFile('[1, 2, 3]'), { ok: false, error: 'empty' })
  })

  it('skips entries without a usable name', () => {
    const parsed = parsePresetFile(JSON.stringify([
      { name: 'Kept' },
      { name: '   ' },
      { description: 'no name at all' }
    ]))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.deepEqual(parsed.entries.map(entry => entry.name), ['Kept'])
    assert.equal(parsed.skipped, 2)
  })

  it('clamps and normalizes fields to the server limits', () => {
    const parsed = parsePresetFile(JSON.stringify([{
      name: `  ${'n'.repeat(120)}  `,
      description: `line one\r\nline two${'d'.repeat(7000)}`,
      sample: 's'.repeat(20_000)
    }]))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    const entry = parsed.entries[0]!
    assert.equal(entry.name.length, 80)
    assert.equal(entry.description?.length, 6000)
    assert.equal(entry.description?.startsWith('line one\nline two'), true)
    assert.equal(entry.sample?.length, 16000)
  })

  it('merges without clobbering an id that already exists', () => {
    const result = mergePresets(
      [{ id: 'a' }, { id: 'b' }],
      [
        { id: 'a', name: 'Overwrites? no' },
        { id: 'c', name: 'Fresh id' },
        { name: 'No id at all' }
      ]
    )
    assert.deepEqual(result.added.map(entry => entry.name), ['Fresh id', 'No id at all'])
    assert.equal(result.added[0]?.id, 'c')
    assert.equal(result.added[1]?.id, undefined)
    assert.equal(result.skipped, 1)
    assert.equal(result.overflow, 0)
  })

  it('stops at the preset cap and reports the overflow', () => {
    const existing = Array.from({ length: 39 }, (_, index) => ({ id: `existing-${index}` }))
    const result = mergePresets(existing, [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }])
    assert.equal(result.added.length, 1)
    assert.equal(result.added[0]?.name, 'One')
    assert.equal(result.overflow, 2)
  })

  it('derives a safe file name from the preset name', () => {
    assert.equal(presetFileName('Ghế lãnh đạo — Hòa Phát (The One)'), 'extraction-preset-ghe-lanh-dao-hoa-phat-the-one.json')
    assert.equal(presetFileName('   '), 'extraction-preset.json')
    assert.equal(presetFileName('Đường/ dẫn: bất thường?'), 'extraction-preset-duong-dan-bat-thuong.json')
  })
})

describe('preset import against the real store', () => {
  it('writes the merged presets and refuses a second identical import', async () => {
    const { listPresets, savePreset } = await import('../../server/modules/pdf/extract/presets')

    const seed = savePreset({ name: 'Existing rules', description: 'Already on this device' })
    const file = serializePresetFile([
      { id: seed.id, name: 'Existing rules (renamed in the file)' },
      { name: 'Imported rules', description: 'One row per material', sample: '[{"material":"steel"}]' }
    ])

    const parsed = parsePresetFile(file)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return

    const plan = mergePresets(listPresets(), parsed.entries)
    assert.equal(plan.skipped, 1)
    assert.equal(plan.added.length, 1)

    for (const entry of plan.added) {
      savePreset({
        name: entry.name,
        description: entry.description ?? '',
        sample: entry.sample ?? ''
      })
    }

    const stored = listPresets()
    assert.equal(stored.some(entry => entry.name === 'Imported rules'), true)
    assert.equal(stored.find(entry => entry.id === seed.id)?.name, 'Existing rules')

    const again = mergePresets(stored, parsed.entries.filter(entry => entry.id))
    assert.equal(again.added.length, 0)
    assert.equal(again.skipped, 1)
  })
})
