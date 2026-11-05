import type {
  PdfAreaDescriptor,
  PdfFileArea,
  PdfWorkspaceAreaReport,
  PdfWorkspaceRepair,
  PdfWorkspaceReport
} from '#shared/types/pdf'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { AREA_DIRS, PDF_FILE_AREAS } from './inspect'
import { isInputName, isPdfName } from './security'

/**
 * Workspace descriptor for one PDF area. This is the only place that decides
 * what a folder allows: routes and pages must ask here instead of trusting the
 * client or hard-coding per-area rules.
 */
const DESCRIPTORS: Record<PdfFileArea, Omit<PdfAreaDescriptor, 'area'>> = {
  sources: { key: 'sources.pdf', kind: 'source', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'pdf' },
  inputs: { key: 'sources.inputs', kind: 'source', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'input' },
  word: { key: 'sources.word-legacy', kind: 'system', writableFiles: false, writableFolders: false, systemRoot: true, accept: 'input' },
  split: { key: 'processing.split', kind: 'processing', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'all' },
  images: { key: 'processing.images', kind: 'processing', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'all' },
  merged: { key: 'processing.merged', kind: 'processing', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'pdf' },
  products: { key: 'extraction.products', kind: 'extraction', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'all' },
  office: { key: 'extraction.office', kind: 'extraction', writableFiles: true, writableFolders: true, systemRoot: true, accept: 'all' }
}

/** Output folder each tool writes to, centralised so tools never join paths. */
export const outputMapping = {
  split: 'split',
  merge: 'merged',
  rasterize: 'images',
  imagesToPdf: 'merged',
  convertInput: 'merged',
  export: 'office',
  extract: 'products'
} as const satisfies Record<string, PdfFileArea>

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

/** Throws when an area forbids subfolder mutations (the legacy `word` folder). */
export function assertFolderWritable(area: PdfFileArea): void {
  if (!areaDescriptor(area).writableFolders) throw new Error('PDF_FOLDER_IMMUTABLE')
}

/** Throws when an area forbids file mutations (the legacy `word` folder). */
export function assertFileWritable(area: PdfFileArea): void {
  if (!areaDescriptor(area).writableFiles) throw new Error('PDF_FILE_IMMUTABLE')
}

export function outputArea(tool: keyof typeof outputMapping): PdfFileArea {
  const area = outputMapping[tool]
  if (!AREA_DIRS[area]) throw new Error('PDF_FILE_NOT_FOUND')
  return area
}

/** Directory a tool writes into, resolved from the mapping above. */
export function outputDir(tool: keyof typeof outputMapping): string {
  return AREA_DIRS[outputArea(tool)]
}

/** Root directory of an area, so callers never join `pdfDirs` by hand. */
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

    return { ...descriptor, exists, fileCount, folderCount }
  })

  return { areas: reports, needsRepair, outputMapping: { ...outputMapping } }
}

/**
 * Recreates missing area roots. It only ever creates directories that the
 * registry already declares, so a stray path can never be produced.
 */
export function repairWorkspace(): PdfWorkspaceRepair {
  const created: PdfFileArea[] = []
  for (const descriptor of areaDescriptors()) {
    const root = AREA_DIRS[descriptor.area]
    if (existsSync(root)) continue
    mkdirSync(root, { recursive: true })
    created.push(descriptor.area)
  }
  return { created, needsRepair: workspaceReport().needsRepair }
}
