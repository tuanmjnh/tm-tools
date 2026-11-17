import { createCanvas } from '@napi-rs/canvas'
import type { RasterImage } from './types'

/** PNG is the only output: it is the only format that carries alpha. */
export function encodePng(image: RasterImage): Uint8Array {
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  const buffer = ctx.createImageData(image.width, image.height)
  buffer.data.set(image.data)
  ctx.putImageData(buffer, 0, 0)
  return new Uint8Array(canvas.toBuffer('image/png'))
}
