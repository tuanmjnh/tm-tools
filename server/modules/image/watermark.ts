import type { ImageRegion, RasterImage } from './types'

/** Ring thickness sampled around the region, in pixels. */
const RING = 3

/** Clamps to the bitmap, and refuses a region with nothing left of it. */
export function clampRegion(region: ImageRegion, width: number, height: number): ImageRegion {
  const x = Math.max(0, Math.floor(region.x))
  const y = Math.max(0, Math.floor(region.y))
  const right = Math.min(width, Math.ceil(region.x + region.width))
  const bottom = Math.min(height, Math.ceil(region.y + region.height))
  const clampedWidth = right - x
  const clampedHeight = bottom - y
  if (clampedWidth < 1 || clampedHeight < 1) throw new Error('IMAGE_REGION_INVALID')
  return { x, y, width: clampedWidth, height: clampedHeight }
}

/**
 * Per-channel median of the pixels just outside the region. The median rather
 * than the mean keeps a stray dark pixel (a glyph edge, a shadow) from pulling
 * the fill colour.
 */
export function ringMedian(image: RasterImage, region: ImageRegion): [number, number, number, number] {
  const { width, height } = image
  const x0 = Math.max(0, region.x - RING)
  const y0 = Math.max(0, region.y - RING)
  const x1 = Math.min(width, region.x + region.width + RING)
  const y1 = Math.min(height, region.y + region.height + RING)

  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  const a: number[] = []

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const inside = x >= region.x && x < region.x + region.width
        && y >= region.y && y < region.y + region.height
      if (inside) continue
      const i = (y * width + x) * 4
      r.push(image.data[i]!)
      g.push(image.data[i + 1]!)
      b.push(image.data[i + 2]!)
      a.push(image.data[i + 3]!)
    }
  }

  if (!r.length) throw new Error('IMAGE_REGION_INVALID')
  const median = (values: number[]) => {
    values.sort((p, q) => p - q)
    return values[Math.floor(values.length / 2)]!
  }
  return [median(r), median(g), median(b), median(a)]
}

/**
 * Floods the region with the ring colour, blending toward the edge over a short
 * ramp so the seam is not a hard line. Returns a new image.
 */
export function fillRegion(image: RasterImage, region: ImageRegion): RasterImage {
  const clamped = clampRegion(region, image.width, image.height)
  const [r, g, b, a] = ringMedian(image, clamped)

  const out: RasterImage = {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  }

  const ramp = Math.max(1, Math.min(6, Math.floor(Math.min(clamped.width, clamped.height) / 3)))
  for (let y = clamped.y; y < clamped.y + clamped.height; y++) {
    for (let x = clamped.x; x < clamped.x + clamped.width; x++) {
      const distanceToEdge = Math.min(
        x - clamped.x,
        y - clamped.y,
        clamped.x + clamped.width - 1 - x,
        clamped.y + clamped.height - 1 - y
      )
      // 0 at the edge, 1 past the ramp: the edge keeps the ring colour exactly,
      // the middle is fully replaced.
      const weight = Math.min(1, distanceToEdge / ramp)
      const i = (y * image.width + x) * 4
      out.data[i] = image.data[i]! * (1 - weight) + r * weight
      out.data[i + 1] = image.data[i + 1]! * (1 - weight) + g * weight
      out.data[i + 2] = image.data[i + 2]! * (1 - weight) + b * weight
      out.data[i + 3] = image.data[i + 3]! * (1 - weight) + a * weight
    }
  }
  return out
}
