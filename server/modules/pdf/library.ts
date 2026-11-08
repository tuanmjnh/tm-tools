import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfFileInfo, PdfFolderInfo, PdfLibrary } from '#shared/types/pdf'
import { config } from '#server/config'
import { ensureDir, ensurePdfDirs, pdfDirs, writeFileAtomic } from './paths'
import { recordAudit } from './audit'
import { listTrashItems, moveToTrash } from './trash'
import {
  documentStem,
  isImageName,
  isInputName,
  isLegacyWordName,
  isOfficeName,
  isPdfName,
  isWordName,
  naturalCompare,
  safeFileName,
  safeRelativePath,
  safeStem
} from './security'

export function listFiles(dir: string, accept: (name: string) => boolean): PdfFileInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(accept)
    .sort(naturalCompare)
    .map((name) => {
      const path = join(dir, name)
      const stats = statSync(path)
      return { name, path, size: stats.size, modifiedAt: stats.mtime.toISOString() }
    })
}

/**
 * Walks the whole `input/` root, including nested folders, so the library and
 * the home counters see every file the operator dropped in.
 */
function walkFiles(dir: string, prefix = ''): PdfFileInfo[] {
  if (!existsSync(dir)) return []
  const files: PdfFileInfo[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
    const absolute = join(dir, entry.name)
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute, relative))
    } else if (entry.isFile()) {
      const stats = statSync(absolute)
      files.push({
        name: entry.name,
        path: absolute,
        relativePath: relative,
        parentFolder: prefix,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      })
    }
  }
  return files.sort((a, b) => naturalCompare(a.name, b.name))
}

/**
 * Non-PDF inputs live in `input/`; the legacy `word/` folder is still read so
 * documents uploaded before the two-root layout stay visible and convertible.
 */
function listInputs(): PdfFileInfo[] {
  const current = walkFiles(pdfDirs.input).filter(file => isInputName(file.name))
  const legacy = listFiles(pdfDirs.word, name => isWordName(name))
    .filter(file => !current.some(entry => entry.name === file.name))
    .map(file => ({ ...file, legacy: true }))
  return [...current, ...legacy]
}

export function listFolders(dir: string): PdfFolderInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => statSync(join(dir, name)).isDirectory())
    .sort(naturalCompare)
    .map((name) => {
      const full = join(dir, name)
      const fileCount = readdirSync(full).filter(f => isPdfName(f) || isImageName(f)).length
      return { name, path: full, fileCount, modifiedAt: statSync(full).mtime.toISOString() }
    })
}

export function readLibrary(): PdfLibrary {
  ensurePdfDirs()
  const inputFiles = walkFiles(pdfDirs.input)
  return {
    input: inputFiles,
    output: listFolders(pdfDirs.output),
    // Legacy per-tool views are derived from the two roots for callers that
    // still read them; new code should use `input` / `output`.
    sources: inputFiles.filter(file => isPdfName(file.name)),
    inputs: listInputs(),
    split: listFolders(pdfDirs.split),
    images: listFolders(pdfDirs.images),
    merged: listFiles(pdfDirs.merged, isPdfName),
    products: listFiles(pdfDirs.products, name => /\.(csv|json|xlsx|docx|xml)$/i.test(name)),
    word: listFiles(pdfDirs.word, isWordName),
    office: listFiles(pdfDirs.office, isOfficeName),
    maxUploadMb: config.pdf.maxUploadMb,
    maxPages: config.pdf.maxPages,
    imageScale: config.pdf.imageScale,
    trashCount: listTrashItems().length
  }
}

function assertUpload(name: string, data: Buffer): void {
  if (data.length === 0) throw new Error('PDF_EMPTY_UPLOAD')
  if (data.length > config.pdf.maxUploadMb * 1024 * 1024) throw new Error('PDF_UPLOAD_TOO_LARGE')
  if (!name) throw new Error('PDF_NAME_REQUIRED')
}

export function saveSource(rawName: string, data: Buffer, rawFolder = ''): PdfFileInfo {
  const name = safeFileName(rawName)
  if (!isPdfName(name)) {
    throw new Error('PDF_INVALID_EXTENSION')
  }
  assertUpload(name, data)

  const folder = safeRelativePath(rawFolder)
  const targetDir = folder ? join(pdfDirs.input, folder) : pdfDirs.input
  ensureDir(targetDir)
  const target = join(targetDir, name)
  const overwritten = existsSync(target)
  writeFileAtomic(target, data)
  recordAudit({ action: 'upload', area: 'input', target: folder ? `${folder}/${name}` : name, bytes: data.length })
  return {
    name,
    path: target,
    relativePath: folder ? `${folder}/${name}` : name,
    parentFolder: folder,
    size: data.length,
    modifiedAt: statSync(target).mtime.toISOString(),
    overwritten
  }
}

/**
 * Word files are ordinary inputs now, so they land in the single `input/` root
 * next to the PDFs they get converted into.
 */
