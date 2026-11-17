import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ICO_ALLOWED_SIZES,
  PNG_ICON_SIZES,
  buildIco,
  parseIcoDirectory,
  normalizeIcoSizes,
  isIcoTruncated
} from '../../server/modules/image/ico'

/**
 * A minimal but structurally valid PNG the ICO container can carry. The ICO
 * packer must not inspect pixels: it wraps whatever PNG payload it is given,
 * so a 1x1 PNG is enough to prove the container bytes.
 */
function tinyPng(): Uint8Array {
  return new Uint8Array(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  ))
}

describe('ICO container', () => {
  it('limits the ICO ladder to the format maximum of 256 (512 is not representable)', () => {
    // ICONDIRENTRY stores width/height in one byte (0 means 256); there is no
    // way to encode 512. 512 therefore lives only in the PNG-output ladder.
    assert.deepEqual([...ICO_ALLOWED_SIZES], [16, 32, 48, 64, 128, 256])
    assert.deepEqual([...PNG_ICON_SIZES], [16, 32, 48, 64, 128, 256, 512])
  })

  it('packs one PNG into a valid single-entry ICONDIR', () => {
    const png = tinyPng()
    const ico = buildIco([{ size: 32, png }])

    assert.equal(ico.readUInt16LE(0), 0, 'reserved must be 0')
    assert.equal(ico.readUInt16LE(2), 1, 'type must be 1 (icon)')
    assert.equal(ico.readUInt16LE(4), 1, 'image count must be 1')

    assert.equal(ico.readUInt8(6), 32, 'width byte')
    assert.equal(ico.readUInt8(7), 32, 'height byte')
    const sizeField = ico.readUInt32LE(14)
    const offsetField = ico.readUInt32LE(18)
    assert.equal(sizeField, png.length, 'entry payload length')
    assert.equal(offsetField, 6 + 16, 'payload starts right after the directory')
    assert.deepEqual(ico.subarray(offsetField, offsetField + png.length), Buffer.from(png))
  })

  it('encodes 256 as 0 in the width/height byte (ICO stores 256 as 0)', () => {
    const ico = buildIco([{ size: 256, png: tinyPng() }])
    assert.equal(ico.readUInt8(6), 0, '256 width is encoded as 0')
    assert.equal(ico.readUInt8(7), 0, '256 height is encoded as 0')
  })

  it('packs multiple sizes with correct per-entry offsets', () => {
    const png = tinyPng()
    const ico = buildIco([{ size: 16, png }, { size: 48, png }, { size: 256, png }])
    assert.equal(ico.readUInt16LE(4), 3, 'three entries')

    const parsed = parseIcoDirectory(ico)
    assert.equal(parsed.length, 3)
    assert.deepEqual(parsed.map(e => e.width), [16, 48, 256])
    for (const entry of parsed) {
      assert.equal(ico.readUInt32LE(entry.offsetStart + 8), entry.length)
      assert.equal(ico.readUInt32LE(entry.offsetStart + 12), entry.dataOffset)
      assert.equal(entry.endsWithPngSignature, true)
    }
  })

  it('rejects a 512 entry: it cannot be expressed in ICONDIR', () => {
    assert.throws(() => buildIco([{ size: 512, png: tinyPng() }]), /ICO_SIZE_TOO_LARGE/)
  })

  it('normalizes user selection: drops >256, dedupes, sorts ascending', () => {
    assert.deepEqual(normalizeIcoSizes([256, 16, 16, 512, 128]), [16, 128, 256])
  })

  it('falls back to a default ladder when the selection yields nothing usable', () => {
    assert.deepEqual(normalizeIcoSizes([]), [16, 32, 48, 256])
    assert.deepEqual(normalizeIcoSizes(['x', null, undefined]), [16, 32, 48, 256])
    assert.deepEqual(normalizeIcoSizes([512]), [16, 32, 48, 256], '512-only selection still yields an ICO ladder')
  })

  it('requires at least one size to build', () => {
    assert.throws(() => buildIco([]), /ICO_NO_SIZES/)
  })

  it('rejects a non-icon buffer at parse time', () => {
    assert.throws(() => parseIcoDirectory(new Uint8Array([0, 0, 2, 0, 0, 0])), /ICO_INVALID/)
  })

  it('flags a truncated payload', () => {
    const ico = buildIco([{ size: 32, png: tinyPng() }])
    const truncated = ico.subarray(0, ico.length - 10)
    assert.equal(isIcoTruncated(truncated), true)
    assert.equal(isIcoTruncated(ico), false)
  })
})
