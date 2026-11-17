/**
 * A decoded bitmap. Kept plain (not a canvas object) so the pure functions can
 * be tested without a canvas context and so nothing downstream can rely on a
 * native handle staying alive.
 */
export interface RasterImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** A rectangle in source pixels, top-left origin. */
export interface ImageRegion {
  x: number
  y: number
  width: number
  height: number
}

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
