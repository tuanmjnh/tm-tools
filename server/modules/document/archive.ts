import { Readable, Transform, compose } from 'node:stream'
import { createDeflateRaw } from 'node:zlib'

/**
 * Minimal streaming ZIP writer (deflate, no Zip64). Multi-artifact results are
 * downloaded as one archive, and every entry is streamed from its source so a
 * large job never has to fit in memory.
 *
 * Zip64 is deliberately not implemented: an entry or archive above 4 GB is
 * refused, which keeps the format small enough to verify by hand.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(chunk: Uint8Array, previous = 0): number {
  let crc = (previous ^ 0xffffffff) >>> 0
  for (let index = 0; index < chunk.length; index++) {
    crc = (CRC_TABLE[(crc ^ chunk[index]!) & 0xff]! ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntrySource {
  name: string
  modifiedAt?: Date
  stream: () => Promise<Readable> | Readable
}

export const ZIP_MAX_ENTRY_BYTES = 0xffffffff
export const ZIP_MAX_ENTRIES = 0xfffe

function dosDateTime(date: Date): { time: number, date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

function localHeader(name: Buffer, modifiedAt: Date): Buffer {
  const stamp = dosDateTime(modifiedAt)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  // Bit 3: CRC and sizes follow the data in a descriptor.
  header.writeUInt16LE(0x0008, 6)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(stamp.time, 10)
  header.writeUInt16LE(stamp.date, 12)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(0, 18)
  header.writeUInt32LE(0, 22)
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, name])
}

function dataDescriptor(crc: number, compressed: number, uncompressed: number): Buffer {
  const descriptor = Buffer.alloc(16)
  descriptor.writeUInt32LE(0x08074b50, 0)
  descriptor.writeUInt32LE(crc >>> 0, 4)
  descriptor.writeUInt32LE(compressed >>> 0, 8)
  descriptor.writeUInt32LE(uncompressed >>> 0, 12)
  return descriptor
}

function centralHeader(entry: {
  name: Buffer
  crc: number
  compressed: number
  uncompressed: number
  offset: number
  modifiedAt: Date
}): Buffer {
  const stamp = dosDateTime(entry.modifiedAt)
  const header = Buffer.alloc(46)
  header.writeUInt32LE(0x02014b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0008, 8)
  header.writeUInt16LE(8, 10)
  header.writeUInt16LE(stamp.time, 12)
  header.writeUInt16LE(stamp.date, 14)
  header.writeUInt32LE(entry.crc >>> 0, 16)
  header.writeUInt32LE(entry.compressed >>> 0, 20)
  header.writeUInt32LE(entry.uncompressed >>> 0, 24)
  header.writeUInt16LE(entry.name.length, 28)
  header.writeUInt16LE(0, 30)
  header.writeUInt16LE(0, 32)
  header.writeUInt16LE(0, 34)
  header.writeUInt16LE(0, 36)
  header.writeUInt32LE(0, 38)
  header.writeUInt32LE(entry.offset >>> 0, 42)
  return Buffer.concat([header, entry.name])
}

function endOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(size >>> 0, 12)
  end.writeUInt32LE(offset >>> 0, 16)
  end.writeUInt16LE(0, 20)
  return end
}

/** Drops control characters without relying on a `no-control-regex` suppression. */
function printable(name: string): string {
  let out = ''
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) out += char
  }
  return out
}

/** Entry names are flattened to one level and de-duplicated. */
export function zipEntryName(raw: string, used: Set<string>): string {
  const base = printable(raw.split(/[\\/]/).pop() ?? '').trim() || 'file'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const extension = dot > 0 ? base.slice(dot) : ''
  let counter = 2
  let candidate = `${stem} (${counter})${extension}`
  while (used.has(candidate)) candidate = `${stem} (${++counter})${extension}`
  used.add(candidate)
  return candidate
}

export interface ZipStreamResult {
  stream: Readable
  /** Resolves with the archived entry names once the last byte is written. */
  entries: Promise<string[]>
}

export function createZipStream(sources: ZipEntrySource[]): ZipStreamResult {
  if (sources.length > ZIP_MAX_ENTRIES) throw new Error('DOCUMENT_OUTPUT_TOO_LARGE')

  const used = new Set<string>()
  const planned = sources.map(source => ({
    source,
    name: Buffer.from(zipEntryName(source.name, used), 'utf8'),
    modifiedAt: source.modifiedAt ?? new Date()
  }))

  let resolveEntries: (names: string[]) => void = () => {}
  let rejectEntries: (error: unknown) => void = () => {}
  const entries = new Promise<string[]>((resolve, reject) => {
    resolveEntries = resolve
    rejectEntries = reject
  })

  async function* emit(): AsyncGenerator<Buffer> {
    const directory: Buffer[] = []
    let offset = 0

    const push = (buffer: Buffer) => {
      offset += buffer.length
      return buffer
    }

    for (const entry of planned) {
      const start = offset
      yield push(localHeader(entry.name, entry.modifiedAt))

      let crc = 0
      let uncompressed = 0
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          crc = crc32(chunk, crc)
          uncompressed += chunk.length
          callback(null, chunk)
        }
      })

      const deflate = createDeflateRaw({ level: 6 })
      const compressedStream = compose(await entry.source.stream(), meter, deflate)
      let compressed = 0
      for await (const chunk of compressedStream) {
        compressed += chunk.length
        if (compressed > ZIP_MAX_ENTRY_BYTES) throw new Error('DOCUMENT_OUTPUT_TOO_LARGE')
        yield push(Buffer.from(chunk))
      }
      if (uncompressed > ZIP_MAX_ENTRY_BYTES) throw new Error('DOCUMENT_OUTPUT_TOO_LARGE')

      yield push(dataDescriptor(crc, compressed, uncompressed))
      directory.push(centralHeader({
        name: entry.name,
        crc,
        compressed,
        uncompressed,
        offset: start,
        modifiedAt: entry.modifiedAt
      }))
    }

    const directoryOffset = offset
    for (const header of directory) yield push(header)
    yield push(endOfCentralDirectory(directory.length, offset - directoryOffset, directoryOffset))
    resolveEntries(planned.map(entry => entry.name.toString('utf8')))
  }

  const generator = emit()
  const stream = Readable.from(generator, { objectMode: false })
  stream.on('error', error => rejectEntries(error))
  return { stream, entries }
}
