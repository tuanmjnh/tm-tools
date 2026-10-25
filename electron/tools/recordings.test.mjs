/**
 * Retention rule for transcription-only command captures (roadmap v1 §4).
 * Run: node --test electron/tools/recordings.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { pruneCommandRecordings } = require('./recordings.cjs')

const HOUR = 60 * 60 * 1000

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tmcut-recordings-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('prunes only stale command captures', () => {
  withDir((dir) => {
    const now = 1_800_000_000_000
    writeFileSync(join(dir, `command-${now - 48 * HOUR}.webm`), 'old')
    writeFileSync(join(dir, `command-${now - HOUR}.webm`), 'fresh')
    // Never a sweep target: voiceover takes are imported project assets.
    writeFileSync(join(dir, `voiceover-${now - 48 * HOUR}.webm`), 'take')
    writeFileSync(join(dir, 'notes.txt'), 'other')

    const result = pruneCommandRecordings(dir, { now })
    assert.deepEqual(result, { removed: 1, kept: 1, failed: 0 })
    const left = readdirSync(dir).sort()
    assert.equal(left.length, 3)
    assert.ok(left.includes(`command-${now - HOUR}.webm`))
    assert.ok(left.includes(`voiceover-${now - 48 * HOUR}.webm`))
    assert.ok(left.includes('notes.txt'))
  })
})

test('a missing directory is a no-op', () => {
  const result = pruneCommandRecordings(join(tmpdir(), 'tmcut-does-not-exist-xyz'), { now: Date.now() })
  assert.deepEqual(result, { removed: 0, kept: 0, failed: 0 })
})

test('honours a custom retention window', () => {
  withDir((dir) => {
    const now = 1_800_000_000_000
    writeFileSync(join(dir, `command-${now - 2 * HOUR}.webm`), 'two-hours')
    assert.equal(pruneCommandRecordings(dir, { now, maxAgeMs: 6 * HOUR }).removed, 0)
    assert.equal(pruneCommandRecordings(dir, { now, maxAgeMs: HOUR }).removed, 1)
  })
})
