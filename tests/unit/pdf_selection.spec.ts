import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computed, ref } from 'vue'

// The composable relies on Nuxt auto-imports; the spec provides them globally.
Object.assign(globalThis, { ref, computed })

const { usePdfSelection } = await import('../../app/composables/usePdfSelection')

describe('usePdfSelection', () => {
  it('accepts a file in the declared area', () => {
    const selection = usePdfSelection('split')
    assert.equal(selection.pickFile({ area: 'sources', relativePath: 'a.pdf', name: 'a.pdf' }), true)
    assert.equal(selection.selection.value?.mode, 'single-file')
    assert.equal(selection.isValid.value, true)
  })

  it('refuses a folder for a file operation', () => {
    const selection = usePdfSelection('split')
    const verdict = selection.compatible({ area: 'sources', relativePath: 'a', name: 'a', kind: 'folder' })
    assert.equal(verdict.ok, false)
    assert.equal(verdict.reason, 'pdf.selection.needsFile')
    assert.equal(selection.pickFolder({ area: 'sources', relativePath: 'a', name: 'a' }), false)
    assert.equal(selection.selection.value, null)
  })

  it('refuses a file for a folder operation', () => {
    const selection = usePdfSelection('merge')
    const verdict = selection.compatible({ area: 'split', relativePath: 'a/page_0001.pdf', name: 'page_0001.pdf', kind: 'file' })
    assert.equal(verdict.ok, false)
    assert.equal(verdict.reason, 'pdf.selection.needsFolder')
    assert.equal(selection.pickFile({ area: 'split', relativePath: 'a', name: 'a' }), false)
  })

  it('refuses an area the operation cannot start from', () => {
    const selection = usePdfSelection('split')
    const verdict = selection.compatible({ area: 'inputs', relativePath: 'a.pdf', name: 'a.pdf', kind: 'file' })
    assert.equal(verdict.ok, false)
    assert.equal(verdict.reason, 'pdf.selection.wrongArea')
  })

  it('replaces the previous selection instead of accumulating', () => {
    const selection = usePdfSelection('extract')
    selection.pickFile({ area: 'sources', relativePath: 'a.pdf', name: 'a.pdf' })
    selection.pickFile({ area: 'sources', relativePath: 'b.pdf', name: 'b.pdf' })
    assert.equal(selection.selection.value?.item.relativePath, 'b.pdf')
  })

  it('clears back to no selection', () => {
    const selection = usePdfSelection('extract')
    selection.pickFile({ area: 'sources', relativePath: 'a.pdf', name: 'a.pdf' })
    selection.clear()
    assert.equal(selection.selection.value, null)
    assert.equal(selection.isValid.value, false)
  })
})
