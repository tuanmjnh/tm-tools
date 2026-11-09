/**
 * The packaged Nitro server must contain NO symlinks: @electron/asar stores a
 * root-relative `link` record that Electron's archive reader cannot resolve,
 * which produced `ENOENT .output\server\node_modules\.nitro\readable-stream@3.6.2
 * not found in app.asar` on every route importing an executor.
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, lstatSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { dereferenceLinks, findLinks } = require('../../electron/tools/dereference-links.cjs')

const dir = mkdtempSync(join(tmpdir(), 'tm-links-'))
after(() => rmSync(dir, { recursive: true, force: true }))

function tree() {
  const root = join(dir, `root-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(root, 'node_modules', '.nitro', 'readable-stream@3.6.2'), { recursive: true })
  writeFileSync(join(root, 'node_modules', '.nitro', 'readable-stream@3.6.2', 'index.js'), 'module.exports = 1\n')
  symlinkSync(join(root, 'node_modules', '.nitro', 'readable-stream@3.6.2'), join(root, 'node_modules', 'readable-stream'), 'dir')
  mkdirSync(join(root, 'nested'), { recursive: true })
  symlinkSync(join(root, 'node_modules', 'readable-stream'), join(root, 'nested', 'alias'), 'dir')
  return root
}

function walkLinks(root: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, name.name)
    if (lstatSync(full).isSymbolicLink()) out.push(full)
    else if (name.isDirectory()) out.push(...walkLinks(full))
  }
  return out
}

describe('dereferenceLinks — asar-safe build output', () => {
  it('finds every symlink without following it', () => {
    const root = tree()
    assert.equal(findLinks(root).length, 2)
  })

  it('replaces links with real directories and keeps the bytes', () => {
    const root = tree()
    const result = dereferenceLinks(root)
    assert.equal(result.replaced, 2)
    assert.deepEqual(walkLinks(root), [])
    assert.equal(readFileSync(join(root, 'node_modules', 'readable-stream', 'index.js'), 'utf8'), 'module.exports = 1\n')
    assert.equal(readFileSync(join(root, 'nested', 'alias', 'index.js'), 'utf8'), 'module.exports = 1\n')
    assert.equal(lstatSync(join(root, 'node_modules', 'readable-stream')).isDirectory(), true)
  })

  it('drops the now-unreferenced .nitro target so the package is not duplicated', () => {
    const root = tree()
    dereferenceLinks(root)
    assert.equal(existsSync(join(root, 'node_modules', '.nitro', 'readable-stream@3.6.2')), false)
  })

  it('is idempotent — a second pass replaces nothing', () => {
    const root = tree()
    dereferenceLinks(root)
    assert.equal(dereferenceLinks(root).replaced, 0)
    assert.equal(readFileSync(join(root, 'node_modules', 'readable-stream', 'index.js'), 'utf8'), 'module.exports = 1\n')
  })

  it('a missing root is a no-op, not a crash', () => {
    assert.deepEqual(dereferenceLinks(join(dir, 'nope')), { replaced: 0, removed: 0 })
  })

  it('dereferences a link pointing outside the root instead of dropping it', () => {
    const root = join(dir, `outside-${Math.random().toString(36).slice(2)}`)
    const external = join(dir, `external-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
    mkdirSync(external, { recursive: true })
    writeFileSync(join(external, 'data.txt'), 'external bytes')
    symlinkSync(external, join(root, 'vendor'), 'dir')
    const result = dereferenceLinks(root)
    assert.equal(result.replaced, 1)
    assert.equal(result.removed, 0)
    assert.equal(readFileSync(join(root, 'vendor', 'data.txt'), 'utf8'), 'external bytes')
    assert.equal(existsSync(join(external, 'data.txt')), true)
    assert.deepEqual(walkLinks(root), [])
  })
})
