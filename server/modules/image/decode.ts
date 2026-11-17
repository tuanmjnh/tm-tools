import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { RasterImage } from './types'
import { SUPPORTED_IMAGE_EXTENSIONS } from './types'

/**
 * Decodes any format the operations accept into raw RGBA. The extension gate
 * exists because `loadImage` sniffs content: without it a mislabelled file would
 * decode and then surprise the caller that asked for a specific format.
 */
export async function decodeImage(bytes: Uint8Array, extension: string): Promise<RasterImage> {
  const ext = extension.toLowerCase().replace('.', '')
  if (!(SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(`IMAGE_FORMAT_UNSUPPORTED: ${ext}`)
  }

  const image = await loadImage(Buffer.from(bytes))
  const width = image.width
  const height = image.height
  if (width < 1 || height < 1) throw new Error('IMAGE_EMPTY')

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)

  const data = ctx.getImageData(0, 0, width, height).data
  return { data: new Uint8ClampedArray(data), width, height }
}
