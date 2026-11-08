import { copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { DocumentOperationId } from '#shared/types/document'
import type {
  DocumentOperationExecutor,
  OperationExecutionContext,
  OperationExecutionResult,
  ProducedFile,
  ValidationResult,
  VerifiedInput
} from './contracts'
import { DocumentError } from './operations'
import { splitPdf } from '../pdf/document'
import { mergePdfFolder } from '../pdf/merge'
import { imagesToPdf } from '../pdf/images-to-pdf'
import { rasterizePdf } from '../pdf/raster'
import { inputBufferToPdf } from '../pdf/convert'
import { pdfToDocx } from '../pdf/office/pdfToDocx'
import { writeProducts } from '../pdf/extract/export'
import { readCachedRows } from '../pdf/extract/jobs'
import { ensureDir, writeFileAtomic } from '../pdf/paths'
import { documentStem, naturalCompare, safeFileName, safeStem } from '../pdf/security'
import { config } from '#server/config'

const EXPORT_FORMATS = ['png', 'docx', 'xlsx', 'csv', 'json', 'xml'] as const
type ExportFormat = typeof EXPORT_FORMATS[number]

interface ExportConfig {
  formats?: unknown
}

function listFiles(dir: string, accept: (name: string) => boolean): ProducedFile[] {
  return readdirSync(dir)
    .filter(accept)
    .sort(naturalCompare)
    .map((name) => {
      const path = join(dir, name)
      return { fileName: name, path, size: statSync(path).size, mimeType: mimeOf(name) }
    })
}

function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'png': return 'image/png'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'csv': return 'text/csv'
    case 'json': return 'application/json'
    case 'xml': return 'application/xml'
    default: return 'application/octet-stream'
  }
}

function single(inputs: VerifiedInput[]): VerifiedInput {
  const input = inputs[0]
  if (!input) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')
  return input
}

function ok(): ValidationResult {
  return { ok: true, issues: [] }
}

/**
 * Engines that take a folder need the caller's file order. Copying the staged
 * files with a zero-padded prefix preserves the requested order through the
 * engine's own `naturalCompare` sort, so no engine is rewritten.
 */
function orderedFolder(inputs: VerifiedInput[], target: string): string {
  ensureDir(target)
  inputs.forEach((input, index) => {
    const prefix = String(index + 1).padStart(4, '0')
    copyFileSync(input.stagedPath, join(target, `${prefix}_${safeFileName(input.safeName)}`))
  })
  return target
}

class SplitExecutor implements DocumentOperationExecutor {
  readonly operationId: DocumentOperationId = 'pdf.split'

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length === 1 ? ok() : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
  }

  async execute(context: OperationExecutionContext): Promise<OperationExecutionResult> {
    const input = single(context.inputs)
    const result = await splitPdf(input.stagedPath, context.workspace.outputDir)
    await context.onProgress({ totalUnits: result.totalPages, completedUnits: result.totalPages })
    return { files: listFiles(context.workspace.outputDir, name => name.endsWith('.pdf')) }
  }
}

class MergeExecutor implements DocumentOperationExecutor {
  readonly operationId: DocumentOperationId = 'pdf.merge'

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length >= 2 ? ok() : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
  }

  async execute(context: OperationExecutionContext): Promise<OperationExecutionResult> {
    const working = orderedFolder(context.inputs, join(context.workspace.workingDir, 'merge'))
    const outputName = `${safeStem(context.inputs[0]?.safeName ?? 'document')}_merged.pdf`
    const result = await mergePdfFolder(working, context.workspace.outputDir, outputName)
    await context.onProgress({ totalUnits: result.pages, completedUnits: result.pages })
    return { files: [toProduced(result.output)] }
  }
}

class RasterizeExecutor implements DocumentOperationExecutor {
  readonly operationId: DocumentOperationId = 'pdf.rasterize'

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length === 1 ? ok() : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
  }

  async execute(context: OperationExecutionContext): Promise<OperationExecutionResult> {
    const input = single(context.inputs)
    const result = await rasterizePdf(input.stagedPath, context.workspace.outputDir, config.pdf.imageScale)
    await context.onProgress({ totalUnits: result.pages, completedUnits: result.pages })
    return { files: listFiles(context.workspace.outputDir, name => name.endsWith('.png')) }
  }
}

class ImagesToPdfExecutor implements DocumentOperationExecutor {
  readonly operationId: DocumentOperationId = 'pdf.images-to-pdf'

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length >= 1 ? ok() : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_REQUIRED' }] }
  }

  async execute(context: OperationExecutionContext): Promise<OperationExecutionResult> {
    const working = orderedFolder(context.inputs, join(context.workspace.workingDir, 'images'))
    const outputName = `${safeStem(context.inputs[0]?.safeName ?? 'images')}_from_images.pdf`
    const result = await imagesToPdf(working, context.workspace.outputDir, outputName)
    await context.onProgress({ totalUnits: result.pages, completedUnits: result.pages })
    return { files: [toProduced(result.output)] }
  }
}

