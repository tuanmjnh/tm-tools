import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clampRegion, fillRegion, ringMedian } from '../../server/modules/image/watermark'
import type { RasterImage } from '../../server/modules/image/types'

/** A solid-colour field with a differently-coloured rectangle painted in. */
function fieldWithRect(field: [number, number, number], rect: [number, number, number]): RasterImage {
  const width = 20
  const height = 20
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inside = x >= 8 && x < 13 && y >= 8 && y < 13
      const colour = inside ? rect : field
      data[i] = colour[0]
      data[i + 1] = colour[1]
      data[i + 2] = colour[2]
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

const pixelAt = (image: RasterImage, x: number, y: number) => {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
}

describe('watermark fill', () => {
  it('reads the surrounding colour, not the region interior', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    const median = ringMedian(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual([median[0], median[1], median[2]], [200, 0, 0])
  })

  it('replaces the region with the surrounding colour', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    const cleaned = fillRegion(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual(pixelAt(cleaned, 10, 10), [200, 0, 0], 'the interior is refilled')
  })

  it('leaves pixels outside the region untouched', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    const cleaned = fillRegion(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual(pixelAt(cleaned, 0, 0), [200, 0, 0])
    assert.deepEqual(pixelAt(cleaned, 19, 19), [200, 0, 0])
  })

  it('does not mutate the input image', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    fillRegion(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual(pixelAt(image, 10, 10), [255, 255, 255], 'the caller still owns the original')
  })

  it('clamps a region that overhangs the image edges', () => {
    assert.deepEqual(
      clampRegion({ x: -5, y: -5, width: 30, height: 30 }, 20, 20),
      { x: 0, y: 0, width: 20, height: 20 }
    )
  })

  it('rejects a region that is entirely outside the image', () => {
    assert.throws(() => clampRegion({ x: 50, y: 50, width: 5, height: 5 }, 20, 20), /IMAGE_REGION_INVALID/)
  })
})
