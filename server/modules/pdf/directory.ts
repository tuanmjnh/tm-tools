import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import type { PdfDirectoryListing, PdfFileInfo, PdfFolderInfo, PdfFolderTreeNode } from '#shared/types/pdf'
import { AREA_DIRS, type PdfFileArea } from './inspect'
import { ensureDir, assertInsideRoot, pdfDirs } from './paths'
import { naturalCompare, safeFileName, safeRelativePath } from './security'
import { moveToTrash } from './trash'
import { removeDerivedOutputs } from './library'
import { recordAudit } from './audit'
import { assertFileWritable, assertFolderWritable } from './workspace'

/**
 * Returns contents of a directory (subfolders and files) at `relativePath` within `area`.
 */
export function listAreaDirectory(
  area: PdfFileArea,
  rawRelativeFolder = '',
  acceptFile: (name: string) => boolean = () => true
): PdfDirectoryListing {
  const areaRoot = AREA_DIRS[area]
  if (!areaRoot) throw new Error('PDF_FILE_NOT_FOUND')
  ensureDir(areaRoot)

  const currentFolder = safeRelativePath(rawRelativeFolder)
  const currentAbsPath = currentFolder ? join(areaRoot, currentFolder) : areaRoot

  if (!existsSync(currentAbsPath) || !statSync(currentAbsPath).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }
  assertInsideRoot(areaRoot, currentAbsPath)

  // Calculate breadcrumbs
  const breadcrumbs: Array<{ name: string, path: string }> = []
  if (currentFolder) {
    const parts = currentFolder.split('/')
    let accum = ''
    for (const part of parts) {
      accum = accum ? `${accum}/${part}` : part
      breadcrumbs.push({ name: part, path: accum })
    }
  }

  const parentFolder = currentFolder
    ? (breadcrumbs.length > 1 ? (breadcrumbs[breadcrumbs.length - 2]?.path ?? '') : '')
    : null

  const entries = readdirSync(currentAbsPath, { withFileTypes: true })
  const folders: PdfFolderInfo[] = []
  const files: PdfFileInfo[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue // Skip hidden like .trash
    // Links are never workspace content: following one would leave the area.
    if (entry.isSymbolicLink()) continue
    const entryAbsPath = join(currentAbsPath, entry.name)
    const stats = statSync(entryAbsPath)
    const entryRelative = currentFolder ? `${currentFolder}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      let fileCount: number
      try {
        fileCount = readdirSync(entryAbsPath, { withFileTypes: true })
          .filter(item => item.isFile() && !item.name.startsWith('.')).length
      } catch {
        fileCount = 0
      }
      folders.push({
        name: entry.name,
        path: entryAbsPath,
        relativePath: entryRelative,
        parentFolder: currentFolder,
        fileCount,
        modifiedAt: stats.mtime.toISOString()
      })
    } else if (entry.isFile() && acceptFile(entry.name)) {
      files.push({
        name: entry.name,
        path: entryAbsPath,
        relativePath: entryRelative,
        parentFolder: currentFolder,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      })
    }
  }

  // If in root of inputs area, include legacy files from word directory that aren't already present
  if (area === 'inputs' && !currentFolder && existsSync(pdfDirs.word)) {
    const wordEntries = readdirSync(pdfDirs.word, { withFileTypes: true })
    for (const entry of wordEntries) {
      if (entry.isFile() && acceptFile(entry.name) && !files.some(f => f.name === entry.name)) {
        const entryAbsPath = join(pdfDirs.word, entry.name)
        const stats = statSync(entryAbsPath)
        files.push({
          name: entry.name,
          path: entryAbsPath,
          relativePath: entry.name,
          parentFolder: '',
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        })
      }
    }
  }

  folders.sort((a, b) => naturalCompare(a.name, b.name))
  files.sort((a, b) => naturalCompare(a.name, b.name))

  return {
    area,
    currentFolder,
    parentFolder,
    breadcrumbs,
    folders,
    files,
    tree: getAreaFolderTree(area, 1)
  }
}

/**
 * Creates a new folder at `parentFolder/name` within `area`.
 */
export function createAreaFolder(area: PdfFileArea, rawParentFolder: string, rawName: string): PdfFolderInfo {
  assertFolderWritable(area)
  const areaRoot = AREA_DIRS[area]
  if (!areaRoot) throw new Error('PDF_FILE_NOT_FOUND')
  ensureDir(areaRoot)

  const parentFolder = safeRelativePath(rawParentFolder)
  const name = safeFileName(rawName)
  const parentAbs = parentFolder ? join(areaRoot, parentFolder) : areaRoot

  if (!existsSync(parentAbs) || !statSync(parentAbs).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }

  const targetAbs = join(parentAbs, name)
  if (existsSync(targetAbs)) {
    throw new Error('PDF_FOLDER_ALREADY_EXISTS')
  }

  mkdirSync(targetAbs, { recursive: true })
  const stats = statSync(targetAbs)
  const relativePath = parentFolder ? `${parentFolder}/${name}` : name

  recordAudit({ action: 'folder-create', area, target: relativePath })

  return {
    name,
    path: targetAbs,
    relativePath,
    parentFolder,
    fileCount: 0,
    modifiedAt: stats.mtime.toISOString()
  }
}

/**
 * Renames a file or folder at `relativePath` within `area` to `newName`.
 */
export function renameAreaItem(
  area: PdfFileArea,
  rawRelativePath: string,
  rawNewName: string
): { oldPath: string, newPath: string, newRelativePath: string, name: string } {
  const areaRoot = AREA_DIRS[area]
  if (!areaRoot) throw new Error('PDF_FILE_NOT_FOUND')

  const relativePath = safeRelativePath(rawRelativePath)
  if (!relativePath) throw new Error('PDF_INVALID_PATH')

  const newName = safeFileName(rawNewName)
  const targetAbs = join(areaRoot, relativePath)

  if (!existsSync(targetAbs)) {
    throw new Error('PDF_FILE_NOT_FOUND')
  }
  assertInsideRoot(areaRoot, targetAbs)

  if (statSync(targetAbs).isDirectory()) assertFolderWritable(area)
  else assertFileWritable(area)

  const parentAbs = dirname(targetAbs)
  const sourceName = basename(targetAbs)
  const newAbs = join(parentAbs, newName)

  // A case-insensitive filesystem reports the source itself as existing, so a
  // case-only rename would look like a clash. Compare real directory entries
  // instead: only a *different* entry that folds to the same name is a conflict.
  const clashes = readdirSync(parentAbs).some(
    entry => entry !== sourceName && entry.toLowerCase() === newName.toLowerCase()
  )
  if (clashes) {
    throw new Error('PDF_FILE_ALREADY_EXISTS')
  }

  renameSync(targetAbs, newAbs)

  const parentRelative = relativePath.includes('/') ? dirname(relativePath).replace(/\\/g, '/') : ''
  const newRelativePath = parentRelative ? `${parentRelative}/${newName}` : newName

  recordAudit({ action: 'rename', area, target: relativePath, to: newRelativePath })

  return {
    oldPath: targetAbs,
    newPath: newAbs,
    newRelativePath,
    name: newName
  }
}

/**
 * Builds folder nodes under `currentDir`. `depth` counts the levels already
 * walked from the requested root; once it reaches `maxDepth`, children are
 * reported through `hasChildren` instead of being read.
 */
function buildFolderNodes(
  currentDir: string,
  currentRelative: string,
  depth: number,
  maxDepth: number
): PdfFolderTreeNode[] {
  const subfolders: PdfFolderTreeNode[] = []
  try {
    const entries = readdirSync(currentDir, { withFileTypes: true, encoding: 'utf8' })
    for (const entry of entries) {
      const entryName = String(entry.name)
      if (entryName.startsWith('.')) continue
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        const subAbs = join(currentDir, entryName)
        const subRelative = currentRelative ? `${currentRelative}/${entryName}` : entryName
        let fileCount = 0
        let hasSubfolders = false
        try {
          const children = readdirSync(subAbs, { withFileTypes: true })
          fileCount = children.filter(item => item.isFile() && !item.name.startsWith('.')).length
          hasSubfolders = children.some(item => item.isDirectory() && !item.name.startsWith('.') && !item.isSymbolicLink())
        } catch {
          fileCount = 0
        }

        const truncated = depth + 1 >= maxDepth
        const descendants = truncated ? [] : buildFolderNodes(subAbs, subRelative, depth + 1, maxDepth)
        subfolders.push({
          id: subRelative,
          label: entryName,
          path: subAbs,
          relativePath: subRelative,
          fileCount,
          children: descendants.length ? descendants : undefined,
          hasChildren: truncated && hasSubfolders ? true : undefined
        })
      }
    }
  } catch {
    return []
  }

  subfolders.sort((a, b) => naturalCompare(a.label, b.label))
  return subfolders
}

/**
 * Recursively builds a folder tree for the given area. `maxDepth` bounds the walk
 * so the explorer can load the first level only and fetch the rest per node.
 */
export function getAreaFolderTree(area: PdfFileArea, maxDepth = Number.POSITIVE_INFINITY): PdfFolderTreeNode[] {
  const areaRoot = AREA_DIRS[area]
  if (!areaRoot || !existsSync(areaRoot)) return []
  return buildFolderNodes(areaRoot, '', 0, maxDepth)
}

/** Subfolders of one folder inside an area, for expanding a lazy tree node. */
export function getAreaFolderChildren(
  area: PdfFileArea,
  rawRelativeFolder: string,
  maxDepth = 1
): PdfFolderTreeNode[] {
  const areaRoot = AREA_DIRS[area]
  if (!areaRoot) throw new Error('PDF_FILE_NOT_FOUND')

  const relative = safeRelativePath(rawRelativeFolder)
  const abs = relative ? join(areaRoot, relative) : areaRoot
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error('PDF_FOLDER_NOT_FOUND')
  }
  assertInsideRoot(areaRoot, abs)

  return buildFolderNodes(abs, relative, 0, maxDepth)
}

/**
 * Soft deletes a file or folder by moving it to trash.
 */
export function deleteAreaItem(area: PdfFileArea, rawRelativePath: string) {
  const areaRoot = AREA_DIRS[area]
  if (!areaRoot) throw new Error('PDF_FILE_NOT_FOUND')

  const relativePath = safeRelativePath(rawRelativePath)
  if (!relativePath) throw new Error('PDF_INVALID_PATH')

  let targetAbs = join(areaRoot, relativePath)
  if (!existsSync(targetAbs)) {
    // If input area, check legacy word folder fallback
    if (area === 'inputs') {
      const fileName = relativePath.split('/').pop() || relativePath
      const legacyAbs = join(AREA_DIRS.word, fileName)
      if (existsSync(legacyAbs)) {
        targetAbs = legacyAbs
      } else {
        throw new Error('PDF_FILE_NOT_FOUND')
      }
    } else {
      throw new Error('PDF_FILE_NOT_FOUND')
    }
  }

  if (statSync(targetAbs).isDirectory()) assertFolderWritable(area)
  else assertFileWritable(area)

  assertInsideRoot(areaRoot, targetAbs)

  const item = moveToTrash(area, targetAbs, relativePath)
  if (area === 'sources') removeDerivedOutputs(relativePath)
  recordAudit({ action: 'delete', area, target: relativePath, bytes: item.size })
  return item
}
