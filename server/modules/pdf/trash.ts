import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { PdfFileArea, PdfTrashItem } from '#shared/types/pdf'
import { recordAudit } from './audit'
import { ensureDir, pdfDirs, writeFileAtomic } from './paths'
import { safeFileName } from './security'
import { assertFileWritable } from './workspace'

const METADATA_FILE = 'trash_metadata.json'

function getTrashMetadataPath(): string {
  return join(pdfDirs.trash, METADATA_FILE)
}

function readTrashMetadata(): Record<string, PdfTrashItem> {
  ensureDir(pdfDirs.trash)
  const metaPath = getTrashMetadataPath()
  if (!existsSync(metaPath)) return {}
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, PdfTrashItem>
  } catch {
    return {}
  }
}

function writeTrashMetadata(meta: Record<string, PdfTrashItem>): void {
  ensureDir(pdfDirs.trash)
  writeFileAtomic(getTrashMetadataPath(), JSON.stringify(meta, null, 2), 'utf8')
}

function withoutKey(meta: Record<string, PdfTrashItem>, key: string): Record<string, PdfTrashItem> {
  return Object.fromEntries(Object.entries(meta).filter(([id]) => id !== key))
}

function calculateDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0
  let total = 0
  const entries = readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += calculateDirSize(full)
    } else {
      total += statSync(full).size
    }
  }
  return total
}

/**
 * Moves a file or folder into the .trash folder and logs metadata for restoration.
 */
export function moveToTrash(area: string, targetPath: string, relativePath?: string): PdfTrashItem {
  if (!existsSync(targetPath)) {
    throw new Error('PDF_FILE_NOT_FOUND')
  }

  ensureDir(pdfDirs.trash)
  const isDirectory = statSync(targetPath).isDirectory()
  const originalName = basename(targetPath)
  const resolvedRelative = relativePath || originalName
  const size = isDirectory ? calculateDirSize(targetPath) : statSync(targetPath).size

  const id = `${Date.now()}_${safeFileName(originalName)}`
  const trashDestination = join(pdfDirs.trash, id)

  // Move file or directory to trash
  renameSync(targetPath, trashDestination)

  const item: PdfTrashItem = {
    id,
    originalName,
    originalRelativePath: resolvedRelative,
    originalPath: targetPath,
    area,
    isDirectory,
    size,
    deletedAt: new Date().toISOString()
  }

  const meta = readTrashMetadata()
  meta[id] = item
  writeTrashMetadata(meta)

  return item
}

export function listTrashItems(): PdfTrashItem[] {
  ensureDir(pdfDirs.trash)
  const meta = readTrashMetadata()
  const validItems: PdfTrashItem[] = []
  let hasStale = false

  for (const [id, item] of Object.entries(meta)) {
    const itemPath = join(pdfDirs.trash, id)
    if (existsSync(itemPath)) {
      validItems.push(item)
    } else {
      hasStale = true
    }
  }

  if (hasStale) {
    writeTrashMetadata(Object.fromEntries(
      validItems.map(item => [item.id, item])
    ))
  }

  // Newest deleted first
  return validItems.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

export function restoreTrashItem(id: string): PdfTrashItem {
  const cleanId = safeFileName(id)
  const meta = readTrashMetadata()
  const item = meta[cleanId]

  if (!item) {
    throw new Error('PDF_TRASH_ITEM_NOT_FOUND')
  }

  assertFileWritable(item.area as PdfFileArea)

  const trashPath = join(pdfDirs.trash, cleanId)
  if (!existsSync(trashPath)) {
    writeTrashMetadata(withoutKey(meta, cleanId))
    throw new Error('PDF_TRASH_ITEM_NOT_FOUND')
  }

  // Ensure parent directory exists for destination
  const destDir = dirname(item.originalPath)
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  }

  let finalDestination = item.originalPath
  if (existsSync(finalDestination)) {
    // If a file with same name already exists, add (restored-timestamp)
    const ext = item.isDirectory ? '' : `.${item.originalName.split('.').pop()}`
    const stem = item.isDirectory ? item.originalName : item.originalName.replace(/\.[^/.]+$/, '')
    finalDestination = join(destDir, `${stem}_restored_${Date.now()}${ext}`)
  }

  renameSync(trashPath, finalDestination)
  writeTrashMetadata(withoutKey(meta, cleanId))
  recordAudit({ action: 'restore', area: item.area, target: item.originalRelativePath })

  return item
}

export function deleteTrashItemPermanently(id: string): void {
  const cleanId = safeFileName(id)
  const meta = readTrashMetadata()
  const trashPath = join(pdfDirs.trash, cleanId)

  if (existsSync(trashPath)) {
    rmSync(trashPath, { recursive: true, force: true })
    recordAudit({ action: 'purge', area: meta[cleanId]?.area, target: meta[cleanId]?.originalRelativePath })
  }

  writeTrashMetadata(withoutKey(meta, cleanId))
}

export function emptyTrash(): void {
  ensureDir(pdfDirs.trash)
  const entries = readdirSync(pdfDirs.trash)
  for (const entry of entries) {
    const full = join(pdfDirs.trash, entry)
    rmSync(full, { recursive: true, force: true })
  }
  if (entries.length) recordAudit({ action: 'purge', target: `empty-trash:${entries.length}` })
  writeTrashMetadata({})
}
