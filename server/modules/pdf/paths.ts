import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
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
