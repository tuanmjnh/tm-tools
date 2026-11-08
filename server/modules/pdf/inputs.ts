import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfFileInfo } from '#shared/types/pdf'
import { config } from '#server/config'
import { inputKind, isDataName, type PdfInputKind } from './data/parse'
import { listFiles } from './library'
import { ensureDir, pdfDirs, writeFileAtomic } from './paths'
import { recordAudit } from './audit'
import { isImageName, isWordName, safeFileName, safeRelativePath } from './security'
import { moveToTrash } from './trash'

/**
 * Inputs are the non-PDF half of the workspace: images and tabular/office files
 * that get converted into PDFs. They live in the single `input/` root, with the
 * old `word/` folder still read for files uploaded before the two-root layout.
 */
export const INPUT_ACCEPT = '.png,.jpg,.jpeg,.docx,.xlsx,.csv,.json,.xml'

export function acceptedInput(name: string): boolean {
  return inputKind(name) !== null
}

export function saveInput(rawName: string, data: Buffer, rawFolder = ''): PdfFileInfo {
  const name = safeFileName(rawName)
  const kind = inputKind(name)
  if (!kind) throw new Error('PDF_INPUT_INVALID')
  if (data.length === 0) throw new Error('PDF_EMPTY_UPLOAD')
  if (data.length > config.pdf.maxUploadMb * 1024 * 1024) throw new Error('PDF_UPLOAD_TOO_LARGE')

  const folder = safeRelativePath(rawFolder)
  const targetDir = folder ? join(pdfDirs.input, folder) : pdfDirs.input
  ensureDir(targetDir)

  const target = join(targetDir, name)
  const overwritten = existsSync(target)
  writeFileAtomic(target, data)
  const relativePath = folder ? `${folder}/${name}` : name
  recordAudit({ action: 'upload', area: 'input', target: relativePath, bytes: data.length })

  return {
    name,
    path: target,
    relativePath,
    parentFolder: folder,
    size: data.length,
    modifiedAt: statSync(target).mtime.toISOString(),
    overwritten
  }
}

function legacyPath(name: string): string | null {
  const target = join(pdfDirs.word, name)
  return existsSync(target) ? target : null
}

export function inputPath(rawName: string): string {
  let relative: string
  try {
    relative = safeRelativePath(rawName)
  } catch {
    relative = safeFileName(rawName)
  }
  const current = join(pdfDirs.input, relative)
  if (existsSync(current)) return current
  // Files uploaded before the two-root layout are still in `word/`.
  const legacy = legacyPath(relative.split('/').pop() || relative)
  if (legacy) return legacy
  throw new Error('PDF_INPUT_NOT_FOUND')
}

export function inputKindOf(rawName: string): PdfInputKind {
  const kind = inputKind(safeFileName(rawName))
  if (!kind) throw new Error('PDF_INPUT_INVALID')
  return kind
}

export function readInput(rawName: string): { path: string, kind: PdfInputKind, buffer: Buffer } {
  const path = inputPath(rawName)
  return { path, kind: inputKindOf(rawName), buffer: readFileSync(path) }
}

export function listInputs(): PdfFileInfo[] {
  const current = listFiles(pdfDirs.input, acceptedInput)
  const legacy = listFiles(pdfDirs.word, name => isWordName(name) && !current.some(entry => entry.name === name))
    .map(file => ({ ...file, legacy: true }))
  return [...current, ...legacy]
}

export function removeInput(rawName: string): void {
  const name = safeFileName(rawName)
  const path = inputPath(rawName)
  // A legacy file physically lives in `word/`, which stays read-only; routing
  // the delete through this helper must not bypass that.
  if (path.startsWith(pdfDirs.word)) throw new Error('PDF_FILE_IMMUTABLE')
  moveToTrash('input', path, name)
}

/** Files that can be previewed/edited as data instead of as a document. */
export function isTabularInput(name: string): boolean {
  return isDataName(name)
}

export function isImageInput(name: string): boolean {
  return isImageName(name)
}
