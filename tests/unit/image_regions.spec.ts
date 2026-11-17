import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aspectRatioMatches, proposeCornerRegion, resolveRegion } from '../../server/modules/image/regions'
import type { RasterImage } from '../../server/modules/image/types'

describe('region resolution', () => {
  it('scales a ratio region against a new image size', () => {
    const region = resolveRegion({ xRatio: 0.5, yRatio: 0.5, widthRatio: 0.25, heightRatio: 0.25 }, 400, 200)
    assert.deepEqual(region, { x: 200, y: 100, width: 100, height: 50 })
  })

  it('clamps a scaled region to the bitmap', () => {
    const region = resolveRegion({ xRatio: 0.9, yRatio: 0.9, widthRatio: 0.5, heightRatio: 0.5 }, 100, 100)
    assert.equal(region.x + region.width, 100)
    assert.equal(region.y + region.height, 100)
  })

  it('accepts an image within the aspect tolerance', () => {
    // Source 1000x500 (2:1), target 400x201 -> ratio 1.99, within 2%
    assert.equal(aspectRatioMatches({ xRatio: 0, yRatio: 0, widthRatio: 0.2, heightRatio: 0.1 }, 400, 201), true)
  })

  it('rejects an image outside the aspect tolerance', () => {
    // Source 1000x500 (2:1), target 400x400 -> ratio 1.0, far outside
    assert.equal(aspectRatioMatches({ xRatio: 0, yRatio: 0, widthRatio: 0.2, heightRatio: 0.1 }, 400, 400), false)
  })

  it('proposes a region inside the bottom-right corner', () => {
    const data = new Uint8ClampedArray(40 * 40 * 4).fill(200)
    const image: RasterImage = { data, width: 40, height: 40 }
    // Paint a contrasting patch bottom-right so the proposal has something to find.
    for (let y = 30; y < 38; y++) {
      for (let x = 30; x < 38; x++) {
        const i = (y * image.width + x) * 4
        image.data[i] = 20
        image.data[i + 1] = 20
        image.data[i + 2] = 20
      }
    }
    const region = proposeCornerRegion(image)
    assert.ok(region.x >= 20, 'proposal sits in the right half')
    assert.ok(region.y >= 20, 'proposal sits in the bottom half')
    assert.ok(region.width > 0 && region.height > 0)
  })
})
