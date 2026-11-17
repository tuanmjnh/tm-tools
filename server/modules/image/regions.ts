import type { ImageRegion, RasterImage } from './types'
import { clampRegion } from './watermark'

/** A region expressed as fractions, so one selection serves every file. */
export interface RegionInput {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

/** Aspect-ratio drift allowed before a batch file is skipped. */
const ASPECT_TOLERANCE = 0.02

export function resolveRegion(input: RegionInput, width: number, height: number): ImageRegion {
  return clampRegion({
    x: Math.round(input.xRatio * width),
    y: Math.round(input.yRatio * height),
    width: Math.round(input.widthRatio * width),
    height: Math.round(input.heightRatio * height)
  }, width, height)
}

/**
 * The ratio is derived from the image the region was drawn on, so a file with a
 * different shape would have the region land somewhere else entirely.
 */
export function aspectRatioMatches(
  input: RegionInput,
  width: number,
  height: number,
  tolerance = ASPECT_TOLERANCE
): boolean {
  if (input.widthRatio <= 0 || input.heightRatio <= 0) return false
  const sourceRatio = input.widthRatio / input.heightRatio
  const targetRatio = width / height
  return Math.abs(sourceRatio - targetRatio) / sourceRatio <= tolerance
}

/**
 * Suggests the bottom-right corner block: watermark overlays sit there, and the
 * corner is where a fixed-size mark lands regardless of image size. Returns a
 * proposal only — the caller confirms it before anything is written.
 */
export function proposeCornerRegion(image: RasterImage): ImageRegion {
  const width = Math.max(1, Math.round(image.width * 0.25))
  const height = Math.max(1, Math.round(image.height * 0.12))
  const region = {
    x: image.width - width,
    y: image.height - height,
    width,
    height
  }
  return clampRegion(region, image.width, image.height)
}
