import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { writeFileAtomic } = await import('../../server/modules/pdf/paths')

let dir = ''

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdf-atomic-'))
})

after(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeFileAtomic', () => {
  it('writes a new file', () => {
    const target = join(dir, 'new.pdf')
    writeFileAtomic(target, Buffer.from('pdf-bytes'))

    assert.equal(readFileSync(target, 'utf8'), 'pdf-bytes')
  })

  it('replaces an existing file completely', () => {
    const target = join(dir, 'replace.pdf')
    writeFileSync(target, 'a-much-longer-old-payload')
    writeFileAtomic(target, Buffer.from('new'))

    assert.equal(readFileSync(target, 'utf8'), 'new')
  })

  it('writes text when given a string', () => {
    const target = join(dir, 'rows.csv')
    writeFileAtomic(target, 'a,b\n1,2\n', 'utf8')

    assert.equal(readFileSync(target, 'utf8'), 'a,b\n1,2\n')
  })

  it('leaves no temporary file behind', () => {
    writeFileAtomic(join(dir, 'clean.pdf'), Buffer.from('x'))

    const leftovers = readdirSync(dir).filter(name => name.startsWith('.'))
    assert.deepEqual(leftovers, [])
  })

  it('keeps the old file when the target cannot be written', () => {
    const target = join(dir, 'guarded.pdf')
    writeFileSync(target, 'original')

    const error = (() => {
      try {
        writeFileAtomic(join(dir, 'missing-dir', 'nope.pdf'), Buffer.from('x'))
        return null
      } catch (caught) {
        return caught as NodeJS.ErrnoException
      }
    })()

    assert.equal(error?.code, 'ENOENT')
    assert.equal(readFileSync(target, 'utf8'), 'original')
  })
})
