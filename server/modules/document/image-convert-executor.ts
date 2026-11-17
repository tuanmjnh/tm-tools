import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentOperationExecutor, OperationExecutionContext, ValidationResult, VerifiedInput } from './contracts'
import type { RasterImage } from '../image/types'
import { DocumentError } from './operations'
import { decodeImage } from '../image/decode'
import { buildIco, normalizeIcoSizes, PNG_ICON_SIZES } from '../image/ico'
import { buildIcns, ICNS_ALLOWED_SIZES } from '../image/icns'
import { writeFileAtomic } from '../pdf/paths'
import { safeFileName } from '../pdf/security'

/**
 * `image.convert` renders one image into another format. Raster sources go
 * through the shared decoder; SVG is rasterised with the canvas the app already
 * ships. Targets are a closed set so a bad config cannot reach the encoder:
 *   png / jpg / webp  → one re-encoded image
 *   ico               → a multi-size icon from the user's picked ladder
 * `.ico` sources are read back to PNG (the largest stored image), which is the
 * only useful inverse for an icon.
 */

export const IMAGE_CONVERT_TARGETS = ['png', 'jpg', 'webp', 'ico', 'icns'] as const
export type ImageConvertTarget = typeof IMAGE_CONVERT_TARGETS[number]

const SVG_SOURCE = 'svg'
const ACCEPTED_SOURCE = new Set(['png', 'jpg', 'jpeg', 'webp', SVG_SOURCE, 'ico', 'icns'])

export interface ImageConvertConfig {
  target?: string
  /** ICO only: which sizes to embed. Ignored for other targets. */
  sizes?: unknown
  /** Re-encode quality for lossy targets (jpg/webp), 1..100. */
  quality?: number
}

function single(inputs: VerifiedInput[]): VerifiedInput {
  const found = inputs[0]
  if (!found) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')
  return found
}

function sourceExtension(input: VerifiedInput): string {
  return (input.extension || safeFileName(input.safeName).split('.').pop() || '').toLowerCase().replace('.', '')
}

function resolveTarget(raw: string | undefined): ImageConvertTarget {
  const value = String(raw ?? '').trim().toLowerCase()
  if ((IMAGE_CONVERT_TARGETS as readonly string[]).includes(value)) return value as ImageConvertTarget
  throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { field: 'target' })
}

function clampQuality(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 90
  return Math.min(100, Math.max(1, Math.round(n)))
}

function stemOf(name: string): string {
  return safeFileName(name).replace(/\.[^.]+$/, '') || 'image'
}

/** Decodes raster via the shared gate; SVG via canvas (the decoder only accepts rasters). */
async function decodeSource(input: VerifiedInput): Promise<RasterImage> {
  const ext = sourceExtension(input)
  const bytes = readFileSync(input.stagedPath)

  if (ext === SVG_SOURCE) {
    const image = await loadImage(bytes)
    const width = image.width
    const height = image.height
    if (width < 1 || height < 1) throw new Error('IMAGE_EMPTY')
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(0, 0, width, height).data
    return { data: new Uint8ClampedArray(data), width, height }
  }

  return decodeImage(new Uint8Array(bytes), ext)
}

/** Largest PNG payload inside an ICO becomes the inverse PNG. */
async function icoToPng(input: VerifiedInput): Promise<{ png: Uint8Array, width: number, height: number }> {
  const buffer = readFileSync(input.stagedPath)
  const { parseIcoDirectory } = await import('../image/ico')
  const entries = parseIcoDirectory(buffer).filter(entry => entry.endsWithPngSignature)
  if (!entries.length) throw new Error('ICO_NO_PNG_PAYLOAD')
  const largest = entries.reduce((a, b) => (b.width > a.width ? b : a))
  const png = new Uint8Array(buffer.subarray(largest.dataOffset, largest.dataOffset + largest.length))
  const image = await loadImage(Buffer.from(png))
  return { png, width: image.width, height: image.height }
}

/** Largest PNG payload inside an ICNS becomes the inverse PNG. */
async function icnsToPng(input: VerifiedInput): Promise<{ png: Uint8Array, width: number, height: number }> {
  const buffer = readFileSync(input.stagedPath)
  const { parseIcnsDirectory } = await import('../image/icns')
  const entries = parseIcnsDirectory(buffer).filter(entry => entry.png && entry.size > 0)
  if (!entries.length) throw new Error('ICNS_NO_PNG_PAYLOAD')
  const largest = entries.reduce((a, b) => (b.size > a.size ? b : a))
  const payloadLength = largest.length - 8
  const png = new Uint8Array(buffer.subarray(largest.dataOffset, largest.dataOffset + payloadLength))
  const image = await loadImage(Buffer.from(png))
  return { png, width: image.width, height: image.height }
}

function rasterTo(image: RasterImage, target: 'png' | 'jpg' | 'webp', quality: number): Uint8Array {
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  const buffer = ctx.createImageData(image.width, image.height)
  buffer.data.set(image.data)
  ctx.putImageData(buffer, 0, 0)
  if (target === 'png') return new Uint8Array(canvas.toBuffer('image/png'))
  if (target === 'jpg') {
    // JPEG has no alpha; flatten onto white so transparency reads predictably.
    const flat = createCanvas(image.width, image.height)
    const fctx = flat.getContext('2d')
    fctx.fillStyle = '#ffffff'
    fctx.fillRect(0, 0, image.width, image.height)
    fctx.drawImage(canvas, 0, 0)
    return new Uint8Array(flat.toBuffer('image/jpeg', quality))
  }
  return new Uint8Array(canvas.toBuffer('image/webp', quality))
}

