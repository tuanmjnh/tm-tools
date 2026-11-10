import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { copyPdfRuntime, resolvePdfRuntime } = require('../../electron/tools/copy-pdf-runtime.cjs')

const workspace = mkdtempSync(join(tmpdir(), 'pdf-runtime-'))

after(() => {
  rmSync(workspace, { recursive: true, force: true })
})

/** Nitro traces `legacy/build/pdf.mjs` only, so the fake worker and its data dirs are missing. */
function fakeOutput(): string {
  const output = join(workspace, 'out')
  mkdirSync(join(output, 'server', 'node_modules', 'pdf-to-img', 'node_modules', 'pdfjs-dist', 'legacy', 'build'), { recursive: true })
  return output
}

describe('pdfjs runtime assets', () => {
  it('resolves the worker, data dirs and canvas from the copy pdf-to-img loads', () => {
    const runtime = resolvePdfRuntime()

    assert.ok(runtime.worker.endsWith(join('legacy', 'build', 'pdf.worker.mjs')), runtime.worker)
    assert.ok(existsSync(runtime.worker))

    const names = runtime.assets.map((asset: { name: string }) => asset.name)
    for (const required of ['standard_fonts', 'cmaps', 'wasm']) {
      assert.ok(names.includes(required), `${required} missing from ${names.join(', ')}`)
    }
    for (const asset of runtime.assets) assert.ok(existsSync(asset.path), asset.path)

    const canvas = runtime.canvas.map((entry: { name: string }) => entry.name)
    assert.ok(canvas.includes('@napi-rs/canvas'), canvas.join(', '))
    const platform = runtime.canvas.find((entry: { name: string }) => entry.name !== '@napi-rs/canvas')
    assert.ok(platform, 'no platform canvas package resolved')
    const binaries = readdirSync(platform.path).filter((name: string) => name.endsWith('.node'))
    assert.ok(binaries.length > 0, `no .node binary in ${platform.path}`)
  })

  it('copies the assets into the built server tree', () => {
    const output = fakeOutput()
    const result = copyPdfRuntime(output)

    const pdfjsDest = join(output, 'server', 'node_modules', 'pdf-to-img', 'node_modules', 'pdfjs-dist')
    assert.ok(existsSync(join(pdfjsDest, 'legacy', 'build', 'pdf.worker.mjs')))
    for (const dir of ['standard_fonts', 'cmaps', 'wasm']) {
      const target = join(pdfjsDest, dir)
      assert.ok(statSync(target).isDirectory(), target)
      assert.ok(readdirSync(target).length > 0, `${target} is empty`)
    }

    const canvasDest = join(output, 'server', 'node_modules', '@napi-rs', 'canvas')
    assert.ok(existsSync(join(canvasDest, 'index.js')), canvasDest)
    const binaries = readdirSync(join(output, 'server', 'node_modules', '@napi-rs'))
      .filter((name: string) => name !== 'canvas')
      .flatMap((name: string) => readdirSync(join(output, 'server', 'node_modules', '@napi-rs', name)))
      .filter((name: string) => name.endsWith('.node'))
    assert.ok(binaries.length > 0, 'no napi canvas binary copied')

    assert.ok(result.pdfjs.endsWith(pdfjsDest), result.pdfjs)
  })

  it('fails loudly when the built server tree is absent', () => {
    assert.throws(() => copyPdfRuntime(join(workspace, 'missing')), /output/i)
  })
})
