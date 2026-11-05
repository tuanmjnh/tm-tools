import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { config } from '#server/config'

export const pdfRoot = config.pdf.dir

export const pdfDirs = {
  root: pdfRoot,
  sources: join(pdfRoot, 'sources'),
  split: join(pdfRoot, 'split'),
  images: join(pdfRoot, 'images'),
  merged: join(pdfRoot, 'merged'),
  checkpoints: join(pdfRoot, 'checkpoints'),
  products: join(pdfRoot, 'products'),
  /** Every non-PDF input: docx, xlsx, csv, json, xml and images. */
  inputs: join(pdfRoot, 'inputs'),
  /** Uploaded Word documents (.docx) — legacy folder, still read as input. */
  word: join(pdfRoot, 'word'),
  /** Converted office files (docx/xlsx) offered for download. */
  office: join(pdfRoot, 'office'),
  /** Trash directory for soft-deleted files and folders. */
  trash: join(pdfRoot, '.trash')
} as const

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function ensurePdfDirs(): void {
  Object.values(pdfDirs).forEach(ensureDir)
}

/**
 * Writes through a hidden temp file in the same directory and renames it into
 * place. A crash mid-write can otherwise leave a truncated output that still
 * looks like a valid file to the listing.
 */
export function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
  encoding?: BufferEncoding
): void {
  const temp = join(dirname(target), `.${basename(target)}.tmp`)
  try {
    writeFileSync(temp, data, encoding)
    renameSync(temp, target)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/**
 * Resolves `target` and rejects it when a symlink or Windows junction redirects
 * it outside `root`. Path strings alone cannot catch this: `sources/escape/x`
 * is a clean relative path whose parent is a link pointing anywhere on disk.
 */
export function assertInsideRoot(root: string, target: string): string {
  const realRoot = realpathOrSelf(root)
  let current = target

  // Walk up to the first ancestor that exists: the leaf may be a file that is
  // about to be created, and realpathSync fails on paths that do not exist yet.
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  const realTarget = realpathOrSelf(current)
  const rel = relative(realRoot, realTarget)
  if (rel === '') return target
  if (rel.startsWith('..') || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error('PDF_INVALID_PATH')
  }
  return target
}
