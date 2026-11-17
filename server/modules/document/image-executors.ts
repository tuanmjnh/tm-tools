import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentOperationExecutor, OperationExecutionContext, ValidationResult, VerifiedInput } from './contracts'
import type { ImageRegion, RasterImage } from '../image/types'
import { DocumentError } from './operations'
import { decodeImage } from '../image/decode'
import { encodePng } from '../image/encode'
import { chromaKey, applyMatte, type Rgb } from '../image/background'
import { maskFromImage } from '../image/matte'
import { fillRegion } from '../image/watermark'
import { proposeCornerRegion, resolveRegion, type RegionInput } from '../image/regions'
import { writeFileAtomic } from '../pdf/paths'
import { safeFileName } from '../pdf/security'

export interface WatermarkConfig {
  mode?: 'manual' | 'batch' | 'auto'
  /** Pixel region, used by manual mode. */
  region?: ImageRegion
  /** Ratio region, used by batch mode. */
  regionRatio?: RegionInput
}

function single(inputs: VerifiedInput[]): VerifiedInput {
  const found = inputs[0]
  if (!found) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')
  return found
}

/** The region reaches the server from a canvas, so it is a boundary input. */
function checkedRegion(region: ImageRegion): ImageRegion {
  const values = [region.x, region.y, region.width, region.height]
  if (!values.every(value => Number.isFinite(value)) || region.width < 1 || region.height < 1) {
    throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { field: 'region' })
  }
  return region
}

function outputStem(name: string): string {
  return safeFileName(name).replace(/\.[^.]+$/, '') || 'image'
}

export interface BackgroundConfig {
  mode?: 'chroma' | 'ai'
  backdrop?: Rgb
  tolerance?: number
}

function checkedBackdrop(backdrop: Rgb | undefined): Rgb {
  if (!backdrop) return [255, 255, 255]
  const valid = backdrop.length === 3 && backdrop.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)
  if (!valid) throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { field: 'backdrop' })
  return backdrop
}

export class BackgroundExecutor implements DocumentOperationExecutor<BackgroundConfig> {
  readonly operationId = 'image.background-remove' as const

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length === 1
      ? { ok: true, issues: [] }
      : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
  }

  async execute(context: OperationExecutionContext, config: BackgroundConfig = {}) {
    const input = single(context.inputs)
    await context.onProgress({ totalUnits: 3, completedUnits: 0 })

    const image = await decodeImage(new Uint8Array(readFileSync(input.stagedPath)), input.extension)
    await context.onProgress({ totalUnits: 3, completedUnits: 1 })

    let cleaned: RasterImage
    if (config.mode === 'ai') {
      let mask: Uint8Array
      try {
        mask = await maskFromImage(image)
      } catch (error) {
        // A missing or hash-mismatched model is an install problem, not a job
        // failure; say so instead of reporting a generic processing error.
        if (error instanceof Error && error.message === 'IMAGE_MODEL_MISSING') {
          throw new DocumentError('DOCUMENT_AI_MODEL_UNAVAILABLE')
        }
        throw error
      }
      cleaned = applyMatte(image, mask)
    } else {
      const tolerance = Math.max(0, Math.min(255, Math.round(config.tolerance ?? 30)))
      cleaned = chromaKey(image, checkedBackdrop(config.backdrop), tolerance)
    }
    await context.onProgress({ totalUnits: 3, completedUnits: 2 })

    const fileName = `${outputStem(input.safeName)}_nobg.png`
    const target = join(context.workspace.outputDir, fileName)
    writeFileAtomic(target, encodePng(cleaned))
    await context.onProgress({ totalUnits: 3, completedUnits: 3 })

    return {
      files: [{ fileName, mimeType: 'image/png', path: target, size: statSync(target).size }]
    }
  }
}

export class WatermarkExecutor implements DocumentOperationExecutor<WatermarkConfig> {
  readonly operationId = 'image.watermark-remove' as const

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length === 1
      ? { ok: true, issues: [] }
      : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
  }

  async execute(context: OperationExecutionContext, config: WatermarkConfig = {}) {
    const input = single(context.inputs)
    await context.onProgress({ totalUnits: 3, completedUnits: 0 })

    const image = await decodeImage(new Uint8Array(readFileSync(input.stagedPath)), input.extension)
    await context.onProgress({ totalUnits: 3, completedUnits: 1 })

    const cleaned = fillRegion(image, this.regionFor(config, image))
    await context.onProgress({ totalUnits: 3, completedUnits: 2 })

    const fileName = `${outputStem(input.safeName)}_clean.png`
    const target = join(context.workspace.outputDir, fileName)
    writeFileAtomic(target, encodePng(cleaned))
    await context.onProgress({ totalUnits: 3, completedUnits: 3 })

    return {
      files: [{ fileName, mimeType: 'image/png', path: target, size: statSync(target).size }]
    }
  }

  /**
   * The region comes from the caller. When none was supplied the corner is
   * proposed from the image itself, so the fallback is a real suggestion rather
   * than an arbitrary rectangle.
   */
  private regionFor(config: WatermarkConfig, image: RasterImage): ImageRegion {
    if (config.mode === 'batch' && config.regionRatio) {
      return resolveRegion(config.regionRatio, image.width, image.height)
    }
    if (config.region) return checkedRegion(config.region)
    return proposeCornerRegion(image)
  }
}