class ConvertExecutor implements DocumentOperationExecutor {
  readonly operationId: DocumentOperationId = 'document.convert-to-pdf'

  async validateInputs(inputs: VerifiedInput[]): Promise<ValidationResult> {
    return inputs.length === 1 ? ok() : { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
  }

  async execute(context: OperationExecutionContext): Promise<OperationExecutionResult> {
    const input = single(context.inputs)
    const bytes = await inputBufferToPdf(input.safeName, readFileSync(input.stagedPath))
    const outputName = `${safeStem(input.safeName)}.pdf`
    const target = join(context.workspace.outputDir, outputName)
    writeFileAtomic(target, bytes)
    await context.onProgress({ totalUnits: 1, completedUnits: 1 })
    return { files: [toProduced(target)] }
  }
}

class ExportExecutor implements DocumentOperationExecutor<ExportConfig> {
  readonly operationId: DocumentOperationId = 'pdf.export'

  async validateInputs(inputs: VerifiedInput[], options: ExportConfig): Promise<ValidationResult> {
    const formats = normalizeFormats(options.formats)
    if (inputs.length !== 1) return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
    if (!formats.length) return { ok: false, issues: [{ code: 'DOCUMENT_EXPORT_NO_FORMAT' }] }
    return ok()
  }

  async execute(context: OperationExecutionContext, options: ExportConfig): Promise<OperationExecutionResult> {
    const input = single(context.inputs)
    const formats = normalizeFormats(options.formats)
    const stem = documentStem(input.safeName)
    const files: ProducedFile[] = []
    const failures: string[] = []

    for (const format of formats) {
      try {
        if (format === 'png') {
          // The job workspace is already per-job, so pages can live beside the
          // other artifacts; a subfolder would make the recorded artifact key
          // point at a file that the download route cannot resolve.
          await rasterizePdf(input.stagedPath, context.workspace.outputDir, imageScale())
          files.push(...listFiles(context.workspace.outputDir, name => name.endsWith('.png')))
          continue
        }
        if (format === 'docx') {
          const buffer = await pdfToDocx(readFileSync(input.stagedPath), stem)
          const target = join(context.workspace.outputDir, `${stem}.docx`)
          writeFileAtomic(target, buffer)
          files.push(toProduced(target))
          continue
        }

        // The tabular exports still read the rows a previous extraction cached
        // for this document; without them there is nothing to write.
        const rows = readCachedRows(input.safeName)
        if (!rows.length) {
          failures.push(format)
          continue
        }
        const written = await writeProducts(context.workspace.outputDir, `${stem}_products`, rows)
        const filePath = written[format as 'csv' | 'json' | 'xlsx' | 'docx' | 'xml']
        if (filePath) files.push(toProduced(filePath))
      } catch {
        failures.push(format)
      }
    }

    await context.onProgress({ totalUnits: formats.length, completedUnits: formats.length - failures.length })

    if (!files.length) throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY', { formats })
    return { files, failedUnits: failures.length }
  }
}

function normalizeFormats(raw: unknown): ExportFormat[] {
  const requested = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const valid = new Set<string>(EXPORT_FORMATS)
  const formats = requested
    .map(value => String(value).trim().toLowerCase())
    .filter(value => valid.has(value)) as ExportFormat[]
  return [...new Set(formats)]
}

function toProduced(path: string): ProducedFile {
  const fileName = basename(path)
  return { fileName, path, size: statSync(path).size, mimeType: mimeOf(fileName) }
}

const EXECUTORS: Record<string, DocumentOperationExecutor<never>> = {
  'pdf.split': new SplitExecutor() as unknown as DocumentOperationExecutor<never>,
  'pdf.merge': new MergeExecutor() as unknown as DocumentOperationExecutor<never>,
  'pdf.rasterize': new RasterizeExecutor() as unknown as DocumentOperationExecutor<never>,
  'pdf.images-to-pdf': new ImagesToPdfExecutor() as unknown as DocumentOperationExecutor<never>,
  'document.convert-to-pdf': new ConvertExecutor() as unknown as DocumentOperationExecutor<never>,
  'pdf.export': new ExportExecutor() as unknown as DocumentOperationExecutor<never>
}

export function executorFor(operationId: DocumentOperationId): DocumentOperationExecutor<never> {
  const executor = EXECUTORS[operationId]
  if (!executor) throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { operationId })
  return executor
}

export function hasExecutor(operationId: DocumentOperationId): boolean {
  return Boolean(EXECUTORS[operationId])
}

function imageScale(): number {
  return config.pdf.imageScale
}
