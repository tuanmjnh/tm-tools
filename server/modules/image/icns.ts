/**
 * Apple ICNS container.
 *
 * ICNS is a flat list of typed elements, each `[type:4][length:u32be incl. the
 * 8-byte header][payload]`, prefixed by a file header `[icns][total:u32be]`.
 * The PNG-backed element types (`icp4`..`icp6`, `ic07`..`ic09`) carry a PNG
 * payload directly, so packing is a header plus N pieces — no pixels touched.
 * Unlike `.ico`, ICNS can represent 512, so the full ladder fits in one file.
 */

export interface IcnsSizeMap {
  size: number
  type: string
}

/** PNG element type per pixel size (the modern, PNG-backed codes). */
const SIZE_TO_TYPE: Record<number, string> = {
  16: 'icp4',
  32: 'icp5',
  64: 'icp6',
  128: 'ic07',
  256: 'ic08',
  512: 'ic09'
}

const TYPE_TO_SIZE: Record<string, number> = Object.fromEntries(
  Object.entries(SIZE_TO_TYPE).map(([size, type]) => [type, Number(size)])
)

export const ICNS_PNG_TYPES = Object.values(SIZE_TO_TYPE)

/**
 * The 32px slot has two legacy codes (`icp5` is 32, `ic11` a retina variant);
 * we only write the canonical PNG codes above. 48px has no PNG code, which is
 * why the ICNS ladder is 16/32/64/128/256/512 — not the ICO ladder.
 */
export const ICNS_ALLOWED_SIZES = Object.keys(SIZE_TO_TYPE).map(Number).sort((a, b) => a - b)

const HEADER_BYTES = 8
const ELEMENT_HEADER_BYTES = 8
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface IcnsImageInput {
  size: number
  png: Uint8Array
}

export interface IcnsDirectoryEntry {
  type: string
  size: number
  /** Absolute byte offset of the 8-byte element header. */
  offsetStart: number
  length: number
  dataOffset: number
  png: boolean
}

export function icnsSizeForType(type: string): number | null {
  return TYPE_TO_SIZE[type] ?? null
}

export function buildIcns(images: IcnsImageInput[]): Buffer {
  if (!images.length) throw new Error('ICNS_NO_IMAGES')
  for (const image of images) {
    if (!SIZE_TO_TYPE[image.size]) throw new Error(`ICNS_SIZE_UNSUPPORTED: ${image.size}`)
    if (!image.png.length) throw new Error('ICNS_EMPTY_PAYLOAD')
  }

  const totalBytes = HEADER_BYTES + images.reduce((sum, image) => sum + ELEMENT_HEADER_BYTES + image.png.length, 0)
  const out = Buffer.alloc(totalBytes)
  out.write('icns', 0, 'latin1')
  out.writeUInt32BE(totalBytes, 4)

  let offset = HEADER_BYTES
  for (const image of images) {
    const type = SIZE_TO_TYPE[image.size]!
    out.write(type, offset, 'latin1')
    out.writeUInt32BE(ELEMENT_HEADER_BYTES + image.png.length, offset + 4)
    Buffer.from(image.png).copy(out, offset + ELEMENT_HEADER_BYTES)
    offset += ELEMENT_HEADER_BYTES + image.png.length
  }
  return out
}

function hasPngSignature(buffer: Buffer, offset: number): boolean {
  if (offset + PNG_SIGNATURE.length > buffer.length) return false
  return PNG_SIGNATURE.every((byte, index) => buffer[offset + index] === byte)
}

export function parseIcnsDirectory(bytes: Uint8Array): IcnsDirectoryEntry[] {
  const buffer = Buffer.from(bytes)
  if (buffer.length < HEADER_BYTES) throw new Error('ICNS_INVALID')
  if (buffer.subarray(0, 4).toString('latin1') !== 'icns') throw new Error('ICNS_INVALID')
  const declared = buffer.readUInt32BE(4)
  if (declared > buffer.length || declared < HEADER_BYTES) throw new Error('ICNS_INVALID')

  const entries: IcnsDirectoryEntry[] = []
  let offset = HEADER_BYTES
  while (offset + ELEMENT_HEADER_BYTES <= declared) {
    const type = buffer.subarray(offset, offset + 4).toString('latin1')
    const length = buffer.readUInt32BE(offset + 4)
    if (length < ELEMENT_HEADER_BYTES || offset + length > declared) throw new Error('ICNS_INVALID')
    const dataOffset = offset + ELEMENT_HEADER_BYTES
    const size = icnsSizeForType(type)
    entries.push({
      type,
      size: size ?? 0,
      offsetStart: offset,
      length,
      dataOffset,
      png: hasPngSignature(buffer, dataOffset)
    })
    offset += length
  }
  return entries
}
