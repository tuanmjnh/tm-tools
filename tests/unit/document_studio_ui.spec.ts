import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const pages = walk('app/pages/document-studio')
const components = walk('app/components/document-studio')

describe('document studio pages', () => {
  it('never mount the legacy explorer components', () => {
    for (const page of pages) {
      const source = read(page)
      assert.equal(/WorkspaceShell|FolderTree|FileBrowser/.test(source), false, `${page} must not mount the area explorer`)
    }
  })

  it('never import server code or node builtins', () => {
    for (const file of [...pages, ...components]) {
      const source = read(file)
      assert.equal(/from '#server\//.test(source), false, `${file} must not import server modules`)
      assert.equal(/from 'node:/.test(source), false, `${file} must not import node builtins`)
    }
  })

  it('never build a filesystem path for the API', () => {
    for (const file of [...pages, ...components, 'app/composables/useDocumentApi.ts', 'app/composables/useDocumentRun.ts']) {
      const source = read(file)
      assert.equal(/path\.join\(|\/\.data\/|PDF_DATA_DIR/.test(source), false, `${file} must not compose storage paths`)
    }
  })

  it('every page drives the shared operation composable', () => {
    const operationPages = pages.filter(page => page.includes('/tools/'))
    assert.ok(operationPages.length >= 6, 'expected at least six operation pages')
    for (const page of operationPages) {
      assert.match(read(page), /useDocumentOperationPage\('/, `${page} must use the shared binding`)
    }
  })
})

describe('document API client', () => {
  it('only addresses the documents namespace', () => {
    const source = read('app/composables/useDocumentApi.ts')
    assert.match(source, /\/api\/v1\/documents/)
    assert.equal(/\/api\/v1\/pdf/.test(source), false)
  })

  it('sends the raw File objects as multipart, not base64', () => {
    const source = read('app/composables/useDocumentApi.ts')
    assert.match(source, /new FormData\(\)/)
    assert.match(source, /body\.append\('files'/)
    assert.equal(/base64|readAsDataURL/.test(source), false)
  })

  it('maps server errors to DOCUMENT_ codes', () => {
    const source = read('app/composables/useDocumentApi.ts')
    assert.match(source, /DOCUMENT_STORAGE_UNAVAILABLE/)
    assert.match(source, /statusMessage/)
  })
})

describe('document run lifecycle', () => {
  it('creates a draft, uploads, then starts', () => {
    const source = read('app/composables/useDocumentRun.ts')
    const createIndex = source.indexOf('createJob')
    const uploadIndex = source.indexOf('uploadInputs')
    const startIndex = source.indexOf('startJob')
    assert.ok(createIndex > 0 && uploadIndex > createIndex && startIndex > uploadIndex, 'order must be draft → upload → start')
  })

  it('clears the error on every new run', () => {
    const source = read('app/composables/useDocumentRun.ts')
    assert.match(source, /error\.value = null/)
  })
})

describe('operation catalogue', () => {
  it('covers the seven server operation ids exactly once', () => {
    const source = read('app/utils/documentStudio.ts')
    const ids = [...source.matchAll(/id: '([a-z.-]+)'/g)].map(match => match[1])
    assert.deepEqual(ids.sort(), [
      'document.ai-extract',
      'document.convert-to-pdf',
      'pdf.export',
      'pdf.images-to-pdf',
      'pdf.merge',
      'pdf.rasterize',
      'pdf.split'
    ])
  })

  it('points every entry at a page that exists', () => {
    const source = read('app/utils/documentStudio.ts')
    const entries = [...source.matchAll(/id: '([a-z.-]+)',[\s\S]*?route: '([^']+)'/g)]
    assert.equal(entries.length, 7)

    for (const [, id, route] of entries) {
      assert.ok(id && route)
      const page = `app/pages${route}.vue`
      assert.ok(existsSync(join(root, page)), `${id} → ${route} must resolve to ${page}`)
      if (id === 'document.ai-extract') {
        // The completion guide keeps AI extraction on its own page and API
        // instead of porting it to a v4 job.
        assert.equal(route, '/pdf/extract')
      } else {
        assert.ok(route.startsWith('/document-studio/'), `${id} must live under the studio`)
      }
    }
  })

  it('translates every catalogue entry in both locales', () => {
    const source = read('app/utils/documentStudio.ts')
    const keys = [...source.matchAll(/(?:titleKey|descriptionKey): '([^']+)'/g)].map(match => match[1])
    assert.ok(keys.length > 0, 'the catalogue must name its i18n keys')

    for (const locale of ['en', 'vi']) {
      const messages = JSON.parse(read(`i18n/locales/${locale}.json`)) as Record<string, unknown>
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((node, segment) => {
          return node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined
        }, messages)
        assert.equal(typeof value, 'string', `${locale}.json is missing ${key}`)
      }
    }
  })
})

describe('studio home', () => {
  it('labels a job through the catalogue, not by splitting the operation id', () => {
    const source = read('app/pages/document-studio/index.vue')
    assert.match(source, /documentStudioOperation\(/)
    assert.equal(/operationId\.split\('\.'\)/.test(source), false, 'hyphenated ids have no matching i18n key')
  })
})

describe('studio settings', () => {
  it('reads runtime facts from the server instead of hardcoding them', () => {
    const source = read('app/pages/document-studio/settings.vue')
    assert.match(source, /api\.settings\(\)/)
    assert.match(source, /api\.health\(\)/)
    assert.equal(/\/tmp/.test(source), false, 'the cloud scratch path must never reach the page')
  })

  it('defines every settings label in both locales', () => {
    const source = read('app/pages/document-studio/settings.vue')
    const keys = [...source.matchAll(/t\('document\.settings\.([a-zA-Z.]+)'/g)].map(match => `document.settings.${match[1]}`)
    assert.ok(keys.length > 0, 'the page must name its i18n keys')

    for (const locale of ['en', 'vi']) {
      const messages = JSON.parse(read(`i18n/locales/${locale}.json`)) as Record<string, unknown>
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((node, segment) => {
          return node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined
        }, messages)
        assert.equal(typeof value, 'string', `${locale}.json is missing ${key}`)
      }
    }
  })
})

describe('shared shell', () => {
  it('offers exactly one primary run action', () => {
    const source = read('app/components/document-studio/OperationPageShell.vue')
    const primary = [...source.matchAll(/color="primary"/g)]
    const runButton = /label="t\('document\.actions\.run'\)"|t\('document\.actions\.run'\)/
    assert.match(source, runButton)
    assert.ok(primary.length >= 1)
  })

  it('reports the destination the way the runtime actually delivers', () => {
    const source = read('app/components/document-studio/OperationPageShell.vue')
    assert.match(source, /requiresDownloadDelivery/)
    assert.match(source, /document\.output\.downloadHint/)
  })

  it('assembles an inline archive when the runtime publishes no job route', () => {
    const source = read('app/components/document-studio/OperationPageShell.vue')
    assert.match(source, /createInlineZip/)
    assert.match(source, /hasInlineResults/)
  })
})
