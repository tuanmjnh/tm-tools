import { createCanvas } from '@napi-rs/canvas'
import type { RasterImage } from './types'
import { expectedModelSha256, modelPath, verifyModel } from './model-store'

/** ISNet expects a 1024x1024 square and emits one score map of the same size. */
const INPUT_SIZE = 1024

/** rembg feeds isnet-general-use ImageNet-normalised RGB, which the weights expect. */
const MEAN = [0.485, 0.456, 0.406] as const
const STD = [0.229, 0.224, 0.225] as const

/**
 * Produces one alpha byte per source pixel. Written against this interface so
 * the pipeline can be tested with a stub long before the model is installed.
 */
export async function maskFromImage(image: RasterImage): Promise<Uint8Array> {
  if (!verifyModel(modelPath(), expectedModelSha256())) throw new Error('IMAGE_MODEL_MISSING')

  const ort = await import('onnxruntime-web')
  const session = await ort.InferenceSession.create(modelPath(), { executionProviders: ['wasm'] })
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]
  if (!inputName || !outputName) throw new Error('IMAGE_MODEL_INVALID')

  const tensor = new ort.Tensor('float32', normalisedInput(image), [1, 3, INPUT_SIZE, INPUT_SIZE])
  const result = await session.run({ [inputName]: tensor })
  const output = result[outputName]
  if (!output) throw new Error('IMAGE_MODEL_INVALID')
  const scores = output.data as Float32Array

  return scoresToMask(scores, INPUT_SIZE, image.width, image.height)
}

/** Resizes to the model's square in NCHW float32 order. */
function normalisedInput(image: RasterImage): Float32Array {
  const source = createCanvas(image.width, image.height)
  const sourceCtx = source.getContext('2d')
  const buffer = sourceCtx.createImageData(image.width, image.height)
  buffer.data.set(image.data)
  sourceCtx.putImageData(buffer, 0, 0)

  const square = createCanvas(INPUT_SIZE, INPUT_SIZE)
  const squareCtx = square.getContext('2d')
  squareCtx.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE)
  const pixels = squareCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data

  const plane = INPUT_SIZE * INPUT_SIZE
  const input = new Float32Array(plane * 3)
  for (let p = 0; p < plane; p++) {
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[p * 4 + channel]! / 255
      input[channel * plane + p] = (value - MEAN[channel]!) / STD[channel]!
    }
  }
  return input
}

/** Resamples the model's square score map back to the source size. */
function scoresToMask(scores: Float32Array, size: number, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(size - 1, Math.floor((y / height) * size))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(size - 1, Math.floor((x / width) * size))
      const score = scores[sy * size + sx] ?? 0
      mask[y * width + x] = Math.round(Math.min(1, Math.max(0, score)) * 255)
    }
  }
  return mask
}
