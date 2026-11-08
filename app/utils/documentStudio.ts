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
    // AI extraction is not a v4 job; it keeps its own page and API.
    route: '/pdf/extract',
    category: 'extract'
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
  'extract': 'document.ai-extract'
}

export function operationIdFromSlug(slug: string): DocumentOperationId {
  return SLUG_TO_OPERATION_ID[slug] || (slug as DocumentOperationId)
}

export function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