function scaledPng(image: RasterImage, size: number): Uint8Array {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const source = createCanvas(image.width, image.height)
  const sctx = source.getContext('2d')
  const buffer = sctx.createImageData(image.width, image.height)
  buffer.data.set(image.data)
  sctx.putImageData(buffer, 0, 0)
  // Fit within the square, centred, transparent padding — icon-safe.
  const scale = Math.min(size / image.width, size / image.height)
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  ctx.drawImage(source, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
  return new Uint8Array(canvas.toBuffer('image/png'))
}

export class ImageConvertExecutor implements DocumentOperationExecutor<ImageConvertConfig> {
  readonly operationId = 'image.convert' as const

  async validateInputs(inputs: VerifiedInput[], config: ImageConvertConfig = {}): Promise<ValidationResult> {
    if (inputs.length !== 1) return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
    const input = inputs[0]!
    if (!ACCEPTED_SOURCE.has(sourceExtension(input))) {
      return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED' }] }
    }
    try {
      resolveTarget(config.target)
    } catch {
      return { ok: false, issues: [{ code: 'DOCUMENT_OPERATION_CONFIG_INVALID', details: { field: 'target' } }] }
    }
    return { ok: true, issues: [] }
  }

  async execute(context: OperationExecutionContext, config: ImageConvertConfig = {}) {
    const input = single(context.inputs)
    const target = resolveTarget(config.target)
    const stem = stemOf(input.safeName)
    const sourceExt = sourceExtension(input)

    // An icon source reads back to PNG: the payload inside is already a PNG.
    if ((sourceExt === 'ico' || sourceExt === 'icns') && target === 'png') {
      await context.onProgress({ totalUnits: 1, completedUnits: 0 })
      const { png } = sourceExt === 'icns' ? await icnsToPng(input) : await icoToPng(input)
      const fileName = `${stem}.png`
      const outPath = join(context.workspace.outputDir, fileName)
      writeFileAtomic(outPath, png)
      await context.onProgress({ totalUnits: 1, completedUnits: 1 })
      return { files: [{ fileName, mimeType: 'image/png', path: outPath, size: statSync(outPath).size }] }
    }
    if (sourceExt === 'ico' || sourceExt === 'icns') throw new DocumentError('DOCUMENT_OPERATION_CONFIG_INVALID', { field: 'target' })

    const image = await decodeSource(input)
    await context.onProgress({ totalUnits: 1, completedUnits: 0 })

    if (target === 'ico') {
      const sizes = normalizeIcoSizes(config.sizes)
      const payloads = sizes.map(size => ({ size, png: scaledPng(image, size) }))
      const ico = buildIco(payloads)
      const fileName = `${stem}.ico`
      const outPath = join(context.workspace.outputDir, fileName)
      writeFileAtomic(outPath, new Uint8Array(ico))

      // A 512 pick cannot live inside the ICO (one-byte dimension field); ship it
      // alongside as a PNG so the user still gets the size they asked for.
      const files = [{ fileName, mimeType: 'image/x-icon', path: outPath, size: statSync(outPath).size }]
      const requested = Array.isArray(config.sizes) ? config.sizes.map(Number) : []
      if (requested.includes(512) && (PNG_ICON_SIZES as readonly number[]).includes(512)) {
        const bigName = `${stem}_512.png`
        const bigPath = join(context.workspace.outputDir, bigName)
        writeFileAtomic(bigPath, scaledPng(image, 512))
        files.push({ fileName: bigName, mimeType: 'image/png', path: bigPath, size: statSync(bigPath).size })
      }

      await context.onProgress({ totalUnits: 1, completedUnits: 1 })
      return { files }
    }

    if (target === 'icns') {
      // ICNS stores 512 natively, so the picked ladder maps onto its own allowed
      // sizes (16/32/64/128/256/512) — anything off that ladder is dropped.
      const allowed = new Set<number>(ICNS_ALLOWED_SIZES)
      const requested = (Array.isArray(config.sizes) ? config.sizes.map(Number) : ICNS_ALLOWED_SIZES)
        .filter(size => allowed.has(size))
      const sizes = requested.length ? [...new Set(requested)].sort((a, b) => a - b) : ICNS_ALLOWED_SIZES
      const payloads = sizes.map(size => ({ size, png: scaledPng(image, size) }))
      const icns = buildIcns(payloads)
      const fileName = `${stem}.icns`
      const outPath = join(context.workspace.outputDir, fileName)
      writeFileAtomic(outPath, new Uint8Array(icns))
      await context.onProgress({ totalUnits: 1, completedUnits: 1 })
      return { files: [{ fileName, mimeType: 'image/icns', path: outPath, size: statSync(outPath).size }] }
    }

    const quality = clampQuality(config.quality)
    const bytes = rasterTo(image, target, quality)
    const mime = target === 'png' ? 'image/png' : target === 'jpg' ? 'image/jpeg' : 'image/webp'
    const fileName = `${stem}.${target}`
    const outPath = join(context.workspace.outputDir, fileName)
    writeFileAtomic(outPath, bytes)
    await context.onProgress({ totalUnits: 1, completedUnits: 1 })
    return { files: [{ fileName, mimeType: mime, path: outPath, size: statSync(outPath).size }] }
  }
}
