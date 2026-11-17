/**
 * Windows ICO container.
 *
 * An `.ico` is a directory of images. Each `ICONDIRENTRY` stores width/height in
 * a single byte, where `0` means 256 — so a standard ICO caps at 256×256 and
 * cannot represent 512. The packer never inspects pixels: it wraps whatever PNG
 * payload it is handed, so callers decide the rendering.
 */

/** Sizes a `.ico` can actually carry. 512 is deliberately absent (see PNG_ICON_SIZES). */
export const ICO_ALLOWED_SIZES = [16, 32, 48, 64, 128, 256] as const

/** The size ladder offered to the user; 512 is exported as a PNG, not into the ICO. */
export const PNG_ICON_SIZES = [16, 32, 48, 64, 128, 256, 512] as const

export type IcoSize = typeof ICO_ALLOWED_SIZES[number]

const ICO_MAX_SIZE = 256
const ICONDIR_BYTES = 6
const ICONDIRENTRY_BYTES = 16
const DEFAULT_LADDER: readonly IcoSize[] = [16, 32, 48, 256]
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface IcoImageInput {
  size: number
  png: Uint8Array
}

export interface IcoDirectoryEntry {
  width: number
  height: number
  /** Absolute byte offset of this entry inside the ICONDIR. */
  offsetStart: number
  length: number
  dataOffset: number
  endsWithPngSignature: boolean
}

function assertRealSize(size: number): void {
  if (size > ICO_MAX_SIZE) throw new Error('ICO_SIZE_TOO_LARGE')
  if (size < 1) throw new Error('ICO_SIZE_INVALID')
}

/**
 * Builds the ICO bytes from already-encoded PNG payloads, one per size. Sizes
 * must be within the representable range; the caller is responsible for which
 * sizes the user picked.
 */
export function buildIco(images: IcoImageInput[]): Buffer {
  if (!images.length) throw new Error('ICO_NO_SIZES')
  for (const image of images) {
    assertRealSize(image.size)
    if (!image.png.length) throw new Error('ICO_EMPTY_PAYLOAD')
  }

  const directoryBytes = ICONDIR_BYTES + images.length * ICONDIRENTRY_BYTES
  const totalBytes = directoryBytes + images.reduce((sum, image) => sum + image.png.length, 0)
  const out = Buffer.alloc(totalBytes)

  out.writeUInt16LE(0, 0) // reserved
  out.writeUInt16LE(1, 2) // type: 1 = icon
  out.writeUInt16LE(images.length, 4)

  let dataOffset = directoryBytes
  images.forEach((image, index) => {
    const entry = ICONDIR_BYTES + index * ICONDIRENTRY_BYTES
    // 256 is stored as 0; every representable size fits one byte.
    out.writeUInt8(image.size === 256 ? 0 : image.size, entry)
    out.writeUInt8(image.size === 256 ? 0 : image.size, entry + 1)
    out.writeUInt8(0, entry + 2) // color palette count
    out.writeUInt8(0, entry + 3) // reserved
    out.writeUInt16LE(1, entry + 4) // color planes
    out.writeUInt16LE(32, entry + 6) // bits per pixel
    out.writeUInt32LE(image.png.length, entry + 8)
    out.writeUInt32LE(dataOffset, entry + 12)
    Buffer.from(image.png).copy(out, dataOffset)
    dataOffset += image.png.length
  })

  return out
}

function hasPngSignature(bytes: Buffer, offset: number): boolean {
  if (offset + PNG_SIGNATURE.length > bytes.length) return false
  return PNG_SIGNATURE.every((byte, index) => bytes[offset + index] === byte)
}

/** Reads the ICONDIR so a freshly packed file (or an uploaded one) can be validated. */
export function parseIcoDirectory(bytes: Uint8Array): IcoDirectoryEntry[] {
  const buffer = Buffer.from(bytes)
  if (buffer.length < ICONDIR_BYTES) throw new Error('ICO_INVALID')
  if (buffer.readUInt16LE(0) !== 0) throw new Error('ICO_INVALID')
  if (buffer.readUInt16LE(2) !== 1) throw new Error('ICO_INVALID')

  const count = buffer.readUInt16LE(4)
  if (count < 1) throw new Error('ICO_INVALID')
  if (buffer.length < ICONDIR_BYTES + count * ICONDIRENTRY_BYTES) throw new Error('ICO_INVALID')

  const entries: IcoDirectoryEntry[] = []
  for (let index = 0; index < count; index++) {
    const offsetStart = ICONDIR_BYTES + index * ICONDIRENTRY_BYTES
    const width = buffer.readUInt8(offsetStart) === 0 ? 256 : buffer.readUInt8(offsetStart)
    const height = buffer.readUInt8(offsetStart + 1) === 0 ? 256 : buffer.readUInt8(offsetStart + 1)
    const length = buffer.readUInt32LE(offsetStart + 8)
    const dataOffset = buffer.readUInt32LE(offsetStart + 12)
    entries.push({
      width,
      height,
      offsetStart,
      length,
      dataOffset,
      endsWithPngSignature: hasPngSignature(buffer, dataOffset)
    })
  }
  return entries
}

export function isIcoTruncated(bytes: Uint8Array): boolean {
  let entries: IcoDirectoryEntry[]
  try {
    entries = parseIcoDirectory(bytes)
  } catch {
    return true
  }
  return entries.some(entry => entry.dataOffset + entry.length > bytes.length)
}

/**
 * Turns a user checkbox selection into the sizes the packer will actually use:
 * dedupe, drop anything off the ladder, sort ascending. A selection with nothing
 * usable (empty, or only 512) falls back to a small sensible ladder so the
 * request still produces a valid icon instead of erroring.
 */
export function normalizeIcoSizes(raw: unknown): IcoSize[] {
  const input = Array.isArray(raw) ? raw : [raw]
  const allowed = new Set<number>(ICO_ALLOWED_SIZES)
  const picked = new Set<number>()
  for (const value of input) {
    const size = typeof value === 'number' ? value : Number(String(value ?? '').trim())
    if (Number.isInteger(size) && allowed.has(size)) picked.add(size)
  }
  if (!picked.size) return [...DEFAULT_LADDER]
  return [...picked].sort((a, b) => a - b) as IcoSize[]
}
