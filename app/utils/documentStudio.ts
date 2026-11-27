import type { DocumentOperationId } from '#shared/types/document'

/**
 * Local operation catalogue. The server returns `available` per operation, but
 * the page needs titles and icons before the request resolves, so the stable
 * parts are mirrored here and the runtime decides availability.
 */
export interface DocumentStudioOperation {
  id: DocumentOperationId
  titleKey: string
  descriptionKey: string
  icon: string
  route: string
  category: 'pdf' | 'convert' | 'image' | 'extract' | 'export'
}

export const DOCUMENT_STUDIO_OPERATIONS: readonly DocumentStudioOperation[] = [
  {
    id: 'pdf.split',
    titleKey: 'document.operations.split.title',
    descriptionKey: 'document.operations.split.description',
    icon: 'i-lucide-scissors',
    route: '/document-studio/tools/split',
    category: 'pdf'
  },
  {
    id: 'pdf.merge',
    titleKey: 'document.operations.merge.title',
    descriptionKey: 'document.operations.merge.description',
    icon: 'i-lucide-layers',
    route: '/document-studio/tools/merge',
    category: 'pdf'
  },
  {
    id: 'pdf.rasterize',
    titleKey: 'document.operations.rasterize.title',
    descriptionKey: 'document.operations.rasterize.description',
    icon: 'i-lucide-images',
    route: '/document-studio/tools/images',
    category: 'image'
  },
  {
    id: 'pdf.images-to-pdf',
    titleKey: 'document.operations.imagesToPdf.title',
    descriptionKey: 'document.operations.imagesToPdf.description',
    icon: 'i-lucide-file-image',
    route: '/document-studio/tools/images-to-pdf',
    category: 'image'
  },
  {
    id: 'document.convert-to-pdf',
    titleKey: 'document.operations.convert.title',
    descriptionKey: 'document.operations.convert.description',
    icon: 'i-lucide-file-input',
    route: '/document-studio/tools/convert',
    category: 'convert'
  },
  {
    id: 'pdf.export',
    titleKey: 'document.operations.export.title',
    descriptionKey: 'document.operations.export.description',
    icon: 'i-lucide-share-2',
    route: '/document-studio/tools/export',
    category: 'export'
  },
  {
    id: 'document.ai-extract',
    titleKey: 'document.operations.extract.title',
    descriptionKey: 'document.operations.extract.description',
    icon: 'i-lucide-scan-text',
    route: '/document-studio/tools/extract',
    category: 'extract'
  },
  {
    id: 'image.watermark-remove',
    titleKey: 'document.operations.watermark.title',
    descriptionKey: 'document.operations.watermark.description',
    icon: 'i-lucide-eraser',
    route: '/document-studio/tools/watermark',
    category: 'image'
  },
  {
    id: 'image.background-remove',
    titleKey: 'document.operations.removeBackground.title',
    descriptionKey: 'document.operations.removeBackground.description',
    icon: 'i-lucide-scissors-line-dashed',
    route: '/document-studio/tools/remove-bg',
    category: 'image'
  },
  {
    id: 'image.convert',
    titleKey: 'document.operations.imageConvert.title',
    descriptionKey: 'document.operations.imageConvert.description',
    icon: 'i-lucide-repeat-2',
    route: '/document-studio/tools/image-convert',
    category: 'image'
  },
  {
    id: 'structured.convert',
    titleKey: 'document.operations.structuredConvert.title',
    descriptionKey: 'document.operations.structuredConvert.description',
    icon: 'i-lucide-table-2',
    route: '/document-studio/tools/structured-convert',
    category: 'convert'
  },
  {
    id: 'office.convert',
    titleKey: 'document.operations.officeConvert.title',
    descriptionKey: 'document.operations.officeConvert.description',
    icon: 'i-lucide-file-spreadsheet',
    route: '/document-studio/tools/office-convert',
    category: 'convert'
  }
]

export const DOCUMENT_STUDIO_GROUPS = ['pdf', 'image', 'convert', 'export', 'extract'] as const

export function documentStudioOperation(id: string): DocumentStudioOperation | null {
  return DOCUMENT_STUDIO_OPERATIONS.find(entry => entry.id === id) ?? null
}

const SLUG_TO_OPERATION_ID: Record<string, DocumentOperationId> = {
  'split': 'pdf.split',
  'merge': 'pdf.merge',
  'images': 'pdf.rasterize',
  'images-to-pdf': 'pdf.images-to-pdf',
  'convert': 'document.convert-to-pdf',
  'export': 'pdf.export',
  'extract': 'document.ai-extract',
  'watermark': 'image.watermark-remove',
  'remove-bg': 'image.background-remove',
  'image-convert': 'image.convert',
  'structured-convert': 'structured.convert',
  'office-convert': 'office.convert'
}

export function operationIdFromSlug(slug: string): DocumentOperationId {
  return SLUG_TO_OPERATION_ID[slug] || (slug as DocumentOperationId)
}

/** Shape the watermark panel emits and the server executor reads. */
export interface WatermarkConfigModel {
  mode?: 'manual' | 'batch' | 'auto'
  region?: { x: number, y: number, width: number, height: number }
  regionRatio?: { xRatio: number, yRatio: number, widthRatio: number, heightRatio: number }
  [key: string]: unknown
}

/** Shape the background panel emits and the server executor reads. */
export interface BackgroundConfigModel {
  mode?: 'chroma' | 'ai'
  backdrop?: [number, number, number]
  tolerance?: number
  [key: string]: unknown
}

/** Shape the image-convert panel emits and the server executor reads. */
export interface ImageConvertConfigModel {
  target?: 'png' | 'jpg' | 'webp' | 'ico' | 'icns'
  sizes?: number[]
  quality?: number
  [key: string]: unknown
}

/** Shape the structured-convert panel emits and the server executor reads. */
export interface StructuredConvertConfigModel {
  target?: 'csv' | 'xlsx' | 'xml' | 'json'
  [key: string]: unknown
}

/** Shape the office-convert (Word ↔ Excel / CSV / MD / JSON / XML) panel emits and the server executor reads. */
export interface OfficeConvertConfigModel {
  target?: 'auto' | 'xlsx' | 'docx' | 'csv' | 'md' | 'json' | 'xml'
  useAi?: boolean
  model?: string
  connectionId?: string
  aiPrompt?: string
  [key: string]: unknown
}

export function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function documentFileIcon(name: string, isFolder = false): string {
  if (isFolder) return 'i-lucide-folder'
  const ext = extensionOf(name)
  if (ext === 'pdf') return 'i-lucide-file-text'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'i-lucide-image'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'i-lucide-table-2'
  if (['docx', 'doc'].includes(ext)) return 'i-lucide-file-type-2'
  if (ext === 'json') return 'i-lucide-braces'
  if (ext === 'xml') return 'i-lucide-code-xml'
  if (['txt', 'md'].includes(ext)) return 'i-lucide-file-text'
  if (ext === 'zip') return 'i-lucide-archive'
  return 'i-lucide-file'
}

/**
 * The local server cannot verify a session until this device holds the same
 * shared secret TM Hub signs with. Both codes mean "finish the device setup",
 * not "this operation failed", so the pages point at the Hub settings.
 */
export function isDocumentConnectionError(code: string | null | undefined): boolean {
  return code === 'error.authNotConfigured' || code === 'error.invalidToken'
}
