import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('tool shell unavailable panel', () => {
  const shell = read('app/components/document-studio/OperationPageShell.vue')
  it('declares the availability props', () => {
    assert.match(shell, /available\??:\s*boolean/)
    assert.match(shell, /unavailableReason\??:/)
  })
  it('renders a panel gated on !available', () => {
    assert.match(shell, /!available && !loadingDefinition/)
    assert.match(shell, /document\.unavailable/)
  })

  const PAGES = ['split', 'merge', 'convert', 'export', 'images', 'images-to-pdf', 'extract', 'watermark', 'remove-bg', 'image-convert', 'structured-convert']
  for (const page of PAGES) {
    it(`${page}.vue passes availability to the shell`, () => {
      const src = read(`app/pages/document-studio/tools/${page}.vue`)
      assert.match(src, /:available="page\.entry\.value\.available"/)
      assert.match(src, /:unavailable-reason="page\.entry\.value\.unavailableReason"/)
    })
  }
})

describe('operation funnel exposes availability entry', () => {
  it('returns entry with available and unavailableReason', () => {
    const src = read('app/composables/useDocumentOperationPage.ts')
    assert.match(src, /entry: computed\(\(\) => entry\.value\)/)
    assert.match(src, /unavailableReason/)
  })
})

describe('unavailable-panel i18n', () => {
  for (const loc of ['en', 'vi']) {
    it(`has document.unavailable in ${loc}`, () => {
      const json = JSON.parse(read(`i18n/locales/${loc}.json`))
      assert.equal(typeof json.document.unavailable?.title, 'string')
      assert.equal(typeof json.document.unavailable?.default, 'string')
    })
  }
})
