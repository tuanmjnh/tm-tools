import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyMatte, chromaKey } from '../../server/modules/image/background'
import type { RasterImage } from '../../server/modules/image/types'

function twoTone(backdrop: [number, number, number], subject: [number, number, number]): RasterImage {
  const width = 6
  const height = 2
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const colour = x < 3 ? backdrop : subject
      data[i] = colour[0]
      data[i + 1] = colour[1]
      data[i + 2] = colour[2]
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

const alphaAt = (image: RasterImage, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]

describe('chroma key', () => {
  it('makes the backdrop transparent and keeps the subject opaque', () => {
    const keyed = chromaKey(twoTone([0, 255, 0], [200, 30, 30]), [0, 255, 0], 10)
    assert.equal(alphaAt(keyed, 0, 0), 0, 'backdrop is cut')
    assert.equal(alphaAt(keyed, 5, 0), 255, 'subject is kept')
  })

  it('leaves everything opaque at zero tolerance when the colour differs', () => {
    const keyed = chromaKey(twoTone([0, 250, 0], [200, 30, 30]), [0, 255, 0], 0)
    assert.equal(alphaAt(keyed, 0, 0), 255, 'a near-but-not-equal colour survives tolerance 0')
  })

  it('does not mutate the input image', () => {
    const image = twoTone([0, 255, 0], [200, 30, 30])
    chromaKey(image, [0, 255, 0], 10)
    assert.equal(alphaAt(image, 0, 0), 255)
  })
})

describe('matte application', () => {
  it('scales alpha by the mask', () => {
    const image = twoTone([10, 10, 10], [10, 10, 10])
    const mask = new Uint8Array(image.width * image.height).fill(255)
    mask[0] = 0
    const matted = applyMatte(image, mask)
    assert.equal(alphaAt(matted, 0, 0), 0)
    assert.equal(alphaAt(matted, 1, 0), 255)
  })

  it('rejects a mask of the wrong size', () => {
    const image = twoTone([0, 0, 0], [0, 0, 0])
    assert.throws(() => applyMatte(image, new Uint8Array(3)), /IMAGE_MASK_SIZE_INVALID/)
  })
})
