import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const { pathParam } = await import('../../server/utils/pdfApi')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(rel, out)
    else if (entry.name.endsWith('.ts')) out.push(rel)
  }
  return out
}

describe('pathParam', () => {
  it('decodes an encoded router segment once', () => {
    assert.equal(pathParam(encodeURIComponent('50%.pdf')), '50%.pdf')
    assert.equal(pathParam(encodeURIComponent('giá bán.pdf')), 'giá bán.pdf')
  })

  it('returns a malformed segment unchanged instead of throwing', () => {
    assert.equal(pathParam('50%.pdf'), '50%.pdf')
    assert.equal(pathParam('%E0%A4%A'), '%E0%A4%A')
  })

  it('treats a missing segment as empty', () => {
    assert.equal(pathParam(undefined), '')
    assert.equal(pathParam(null), '')
    assert.equal(pathParam(''), '')
  })
})

describe('url parameter decoding', () => {
  it('never decodes a query value twice', () => {
    const offenders = walk('server/api')
      .filter(file => /decodeURIComponent\(\s*query\./.test(readFileSync(join(root, file), 'utf8')))

    assert.deepEqual(offenders, [], `h3/ufo already decodes query values, so a second decode throws on "%":\n${offenders.join('\n')}`)
  })

  it('decodes router segments through pathParam only', () => {
    const offenders = walk('server/api')
      .filter((file) => {
        const source = readFileSync(join(root, file), 'utf8')
        return /decodeURIComponent\(\s*(name|id)\s*\)/.test(source) && /getRouterParam\(/.test(source)
      })

    assert.deepEqual(offenders, [], `router params arrive still encoded; use pathParam() instead:\n${offenders.join('\n')}`)
  })
})
