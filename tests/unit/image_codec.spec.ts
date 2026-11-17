import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas'
import { decodeImage } from '../../server/modules/image/decode'
import { encodePng } from '../../server/modules/image/encode'

function pngBytes(width: number, height: number, paint: (ctx: SKRSContext2D) => void): Uint8Array {
  const canvas = createCanvas(width, height)
  paint(canvas.getContext('2d'))
  return new Uint8Array(canvas.toBuffer('image/png'))
}

describe('image codec', () => {
  it('decodes a PNG into pixels at the same size', async () => {
    const image = await decodeImage(pngBytes(8, 4, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 8, 4)
    }), 'png')
    assert.equal(image.width, 8)
    assert.equal(image.height, 4)
    assert.equal(image.data.length, 8 * 4 * 4)
  })

  it('round-trips a colour through encode and decode', async () => {
    const source = await decodeImage(pngBytes(2, 2, (ctx) => {
      ctx.fillStyle = '#00ff00'
      ctx.fillRect(0, 0, 2, 2)
    }), 'png')
    const roundTripped = await decodeImage(encodePng(source), 'png')
    assert.equal(roundTripped.data[0], source.data[0])
    assert.equal(roundTripped.data[1], source.data[1])
    assert.equal(roundTripped.data[2], source.data[2])
    assert.equal(roundTripped.data[3], 255)
  })

  it('preserves alpha through a round trip', async () => {
    const transparent = { data: new Uint8ClampedArray([255, 0, 0, 0]), width: 1, height: 1 }
    const decoded = await decodeImage(encodePng(transparent), 'png')
    assert.equal(decoded.data[3], 0, 'a fully transparent pixel stays transparent')
  })

  it('rejects an unsupported extension', async () => {
    await assert.rejects(
      () => decodeImage(new Uint8Array([1, 2, 3]), 'tiff'),
      /IMAGE_FORMAT_UNSUPPORTED/
    )
  })
})
