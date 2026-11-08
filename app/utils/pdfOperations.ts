import type { PdfFileArea } from '#shared/types/pdf'

export const PDF_OPERATION_IDS = [
  'split',
  'merge',
  'rasterize',
  'imagesToPdf',
  'convertInput',
  'export',
  'extract'
] as const

export type PdfOperationId = typeof PDF_OPERATION_IDS[number]

export type PdfOperationCategory = 'organize' | 'convert' | 'images' | 'export' | 'extract'

/** Home groups several categories into one column of cards. */
export type PdfOperationGroup = 'organize' | 'convert' | 'extract'

export type PdfOperationMappingKey = 'split' | 'merge' | 'rasterize' | 'imagesToPdf' | 'convertInput' | 'export' | 'extract'

export interface PdfOperationInput {
  mode: 'single-file' | 'folder'
  areas: PdfFileArea[]
  accept: 'pdf' | 'input' | 'image' | 'any'
}

export interface PdfOperationMeta {
  id: PdfOperationId
  titleKey: string
  descriptionKey: string
  category: PdfOperationCategory
  group: PdfOperationGroup
  icon: string
  route: string
  input: PdfOperationInput
  output: {
    /** Key in the server `outputMapping`; the area itself is never duplicated here. */
    mappingKey: PdfOperationMappingKey
  }
  execution: {
    mode: 'sync' | 'async'
    supportsCancel: boolean
    supportsOverwrite: boolean
  }
  config: 'none' | 'formats' | 'extraction'
  /** Shape of what the server writes, so the flow note can describe it. */
  resultHint: 'folder' | 'file' | 'multi-format'
}

export const PDF_OPERATIONS: readonly PdfOperationMeta[] = [
  {
    id: 'split',
    titleKey: 'pdf.operations.split.title',
    descriptionKey: 'pdf.operations.split.description',
    category: 'organize',
    group: 'organize',
    icon: 'i-lucide-scissors',
    route: '/pdf/split',
    input: { mode: 'single-file', areas: ['input'], accept: 'pdf' },
    output: { mappingKey: 'split' },
    execution: { mode: 'sync', supportsCancel: false, supportsOverwrite: true },
    config: 'none',
    resultHint: 'folder'
  },
  {
    id: 'merge',
    titleKey: 'pdf.operations.merge.title',
    descriptionKey: 'pdf.operations.merge.description',
    category: 'organize',
    group: 'organize',
    icon: 'i-lucide-layers',
    route: '/pdf/split',
    input: { mode: 'folder', areas: ['output'], accept: 'pdf' },
    output: { mappingKey: 'merge' },
    execution: { mode: 'sync', supportsCancel: false, supportsOverwrite: true },
    config: 'none',
    resultHint: 'file'
  },
  {
    id: 'rasterize',
    titleKey: 'pdf.operations.rasterize.title',
    descriptionKey: 'pdf.operations.rasterize.description',
    category: 'images',
    group: 'convert',
    icon: 'i-lucide-images',
    route: '/pdf/images',
    input: { mode: 'single-file', areas: ['input'], accept: 'pdf' },
    output: { mappingKey: 'rasterize' },
    execution: { mode: 'sync', supportsCancel: false, supportsOverwrite: true },
    config: 'none',
    resultHint: 'folder'
  },
  {
    id: 'imagesToPdf',
    titleKey: 'pdf.operations.imagesToPdf.title',
    descriptionKey: 'pdf.operations.imagesToPdf.description',
    category: 'images',
    group: 'convert',
    icon: 'i-lucide-file-image',
    route: '/pdf/images',
    input: { mode: 'folder', areas: ['output'], accept: 'image' },
    output: { mappingKey: 'imagesToPdf' },
    execution: { mode: 'sync', supportsCancel: false, supportsOverwrite: true },
    config: 'none',
    resultHint: 'file'
  },
  {
    id: 'convertInput',
    titleKey: 'pdf.operations.convertInput.title',
    descriptionKey: 'pdf.operations.convertInput.description',
    category: 'convert',
    group: 'convert',
    icon: 'i-lucide-file-input',
    route: '/pdf/import',
    input: { mode: 'single-file', areas: ['input'], accept: 'input' },
    output: { mappingKey: 'convertInput' },
    execution: { mode: 'sync', supportsCancel: false, supportsOverwrite: true },
    config: 'none',
    resultHint: 'file'
  },
  {
    id: 'export',
    titleKey: 'pdf.operations.export.title',
    descriptionKey: 'pdf.operations.export.description',
    category: 'export',
    group: 'convert',
    icon: 'i-lucide-share-2',
    route: '/pdf/export',
    input: { mode: 'single-file', areas: ['input'], accept: 'pdf' },
    output: { mappingKey: 'export' },
    execution: { mode: 'sync', supportsCancel: false, supportsOverwrite: true },
    config: 'formats',
    resultHint: 'multi-format'
  },
  {
    id: 'extract',
    titleKey: 'pdf.operations.extract.title',
    descriptionKey: 'pdf.operations.extract.description',
    category: 'extract',
    group: 'extract',
    icon: 'i-lucide-scan-text',
    route: '/pdf/extract',
    input: { mode: 'single-file', areas: ['input'], accept: 'pdf' },
    output: { mappingKey: 'extract' },
    execution: { mode: 'async', supportsCancel: true, supportsOverwrite: true },
    config: 'extraction',
    resultHint: 'multi-format'
  }
]

export const PDF_OPERATION_GROUPS: readonly PdfOperationGroup[] = ['organize', 'convert', 'extract']

export function pdfOperation(id: PdfOperationId): PdfOperationMeta {
  const operation = PDF_OPERATIONS.find(entry => entry.id === id)
  if (!operation) throw new Error(`Unknown PDF operation: ${id}`)
  return operation
}

function basename(name: string): string {
  return String(name ?? '').split(/[\\/]/).pop() || ''
}

// Name formulas mirror `server/modules/pdf/security.ts`; the server name always wins once a run returns it.
export function pdfDocumentStem(name: string): string {
  return basename(name).replace(/\.(pdf|docx|doc)$/i, '')
}

export function pdfInputStem(name: string): string {
  return basename(name).replace(/\.pdf$/i, '')
}

export function pdfPageFileName(pageNumber: number, prefix = 'page_', pad = 4): string {
  return `${prefix}${String(pageNumber).padStart(pad, '0')}`
}

export function pdfMergeOutputName(folder: string): string {
  return `${basename(folder)}_merged.pdf`
}

export function pdfImagesToPdfOutputName(folder: string): string {
  return `${basename(folder)}_from_images.pdf`
}

export function pdfConvertOutputName(name: string): string {
  return `${pdfInputStem(name)}.pdf`
}

export function pdfProductsStem(stem: string): string {
  return `${basename(stem)}_products`
}
