import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PDF_FILE_AREAS } from '#shared/types/pdf'
import type { PdfFileArea } from '#shared/types/pdf'
import { parseCsv, parseJson, parseXlsx, parseXml } from './data/parse'
import { assertInsideRoot, pdfDirs } from './paths'
import { safeFileName, safeRelativePath } from './security'

/**
 * Every previewable area of the workspace. The list is a whitelist: the generic
 * file endpoint only ever streams from one of these folders.
 */
export { PDF_FILE_AREAS } from '#shared/types/pdf'
export type { PdfFileArea } from '#shared/types/pdf'

export const AREA_DIRS: Record<PdfFileArea, string> = {
  sources: pdfDirs.sources,
  inputs: pdfDirs.inputs,
  word: pdfDirs.word,
  split: pdfDirs.split,
  images: pdfDirs.images,
  merged: pdfDirs.merged,
  products: pdfDirs.products,
  office: pdfDirs.office
}

export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8'
}

export function parseArea(raw: unknown): PdfFileArea {
  const area = String(raw ?? '').trim() as PdfFileArea
  if (!PDF_FILE_AREAS.includes(area)) throw new Error('PDF_FILE_NOT_FOUND')
  return area
}

/** Resolves `area + name` to an existing file, supporting subpaths and legacy fallback. */
export function resolveAreaFile(area: PdfFileArea, rawName: string): { path: string, name: string, extension: string } {
  let relative: string
  try {
    relative = safeRelativePath(rawName)
  } catch {
    relative = safeFileName(rawName)
  }
  if (!relative) throw new Error('PDF_FILE_NOT_FOUND')

  let filePath = join(AREA_DIRS[area], relative)
  let root = AREA_DIRS[area]!
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // If area is inputs and file not found in inputs, check legacy word folder
    if (area === 'inputs') {
      const fileNameOnly = relative.split('/').pop() || relative
      const legacyPath = join(pdfDirs.word, fileNameOnly)
      if (existsSync(legacyPath) && statSync(legacyPath).isFile()) {
        filePath = legacyPath
        root = pdfDirs.word
      } else {
        throw new Error('PDF_FILE_NOT_FOUND')
      }
    } else {
      throw new Error('PDF_FILE_NOT_FOUND')
    }
  }

  // The joined path can leave the area through a symlink or junction, so the
  // resolved location has to be checked against the root it actually came from.
  assertInsideRoot(root, filePath)

  const name = relative.split('/').pop() || relative
  return { path: filePath, name, extension: name.split('.').pop()?.toLowerCase() ?? '' }
}

export interface PdfInspectResult {
  name: string
  type: 'table' | 'json' | 'text' | 'html' | 'unsupported'
  rows?: string[][]
  text?: string
  /** Why a file cannot be previewed inline (e.g. docx needs a PDF conversion). */
  reason?: string
}

const TEXT_LIMIT = 200_000

/**
 * Reads a file the browser cannot render natively (csv/xlsx/json/xml/docx) so the
 * reusable preview components get rows, html or text instead of a download.
 */
export async function inspectFile(area: PdfFileArea, rawName: string): Promise<PdfInspectResult> {
  const { path, name, extension } = resolveAreaFile(area, rawName)

  if (extension === 'csv') {
    return { name, type: 'table', rows: parseCsv(readFileSync(path, 'utf8')) }
  }
  if (extension === 'json') {
    const text = readFileSync(path, 'utf8')
    return { name, type: 'json', text: text.slice(0, TEXT_LIMIT), rows: parseJson(text) }
  }
  if (extension === 'xml') {
    const text = readFileSync(path, 'utf8')
    return { name, type: 'text', text: text.slice(0, TEXT_LIMIT), rows: parseXml(text) }
  }
  if (extension === 'xlsx') {
    return { name, type: 'table', rows: await parseXlsx(readFileSync(path)) }
  }
  if (extension === 'docx') {
    try {
      const mammoth = await import('mammoth')
      const converter = mammoth as unknown as { default?: { convertToHtml: (arg: { path: string }) => Promise<{ value: string }> }, convertToHtml: (arg: { path: string }) => Promise<{ value: string }> }
      const fn = converter.default?.convertToHtml ?? converter.convertToHtml
      const result = await fn({ path })
      return { name, type: 'html', text: result.value }
    } catch {
      return { name, type: 'unsupported', reason: 'PDF_PREVIEW_NEEDS_PDF' }
    }
  }

  return { name, type: 'unsupported' }
}
