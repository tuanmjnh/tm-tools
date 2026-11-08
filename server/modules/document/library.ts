import { existsSync, readdirSync, statSync, mkdirSync, rmSync, renameSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { documentDirs } from './paths'
import { DocumentError } from './operations'

export type DocumentLibraryRoot = 'input' | 'output'

export interface DocumentLibraryItem {
  name: string
  relativePath: string
  root: DocumentLibraryRoot
  isFolder: boolean
  size: number
  fileCount?: number
  mimeType?: string
  modifiedAt: string
}

export interface DocumentLibraryFolderTree {
  name: string
  path: string
  children: DocumentLibraryFolderTree[]
}

function assertInside(parent: string, child: string) {
  const rel = relative(parent, child)
  if (rel.startsWith('..') || rel === child) {
    throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { reason: 'path traversal rejected' })
  }
}

function resolveRootPath(root: DocumentLibraryRoot): string {
  if (root === 'input') return documentDirs.input
  if (root === 'output') return documentDirs.output
  throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { root })
}

export function listLibraryDirectory(root: DocumentLibraryRoot, subFolder = ''): {
  root: DocumentLibraryRoot
  folder: string
  items: DocumentLibraryItem[]
} {
  const rootDir = resolveRootPath(root)
  if (!existsSync(rootDir)) mkdirSync(rootDir, { recursive: true })

  const cleanSub = subFolder ? subFolder.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '') : ''
  const targetDir = cleanSub ? join(rootDir, cleanSub) : rootDir

  if (!existsSync(targetDir)) {
    throw new DocumentError('DOCUMENT_JOB_NOT_FOUND', { path: subFolder })
  }
  assertInside(rootDir, targetDir)

  const entries = readdirSync(targetDir, { withFileTypes: true })
  const items: DocumentLibraryItem[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(targetDir, entry.name)
    const rel = cleanSub ? `${cleanSub}/${entry.name}` : entry.name
    try {
      const stats = statSync(fullPath)
      if (entry.isDirectory()) {
        const children = readdirSync(fullPath).filter(name => !name.startsWith('.'))
        items.push({
          name: entry.name,
          relativePath: rel,
          root,
          isFolder: true,
          size: stats.size,
          fileCount: children.length,
          modifiedAt: stats.mtime.toISOString()
        })
      } else if (entry.isFile()) {
        items.push({
          name: entry.name,
          relativePath: rel,
          root,
          isFolder: false,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        })
      }
    } catch {
      // skip unreadable
    }
  }

  // Sort folders first, then natural name
  items.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  return {
    root,
    folder: cleanSub,
    items
  }
}

export function createLibraryFolder(root: DocumentLibraryRoot, parentFolder: string, name: string): DocumentLibraryItem {
  const rootDir = resolveRootPath(root)
  const cleanParent = parentFolder ? parentFolder.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '') : ''
  const cleanName = name.trim().replace(/[/\\]/g, '')
  if (!cleanName) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

  const targetDir = cleanParent ? join(rootDir, cleanParent, cleanName) : join(rootDir, cleanName)
  assertInside(rootDir, targetDir)

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  const stats = statSync(targetDir)
  const rel = cleanParent ? `${cleanParent}/${cleanName}` : cleanName

  return {
    name: cleanName,
    relativePath: rel,
    root,
    isFolder: true,
    size: stats.size,
    fileCount: 0,
    modifiedAt: stats.mtime.toISOString()
  }
}

export function deleteLibraryItem(root: DocumentLibraryRoot, itemPath: string): { success: boolean } {
  const rootDir = resolveRootPath(root)
  const cleanPath = itemPath.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
  if (!cleanPath) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

  const target = join(rootDir, cleanPath)
  assertInside(rootDir, target)

  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
  return { success: true }
}

export function renameLibraryItem(root: DocumentLibraryRoot, itemPath: string, newName: string): DocumentLibraryItem {
  const rootDir = resolveRootPath(root)
  const cleanPath = itemPath.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
  const cleanName = newName.trim().replace(/[/\\]/g, '')
  if (!cleanPath || !cleanName) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

  const target = join(rootDir, cleanPath)
  assertInside(rootDir, target)
  if (!existsSync(target)) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

  const parentDir = join(target, '..')
  const newTarget = join(parentDir, cleanName)
  assertInside(rootDir, newTarget)

  renameSync(target, newTarget)
  const stats = statSync(newTarget)
  const isFolder = stats.isDirectory()
  const relParent = relative(rootDir, parentDir)
  const rel = relParent && relParent !== '.' ? `${relParent}/${cleanName}` : cleanName

  return {
    name: cleanName,
    relativePath: rel,
    root,
    isFolder,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString()
  }
}
