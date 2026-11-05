import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfFileInfo, PdfFolderInfo, PdfLibrary } from '#shared/types/pdf'
import { config } from '#server/config'
import { ensureDir, ensurePdfDirs, pdfDirs } from './paths'
import { listTrashItems, moveToTrash } from './trash'
import { assertFileWritable } from './workspace'
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
 * Non-PDF inputs live in `inputs/`; `word/` is still read so documents uploaded
 * before the folder existed stay visible (and convertible).
 */
function listInputs(): PdfFileInfo[] {
  const current = listFiles(pdfDirs.inputs, name => isInputName(name))
  const legacy = listFiles(pdfDirs.word, name => isWordName(name))
    .filter(file => !current.some(entry => entry.name === file.name))
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
  return {
    sources: listFiles(pdfDirs.sources, isPdfName),
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
  const targetDir = folder ? join(pdfDirs.sources, folder) : pdfDirs.sources
  ensureDir(targetDir)
  const target = join(targetDir, name)
  const overwritten = existsSync(target)
  writeFileSync(target, data)
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
 * Word files are stored next to the PDFs but kept in their own folder so the
 * "sources" list stays a list of PDFs the rest of the pipeline can split.
 */
export function saveWord(rawName: string, data: Buffer): PdfFileInfo {
  assertFileWritable('word')
  const name = safeFileName(rawName)
  if (isLegacyWordName(name)) {
    // .doc is a binary Word 97 format; mammoth only understands OOXML.
    throw new Error('PDF_WORD_LEGACY')
  }
  if (!isWordName(name)) {
    throw new Error('PDF_WORD_INVALID')
  }
  assertUpload(name, data)

  ensureDir(pdfDirs.word)
  const target = join(pdfDirs.word, name)
  const overwritten = existsSync(target)
  writeFileSync(target, data)
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
  const target = join(pdfDirs.sources, relative)
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error('PDF_SOURCE_NOT_FOUND')
  }
  return target
}

export function wordPath(rawName: string): string {
  const name = safeFileName(rawName)
  const target = join(pdfDirs.word, name)
  if (!existsSync(target)) throw new Error('PDF_WORD_NOT_FOUND')
  return target
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
  if (isWordName(name)) return { path: wordPath(name), kind: 'word', name }
  return { path: sourcePath(relative), kind: 'pdf', name }
}

function removeIfExists(path: string, recursive = false): void {
  if (existsSync(path)) rmSync(path, { recursive, force: true })
}

/**
 * Deleting a source removes everything derived from it. Before this, split
 * pages, rendered images and checkpoints stayed on disk forever.
 */
export function removeSource(rawName: string): void {
  const name = safeFileName(rawName)
  const stem = safeStem(name)
  const path = sourcePath(rawName)

  moveToTrash('sources', path, name)
  removeIfExists(join(pdfDirs.split, stem), true)
  removeIfExists(join(pdfDirs.images, stem), true)
  removeIfExists(join(pdfDirs.checkpoints, stem), true)
  removeIfExists(join(pdfDirs.merged, `${stem}_merged.pdf`))
  for (const extension of ['csv', 'json', 'xlsx', 'docx', 'xml']) {
    removeIfExists(join(pdfDirs.products, `${stem}_products.${extension}`))
  }
}

export function removeWord(rawName: string): void {
  assertFileWritable('word')
  const path = wordPath(rawName)
  moveToTrash('word', path, safeFileName(rawName))
}

export function removeOutput(rawName: string): void {
  const path = outputPath(rawName)
  moveToTrash('merged', path, safeFileName(rawName))
}

export function removeOffice(rawName: string): void {
  const path = officePath(rawName)
  moveToTrash('office', path, safeFileName(rawName))
}

export function removeProduct(rawName: string): void {
  const name = safeFileName(rawName)
  const target = join(pdfDirs.products, name)
  if (!existsSync(target)) throw new Error('PDF_RESULT_NOT_FOUND')
  moveToTrash('products', target, name)
}

export function removeFolder(baseDir: string, rawName: string): void {
  const name = safeFileName(rawName)
  const target = join(baseDir, name)
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }
  const area = Object.entries(pdfDirs).find(([_, p]) => p === baseDir)?.[0] || 'sources'
  moveToTrash(area, target, name)
}

export function splitDirName(rawName: string): string {
  // A .docx and the PDF converted from it must share split/images/checkpoints.
  return documentStem(rawName)
}
