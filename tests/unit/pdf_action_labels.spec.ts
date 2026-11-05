import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDF_ACTION_LABELS } from '../../app/composables/usePdfStudio'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const readJson = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'))
const locales = { en: readJson('i18n/locales/en.json'), vi: readJson('i18n/locales/vi.json') }

function lookup(bundle: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) =>
    node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined, bundle)
}

describe('toast action labels', () => {
  it('resolves every action id to a real key in both locales', () => {
    for (const [id, key] of Object.entries(PDF_ACTION_LABELS)) {
      for (const [locale, bundle] of Object.entries(locales)) {
        assert.notEqual(lookup(bundle, key), undefined, `${id} → ${key} is missing from ${locale}.json`)
      }
    }
  })

  it('covers every action the composable passes to run()', () => {
    const source = readFileSync(join(root, 'app/composables/usePdfStudio.ts'), 'utf8')
    const used = new Set([...source.matchAll(/run\('([A-Za-z]+)'/g)].map(match => match[1]!))
    const missing = [...used].filter(id => !(id in PDF_ACTION_LABELS))
    assert.deepEqual(missing, [], `these ids would render a raw key path in a toast:\n${missing.join('\n')}`)
  })
})
