import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const shell = 'app/components/document-studio/OperationPageShell.vue'
const extractConfig = 'app/components/document-studio/operations/configs/AiExtractionConfig.vue'

describe('operation shell layout', () => {
  it('constrains the two-column grid to the viewport height', () => {
    const source = read(shell)
    assert.match(source, /lg:grid-rows-\[minmax\(0,1fr\)\]/, 'the grid needs an explicit 1fr row track, otherwise an auto row grows past the panel and the run button is clipped')
    assert.match(source, /overflow-y-auto[^"]*lg:overflow-hidden|lg:overflow-hidden[^"]*overflow-y-auto/, 'the stacked (mobile) columns must scroll before the desktop split takes over')
  })

  it('keeps the run action outside the scrolling configuration area', () => {
    const source = read(shell)
    const scrollStart = source.indexOf('min-h-0 flex-1 flex-col overflow-y-auto')
    const runBar = source.indexOf('shrink-0 space-y-2')
    const runButton = source.indexOf('@click="emit(\'run\')"')
    assert.ok(scrollStart > -1, 'the configuration column needs its own scroll area')
    assert.ok(runBar > scrollStart, 'the action bar must follow the scroll area, not live inside it')
    assert.ok(runButton > runBar, 'the run button must sit in the pinned action bar')
    assert.ok(source.indexOf('<slot name="config" />') > scrollStart, 'the config slot belongs to the scrolling area')
  })
})

describe('extraction preset actions', () => {
  it('exposes create, edit and delete through one dropdown', () => {
    const source = read(extractConfig)
    assert.match(source, /<UDropdownMenu[^>]*:items="presetMenu"/)
    const menu = source.slice(source.indexOf('const presetMenu'), source.indexOf('</script>'))
    assert.match(menu, /openPresetEditor\(\)/)
    assert.match(menu, /openPresetEditor\(selectedPreset/)
    assert.match(menu, /askDeletePreset/)
  })

  it('no longer renders the three separate preset buttons', () => {
    const source = read(extractConfig)
    const field = source.slice(source.indexOf('<!-- Preset selection -->'), source.indexOf('<!-- Export formats -->'))
    assert.equal(field.includes('i-lucide-plus'), false)
    assert.equal(field.includes('i-lucide-pencil'), false)
    assert.equal(field.includes('i-lucide-trash-2'), false)
  })
})
