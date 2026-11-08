import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { config } from '#server/config'

export const pdfRoot = config.pdf.dir

const outputRoot = join(pdfRoot, 'output')

/**
 * Two roots only: `input/` holds everything the operator feeds in, `output/`
 * holds everything a tool produces. The per-tool folders are ordinary
 * subfolders of `output/`, not areas of their own.
 */
export const pdfDirs = {
  root: pdfRoot,
  input: join(pdfRoot, 'input'),
  output: outputRoot,
  split: join(outputRoot, 'split'),
  images: join(outputRoot, 'images'),
  merged: join(outputRoot, 'merged'),
  products: join(outputRoot, 'products'),
  office: join(outputRoot, 'office'),
  checkpoints: join(pdfRoot, 'checkpoints'),
  /** Legacy read-only Word folder, still listed as an input. */
  word: join(pdfRoot, 'word'),
  /** Internal state that is not user data: job journals and similar. */
  system: join(pdfRoot, '.system'),
  /** Trash directory for soft-deleted files and folders. */
  trash: join(pdfRoot, '.trash')
} as const

/** Previous top-level folders and where their content belongs now. */
const LEGACY_DIRS: Array<[legacy: string, target: string]> = [
  ['sources', pdfDirs.input],
  ['inputs', pdfDirs.input],
  ['split', pdfDirs.split],
  ['images', pdfDirs.images],
  ['merged', pdfDirs.merged],
  ['products', pdfDirs.products],
  ['office', pdfDirs.office]
]

/**
 * Moves files written by the old per-area layout into the two roots. It only
 * ever moves entries whose destination name is still free, so a repeated run
 * never overwrites newer data.
 */
function migrateLegacyDirs(): void {
  for (const [legacyName, target] of LEGACY_DIRS) {
    const legacy = join(pdfRoot, legacyName)
    if (!existsSync(legacy) || legacy === target) continue
    let entries
    try {
      entries = readdirSync(legacy, { withFileTypes: true })
    } catch {
      continue
    }
    if (!entries.length) continue
    mkdirSync(target, { recursive: true })
    for (const entry of entries) {
      const from = join(legacy, entry.name)
      const to = join(target, entry.name)
      if (existsSync(to)) continue
      try {
        renameSync(from, to)
      } catch {
        try {
          if (entry.isDirectory()) cpSync(from, to, { recursive: true, errorOnExist: true })
          else copyFileSync(from, to, 1)
          rmSync(from, { recursive: entry.isDirectory(), force: true })
        } catch {
          // A locked file stays where it is; the next run retries.
        }
      }
    }
  }
}

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function ensurePdfDirs(): void {
  Object.values(pdfDirs).forEach(ensureDir)
  migrateLegacyDirs()
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
