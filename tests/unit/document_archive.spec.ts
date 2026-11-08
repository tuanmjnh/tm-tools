import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inflateRawSync } from 'node:zlib'

const { createZipStream, crc32, zipEntryName } = await import('../../server/modules/document/archive')

const scratch = mkdtempSync(join(tmpdir(), 'document-archive-'))

after(() => rmSync(scratch, { recursive: true, force: true }))

interface ParsedEntry {
  name: string
  data: Buffer
}

/** Reads a ZIP produced by the writer without trusting a third-party parser. */
function readZip(buffer: Buffer): ParsedEntry[] {
  const end = buffer.length - 22
  assert.equal(buffer.readUInt32LE(end), 0x06054b50, 'end of central directory signature')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)

  const entries: ParsedEntry[] = []
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'central header signature')
    const crc = buffer.readUInt32LE(offset + 16)
    const compressed = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, 'local header signature')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressedBytes = buffer.subarray(dataStart, dataStart + compressed)
    const data = inflateRawSync(compressedBytes)

    assert.equal(crc32(data), crc, `crc of ${name}`)
    entries.push({ name, data })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function collect(source: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of source) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

describe('document archive writer', () => {
  it('writes a readable ZIP with one deflated entry per artifact', async () => {
    const bodies = {
      'page_0001.pdf': Buffer.from('%PDF-1.7 first page'),
      'page_0002.pdf': Buffer.from('%PDF-1.7 second page with a longer body')
    }
    const { stream, entries } = createZipStream([
      { name: 'page_0001.pdf', stream: () => Readable.from([bodies['page_0001.pdf']]) },
      { name: 'page_0002.pdf', stream: () => Readable.from([bodies['page_0002.pdf']]) }
    ])

    const parsed = readZip(await collect(stream))
    assert.deepEqual(parsed.map(entry => entry.name), ['page_0001.pdf', 'page_0002.pdf'])
    assert.deepEqual(parsed.map(entry => entry.data.toString()), Object.values(bodies).map(body => body.toString()))
    assert.deepEqual(await entries, ['page_0001.pdf', 'page_0002.pdf'])
  })

  it('streams a source that arrives in several chunks', async () => {
    const parts = Array.from({ length: 40 }, (_, index) => Buffer.from(`chunk-${index};${'x'.repeat(64)}`))
    const { stream } = createZipStream([
      { name: 'report.txt', stream: () => Readable.from(parts) }
    ])
    const [entry] = readZip(await collect(stream))
    assert.ok(entry)
    assert.equal(entry.data.toString(), Buffer.concat(parts).toString())
  })

  it('handles an empty file without corrupting the archive', async () => {
    const { stream } = createZipStream([
      { name: 'empty.txt', stream: () => Readable.from([]) },
      { name: 'data.txt', stream: () => Readable.from([Buffer.from('data')]) }
    ])
    const parsed = readZip(await collect(stream))
    assert.deepEqual(parsed.map(entry => entry.name), ['empty.txt', 'data.txt'])
    assert.equal(parsed[0]?.data.length, 0)
    assert.equal(parsed[1]?.data.toString(), 'data')
  })

  it('reads artifacts that live on disk', async () => {
    const path = join(scratch, 'from-disk.pdf')
    writeFileSync(path, '%PDF-1.7 from disk')
    const { stream } = createZipStream([
      { name: 'from-disk.pdf', stream: async () => (await import('node:fs')).createReadStream(path) }
    ])
    const [entry] = readZip(await collect(stream))
    assert.equal(entry?.data.toString(), readFileSync(path, 'utf8'))
  })

  it('flattens a directory path and de-duplicates repeated names', () => {
    const used = new Set<string>()
    assert.equal(zipEntryName('../../etc/passwd', used), 'passwd')
    assert.equal(zipEntryName('page.pdf', used), 'page.pdf')
    assert.equal(zipEntryName('nested/page.pdf', used), 'page (2).pdf')
    assert.equal(zipEntryName('other/page.pdf', used), 'page (3).pdf')
  })

  it('refuses an archive above the format entry cap', () => {
    const sources = Array.from({ length: 0xffff }, (_, index) => ({
      name: `entry-${index}.txt`,
      stream: () => Readable.from([])
    }))
    assert.throws(() => createZipStream(sources), /DOCUMENT_OUTPUT_TOO_LARGE/)
  })
})
