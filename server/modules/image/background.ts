import type { RasterImage } from './types'

export type Rgb = [number, number, number]

/** Euclidean RGB distance, compared against `tolerance` squared. */
function distanceSquared(r: number, g: number, b: number, target: Rgb): number {
  const dr = r - target[0]
  const dg = g - target[1]
  const db = b - target[2]
  return dr * dr + dg * dg + db * db
}

/**
 * Cuts every pixel close enough to `backdrop` to fully transparent. Pixels just
 * outside the tolerance keep their original alpha: a hard cut is the honest
 * result for a flat backdrop, and a soft edge belongs to the AI mode.
 */
export function chromaKey(image: RasterImage, backdrop: Rgb, tolerance: number): RasterImage {
  const limit = Math.max(0, tolerance) ** 2
  const out: RasterImage = {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  }
  for (let i = 0; i < out.data.length; i += 4) {
    const d = distanceSquared(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!, backdrop)
    if (d <= limit) out.data[i + 3] = 0
  }
  return out
}

/** Multiplies existing alpha by a one-byte-per-pixel mask. */
export function applyMatte(image: RasterImage, mask: Uint8Array): RasterImage {
  const expected = image.width * image.height
  if (mask.length !== expected) throw new Error('IMAGE_MASK_SIZE_INVALID')
  const out: RasterImage = {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  }
  for (let p = 0; p < expected; p++) {
    const i = p * 4 + 3
    out.data[i] = (out.data[i]! * mask[p]!) / 255
  }
  return out
}
