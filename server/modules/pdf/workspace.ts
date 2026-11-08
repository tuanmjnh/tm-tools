import type {
  PdfAreaDescriptor,
  PdfFileArea,
  PdfOutputFolder,
  PdfWorkspaceAreaReport,
  PdfWorkspaceRepair,
  PdfWorkspaceReport
} from '#shared/types/pdf'
import { PDF_OUTPUT_FOLDERS } from '#shared/types/pdf'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AREA_DIRS, PDF_FILE_AREAS } from './inspect'
import { pdfDirs } from './paths'
import { recordAudit } from './audit'
import { isInputName, isPdfName } from './security'

/**
 * Workspace descriptor for one of the two roots. This is the only place that
 * decides what a root allows: routes and pages must ask here instead of
 * trusting the client or hard-coding per-root rules.
 */
const DESCRIPTORS: Record<PdfFileArea, Omit<PdfAreaDescriptor, 'area'>> = {
  input: { key: 'workspace.input', kind: 'source', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'all' },
  output: { key: 'workspace.output', kind: 'processing', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'all' }
}

/**
 * Subfolder of `output/` each tool writes to, centralised so tools never join
 * paths. The area is always `output`; only the subfolder varies.
 */
export const outputMapping = {
  split: 'split',
  merge: 'merged',
  rasterize: 'images',
  imagesToPdf: 'merged',
  convertInput: 'merged',
  export: 'office',
  extract: 'products'
} as const satisfies Record<string, PdfOutputFolder>

export type PdfOutputTool = keyof typeof outputMapping

export function areaDescriptor(area: PdfFileArea): PdfAreaDescriptor {
  const base = DESCRIPTORS[area]
  if (!base) throw new Error('PDF_FILE_NOT_FOUND')
  return { area, ...base }
}

export function areaDescriptors(): PdfAreaDescriptor[] {
  return PDF_FILE_AREAS.map(area => areaDescriptor(area))
}

/** The accept predicate used by directory listings and uploads. */
export function areaAcceptPredicate(area: PdfFileArea): (name: string) => boolean {
  switch (areaDescriptor(area).accept) {
    case 'pdf':
      return isPdfName
    case 'input':
      return isInputName
    default:
      return () => true
  }
}

/** Throws when a root forbids subfolder mutations. */
export function assertFolderWritable(area: PdfFileArea): void {
  if (areaDescriptor(area).writableFolders) return
  recordAudit({ action: 'denied', area, code: 'PDF_FOLDER_IMMUTABLE' })
  throw new Error('PDF_FOLDER_IMMUTABLE')
}

/** Throws when a root forbids file mutations. */
export function assertFileWritable(area: PdfFileArea): void {
  if (areaDescriptor(area).writableFiles) return
  recordAudit({ action: 'denied', area, code: 'PDF_FILE_IMMUTABLE' })
  throw new Error('PDF_FILE_IMMUTABLE')
}

/** Subfolder of `output/` a tool writes into. */
export function outputFolder(tool: PdfOutputTool): PdfOutputFolder {
  const folder = outputMapping[tool]
  if (!folder || !PDF_OUTPUT_FOLDERS.includes(folder)) throw new Error('PDF_FILE_NOT_FOUND')
  return folder
}

/** Every tool writes into the single `output` root. */
export function outputArea(_tool?: PdfOutputTool): PdfFileArea {
  return 'output'
}

/** Directory a tool writes into, resolved from the mapping above. */
export function outputDir(tool: PdfOutputTool): string {
  return join(pdfDirs.output, outputFolder(tool))
}

/** Root directory of a workspace root, so callers never join `pdfDirs` by hand. */
export function areaDir(area: PdfFileArea): string {
  const dir = AREA_DIRS[area]
  if (!dir) throw new Error('PDF_FILE_NOT_FOUND')
  return dir
}

/**
 * Read-only integrity snapshot. It never creates, moves or deletes anything;
 * repair stays a manual action.
 */
export function workspaceReport(): PdfWorkspaceReport {
  let needsRepair = false
  const reports = areaDescriptors().map((descriptor): PdfWorkspaceAreaReport => {
    const root = AREA_DIRS[descriptor.area]
    const exists = existsSync(root)
    if (!exists && descriptor.kind !== 'system') needsRepair = true

    let fileCount = 0
    let folderCount = 0
    if (exists) {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (String(entry.name).startsWith('.')) continue
        if (entry.isDirectory()) folderCount++
        else if (entry.isFile()) fileCount++
      }
    }

    return { ...descriptor, root, exists, fileCount, folderCount }
  })

  return { areas: reports, needsRepair, outputMapping: { ...outputMapping } }
}

/**
 * Recreates missing roots and the per-tool folders below `output/`. It only ever
 * creates directories the registry already declares, so a stray path can never
 * be produced.
 */
export function repairWorkspace(): PdfWorkspaceRepair {
  const created: PdfFileArea[] = []
  for (const descriptor of areaDescriptors()) {
    const root = AREA_DIRS[descriptor.area]
    if (existsSync(root)) continue
    mkdirSync(root, { recursive: true })
    created.push(descriptor.area)
  }
  for (const folder of PDF_OUTPUT_FOLDERS) {
    if (!existsSync(join(pdfDirs.output, folder))) mkdirSync(join(pdfDirs.output, folder), { recursive: true })
  }
  if (created.length) recordAudit({ action: 'repair', target: created.join(',') })
  return { created, needsRepair: workspaceReport().needsRepair }
}
