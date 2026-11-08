/**
 * Store-only ZIP writer for results the server returned inline. An ephemeral
 * Vercel run has no job route to stream `/artifacts/archive` from, so the
 * browser assembles the archive from bytes it already holds. Entries are not
 * deflated: the payload is capped at a few megabytes and the format stays small
 * enough to verify by hand.
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

export interface InlineZipEntry {
  name: string
  data: Uint8Array
  modifiedAt?: Date
}

function dosDateTime(date: Date): { time: number, date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

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

function writeLocalHeader(view: DataView, at: number, nameLength: number, stamp: { time: number, date: number }): void {
  view.setUint32(at, 0x04034b50, true)
  view.setUint16(at + 4, 20, true)
  // Bit 3: CRC and sizes follow the data in a descriptor.
  view.setUint16(at + 6, 0x0008, true)
  view.setUint16(at + 8, 0, true)
  view.setUint16(at + 10, stamp.time, true)
  view.setUint16(at + 12, stamp.date, true)
  view.setUint32(at + 14, 0, true)
  view.setUint32(at + 18, 0, true)
  view.setUint32(at + 22, 0, true)
  view.setUint16(at + 26, nameLength, true)
  view.setUint16(at + 28, 0, true)
}

function writeCentralHeader(
  view: DataView,
  at: number,
  entry: { nameLength: number, crc: number, size: number, offset: number },
  stamp: { time: number, date: number }
): void {
  view.setUint32(at, 0x02014b50, true)
  view.setUint16(at + 4, 20, true)
  view.setUint16(at + 6, 20, true)
  view.setUint16(at + 8, 0x0008, true)
  view.setUint16(at + 10, 0, true)
  view.setUint16(at + 12, stamp.time, true)
  view.setUint16(at + 14, stamp.date, true)
  view.setUint32(at + 16, entry.crc >>> 0, true)
  view.setUint32(at + 20, entry.size >>> 0, true)
  view.setUint32(at + 24, entry.size >>> 0, true)
  view.setUint16(at + 28, entry.nameLength, true)
  view.setUint16(at + 30, 0, true)
  view.setUint16(at + 32, 0, true)
  view.setUint16(at + 34, 0, true)
  view.setUint16(at + 36, 0, true)
  view.setUint32(at + 38, 0, true)
  view.setUint32(at + 42, entry.offset >>> 0, true)
}

export function createInlineZip(entries: InlineZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const used = new Set<string>()
  const planned = entries.map(entry => ({
    name: encoder.encode(zipEntryName(entry.name, used)),
    data: entry.data,
    modifiedAt: entry.modifiedAt ?? new Date()
  }))

  let total = planned.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length + 16, 0)
  total += planned.reduce((sum, entry) => sum + 46 + entry.name.length, 0) + 22
  const buffer = new Uint8Array(total)
  const view = new DataView(buffer.buffer)
  let offset = 0

  const central: { name: Uint8Array, crc: number, size: number, offset: number, stamp: { time: number, date: number } }[] = []

  for (const entry of planned) {
    const stamp = dosDateTime(entry.modifiedAt)
    const start = offset
    writeLocalHeader(view, start, entry.name.length, stamp)
    offset += 30
    buffer.set(entry.name, offset)
    offset += entry.name.length
    buffer.set(entry.data, offset)
    offset += entry.data.length
    const crc = crc32(entry.data)
    view.setUint32(offset, 0x08074b50, true)
    view.setUint32(offset + 4, crc >>> 0, true)
    view.setUint32(offset + 8, entry.data.length >>> 0, true)
    view.setUint32(offset + 12, entry.data.length >>> 0, true)
    offset += 16
    central.push({ name: entry.name, crc, size: entry.data.length, offset: start, stamp })
  }

  const directoryOffset = offset
  for (const entry of central) {
    writeCentralHeader(view, offset, { nameLength: entry.name.length, crc: entry.crc, size: entry.size, offset: entry.offset }, entry.stamp)
    offset += 46
    buffer.set(entry.name, offset)
    offset += entry.name.length
  }

  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 4, 0, true)
  view.setUint16(offset + 6, 0, true)
  view.setUint16(offset + 8, central.length, true)
  view.setUint16(offset + 10, central.length, true)
  view.setUint32(offset + 12, offset - directoryOffset, true)
  view.setUint32(offset + 16, directoryOffset, true)
  view.setUint16(offset + 20, 0, true)
  offset += 22

  return buffer.subarray(0, offset)
}