export function saveWord(rawName: string, data: Buffer): PdfFileInfo {
  const name = safeFileName(rawName)
  if (isLegacyWordName(name)) {
    // .doc is a binary Word 97 format; mammoth only understands OOXML.
    throw new Error('PDF_WORD_LEGACY')
  }
  if (!isWordName(name)) {
    throw new Error('PDF_WORD_INVALID')
  }
  assertUpload(name, data)

  ensureDir(pdfDirs.input)
  const target = join(pdfDirs.input, name)
  const overwritten = existsSync(target)
  writeFileAtomic(target, data)
  return { name, path: target, size: data.length, modifiedAt: statSync(target).mtime.toISOString(), overwritten }
}

function relativeOrThrow(rawName: string, code: string): string {
  let relative: string
  try {
    relative = safeRelativePath(rawName)
  } catch {
    throw new Error(code)
  }
  if (!relative) throw new Error(code)
  return relative
}

export function sourcePath(rawName: string): string {
  const relative = relativeOrThrow(rawName, 'PDF_SOURCE_NOT_FOUND')
  const target = join(pdfDirs.input, relative)
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error('PDF_SOURCE_NOT_FOUND')
  }
  return target
}

export function wordPath(rawName: string): string {
  const name = safeFileName(rawName)
  const current = join(pdfDirs.input, name)
  if (existsSync(current) && statSync(current).isFile()) return current
  const legacy = join(pdfDirs.word, name)
  if (existsSync(legacy)) return legacy
  throw new Error('PDF_WORD_NOT_FOUND')
}

export function outputPath(rawName: string): string {
  const name = safeFileName(rawName)
  const target = join(pdfDirs.merged, name)
  if (!existsSync(target)) throw new Error('PDF_OUTPUT_NOT_FOUND')
  return target
}

export function officePath(rawName: string): string {
  const name = safeFileName(rawName)
  const target = join(pdfDirs.office, name)
  if (!existsSync(target)) throw new Error('PDF_OFFICE_NOT_FOUND')
  return target
}

/** A source for extraction is either an uploaded PDF or an uploaded .docx. */
export function anySourcePath(rawName: string): { path: string, kind: 'pdf' | 'word', name: string } {
  const relative = relativeOrThrow(rawName, 'PDF_SOURCE_NOT_FOUND')
  const name = safeFileName(relative)
  if (isWordName(name)) {
    const current = join(pdfDirs.input, relative)
    if (existsSync(current) && statSync(current).isFile()) return { path: current, kind: 'word', name }
    return { path: wordPath(name), kind: 'word', name }
  }
  return { path: sourcePath(relative), kind: 'pdf', name }
}

function removeIfExists(path: string, recursive = false): void {
  if (existsSync(path)) rmSync(path, { recursive, force: true })
}

/**
 * Deleting a source removes everything derived from it. Before this, split
 * pages, rendered images and checkpoints stayed on disk forever.
 */
export function removeDerivedOutputs(rawName: string): void {
  const stem = safeStem(safeFileName(rawName))

  removeIfExists(join(pdfDirs.split, stem), true)
  removeIfExists(join(pdfDirs.images, stem), true)
  removeIfExists(join(pdfDirs.checkpoints, stem), true)
  removeIfExists(join(pdfDirs.merged, `${stem}_merged.pdf`))
  for (const extension of ['csv', 'json', 'xlsx', 'docx', 'xml']) {
    removeIfExists(join(pdfDirs.products, `${stem}_products.${extension}`))
  }
}

export function removeSource(rawName: string): void {
  const name = safeFileName(rawName)
  const path = sourcePath(rawName)

  moveToTrash('input', path, name)
  removeDerivedOutputs(name)
}

export function removeWord(rawName: string): void {
  const name = safeFileName(rawName)
  const path = wordPath(rawName)
  // Legacy files still physically live in the read-only `word/` folder.
  if (path.startsWith(pdfDirs.word)) throw new Error('PDF_FILE_IMMUTABLE')
  moveToTrash('input', path, name)
}

export function removeOutput(rawName: string): void {
  const path = outputPath(rawName)
  moveToTrash('output', path, safeFileName(rawName))
}

export function removeOffice(rawName: string): void {
  const path = officePath(rawName)
  moveToTrash('output', path, safeFileName(rawName))
}

export function removeProduct(rawName: string): void {
  const name = safeFileName(rawName)
  const target = join(pdfDirs.products, name)
  if (!existsSync(target)) throw new Error('PDF_RESULT_NOT_FOUND')
  moveToTrash('output', target, name)
}

export function removeFolder(baseDir: string, rawName: string): void {
  const name = safeFileName(rawName)
  const target = join(baseDir, name)
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }
  const area = baseDir === pdfDirs.input ? 'input' : 'output'
  moveToTrash(area, target, name)
}

export function splitDirName(rawName: string): string {
  // A .docx and the PDF converted from it must share split/images/checkpoints.
  return documentStem(rawName)
}
