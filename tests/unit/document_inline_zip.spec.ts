import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { createInlineZip, crc32, zipEntryName } = await import('../../app/utils/zip')

interface ParsedEntry {
  name: string
  crc: number
  size: number
  data: Buffer
}

/** Reads the browser ZIP without trusting a third-party parser. */
function readZip(buffer: Uint8Array): ParsedEntry[] {
  const zip = Buffer.from(buffer)
  const end = zip.length - 22
  assert.equal(zip.readUInt32LE(end), 0x06054b50, 'end of central directory signature')
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)

  const entries: ParsedEntry[] = []
  for (let index = 0; index < count; index++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'central header signature')
    const crc = zip.readUInt32LE(offset + 16)
    const size = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localOffset = zip.readUInt32LE(offset + 42)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')

    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50, 'local header signature')
    const localName = zip.readUInt16LE(localOffset + 26)
    const localExtra = zip.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localName + localExtra
    entries.push({ name, crc, size, data: zip.subarray(start, start + size) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

describe('inline zip', () => {
  it('stores every entry verbatim with a matching CRC', () => {
    const first = new TextEncoder().encode('%PDF-1.7 page 1')
    const second = new TextEncoder().encode('%PDF-1.7 page 2')
    const zip = createInlineZip([
      { name: 'page_0001.pdf', data: first },
      { name: 'page_0002.pdf', data: second }
    ])

    const entries = readZip(zip)
    assert.equal(entries.length, 2)
    assert.equal(entries[0]!.name, 'page_0001.pdf')
    assert.deepEqual(entries[0]!.data, Buffer.from(first))
    assert.equal(entries[0]!.crc, crc32(first))
    assert.equal(entries[1]!.name, 'page_0002.pdf')
    assert.deepEqual(entries[1]!.data, Buffer.from(second))
  })

  it('flattens a nested name and de-duplicates a collision', () => {
    const used = new Set<string>()
    assert.equal(zipEntryName('a/b/page.pdf', used), 'page.pdf')
    assert.equal(zipEntryName('c/page.pdf', used), 'page (2).pdf')

    const entries = readZip(createInlineZip([
      { name: 'a/page.pdf', data: new Uint8Array([1]) },
      { name: 'b/page.pdf', data: new Uint8Array([2]) }
    ]))
    assert.deepEqual(entries.map(entry => entry.name), ['page.pdf', 'page (2).pdf'])
  })

  it('writes a valid archive when there is nothing to store', () => {
    const zip = createInlineZip([])
    assert.equal(zip.length, 22)
    assert.deepEqual(readZip(zip), [])
  })
})
