import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dataRoot = mkdtempSync(join(tmpdir(), 'pdf-presets-'))
process.env.PDF_DATA_DIR = dataRoot

const { deletePreset, getPreset, listPresets, savePreset }
  = await import('../../server/modules/pdf/extract/presets')

after(() => {
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('extraction presets', () => {
  it('refuses a preset without a name', () => {
    assert.throws(() => savePreset({ name: '   ' }), /PDF_PRESET_NAME_REQUIRED/)
  })

  it('creates, updates and deletes a preset', () => {
    const created = savePreset({
      name: 'Price list',
      description: 'One row per material variant',
      sample: '{"material":"steel","price":12}'
    })
    assert.ok(created.id)
    assert.equal(created.name, 'Price list')
    assert.equal(getPreset(created.id)?.sample, '{"material":"steel","price":12}')

    const updated = savePreset({ id: created.id, name: 'Price list v2', description: 'Updated rules' })
    assert.equal(updated.id, created.id)
    assert.equal(getPreset(created.id)?.name, 'Price list v2')
    assert.equal(getPreset(created.id)?.description, 'Updated rules')

    assert.equal(deletePreset(created.id), true)
    assert.equal(getPreset(created.id), null)
    assert.equal(deletePreset(created.id), false)
  })

  it('keeps presets in the deployment pdf root', () => {
    const preset = savePreset({ name: 'Root check' })
    assert.equal(listPresets().some(entry => entry.id === preset.id), true)
    deletePreset(preset.id)
  })

  it('rejects the preset past the storage limit', () => {
    for (let index = 0; index < 40; index++) savePreset({ name: `Preset ${index}` })
    assert.throws(() => savePreset({ name: 'Preset 41' }), /PDF_PRESET_LIMIT/)
  })
})
