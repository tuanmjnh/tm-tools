import type {
  DocumentErrorCode,
  DocumentOperationDefinition,
  DocumentOperationId
} from '#shared/types/document'

const PDF = ['pdf']
const IMAGES = ['png', 'jpg', 'jpeg']
const OFFICE_INPUT = ['png', 'jpg', 'jpeg', 'docx', 'xlsx', 'csv', 'json', 'xml']
const EXPORT_OUTPUT_MIME = [
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/json',
  'application/xml'
]

/**
 * Business metadata only. Cardinality mirrors what the v3 engines actually
 * accept today: merge still works on one split folder, not on an arbitrary
 * ordered multi-file selection, and that is recorded here rather than
 * promised by the UI.
 */
export const DOCUMENT_OPERATIONS: readonly DocumentOperationDefinition[] = [
  {
    id: 'pdf.split',
    version: '1.0.0',
    category: 'pdf',
    titleKey: 'document.operations.split.title',
    descriptionKey: 'document.operations.split.description',
    icon: 'i-lucide-scissors',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: PDF, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: false },
    configuration: { componentKey: 'split', hasAdvancedOptions: false },
    output: { artifactMode: 'multiple', defaultFileNamePattern: 'page_{index}.pdf', mimeTypes: ['application/pdf'] },
    execution: { mode: 'inline', supportsProgress: true, supportsCancel: false, supportsPartial: false, resourceProfile: 'pdf-split' },
    legacyTool: 'split'
  },
  {
    id: 'pdf.merge',
    version: '1.0.0',
    category: 'pdf',
    titleKey: 'document.operations.merge.title',
    descriptionKey: 'document.operations.merge.description',
    icon: 'i-lucide-layers',
    enabled: true,
    input: { mode: 'multi-file', acceptedExtensions: PDF, minFiles: 2, maxFiles: 50, ordered: true, allowFromInputLibrary: false },
    configuration: { componentKey: 'merge', hasAdvancedOptions: false },
    output: { artifactMode: 'single', defaultFileNamePattern: 'merged.pdf', mimeTypes: ['application/pdf'] },
    execution: { mode: 'inline', supportsProgress: true, supportsCancel: false, supportsPartial: false, resourceProfile: 'pdf-merge' },
    legacyTool: 'merge'
  },
  {
    id: 'pdf.rasterize',
    version: '1.0.0',
    category: 'image',
    titleKey: 'document.operations.rasterize.title',
    descriptionKey: 'document.operations.rasterize.description',
    icon: 'i-lucide-images',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: PDF, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: false },
    configuration: { componentKey: 'none', hasAdvancedOptions: false },
    output: { artifactMode: 'multiple', defaultFileNamePattern: 'page_{index}.png', mimeTypes: ['image/png'] },
    execution: { mode: 'inline', supportsProgress: true, supportsCancel: false, supportsPartial: false, resourceProfile: 'pdf-raster' },
    legacyTool: 'rasterize'
  },
  {
    id: 'pdf.images-to-pdf',
    version: '1.0.0',
    category: 'image',
    titleKey: 'document.operations.imagesToPdf.title',
    descriptionKey: 'document.operations.imagesToPdf.description',
    icon: 'i-lucide-file-image',
    enabled: true,
    input: { mode: 'multi-file', acceptedExtensions: IMAGES, minFiles: 1, maxFiles: 200, ordered: true, allowFromInputLibrary: false },
    configuration: { componentKey: 'none', hasAdvancedOptions: false },
    output: { artifactMode: 'single', defaultFileNamePattern: 'images.pdf', mimeTypes: ['application/pdf'] },
    execution: { mode: 'inline', supportsProgress: true, supportsCancel: false, supportsPartial: false, resourceProfile: 'images-to-pdf' },
    legacyTool: 'imagesToPdf'
  },
  {
    id: 'document.convert-to-pdf',
    version: '1.0.0',
    category: 'convert',
    titleKey: 'document.operations.convert.title',
    descriptionKey: 'document.operations.convert.description',
    icon: 'i-lucide-file-input',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: OFFICE_INPUT, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: true },
    configuration: { componentKey: 'none', hasAdvancedOptions: false },
    output: { artifactMode: 'single', defaultFileNamePattern: '{stem}.pdf', mimeTypes: ['application/pdf'] },
    execution: { mode: 'inline', supportsProgress: false, supportsCancel: false, supportsPartial: false, resourceProfile: 'convert-input' },
    legacyTool: 'convertInput'
  },
  {
    id: 'pdf.export',
    version: '1.0.0',
    category: 'export',
    titleKey: 'document.operations.export.title',
    descriptionKey: 'document.operations.export.description',
    icon: 'i-lucide-share-2',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: PDF, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: false },
    configuration: { componentKey: 'export-formats', hasAdvancedOptions: false },
    output: { artifactMode: 'variable', defaultFileNamePattern: '{stem}.{ext}', mimeTypes: EXPORT_OUTPUT_MIME },
    execution: { mode: 'inline', supportsProgress: false, supportsCancel: false, supportsPartial: true, resourceProfile: 'pdf-export' },
    legacyTool: 'export'
  },
  {
    id: 'document.ai-extract',
    version: '1.0.0',
    category: 'extract',
    titleKey: 'document.operations.extract.title',
    descriptionKey: 'document.operations.extract.description',
    icon: 'i-lucide-scan-text',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: PDF, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: false },
    configuration: { componentKey: 'ai-extraction', hasAdvancedOptions: true },
    output: { artifactMode: 'multiple', defaultFileNamePattern: '{stem}_products.{ext}', mimeTypes: EXPORT_OUTPUT_MIME },
    execution: { mode: 'async-function', supportsProgress: true, supportsCancel: true, supportsPartial: true, resourceProfile: 'ai-extract' },
    legacyTool: 'extract'
  }
]

export function documentOperation(id: string): DocumentOperationDefinition | null {
  return DOCUMENT_OPERATIONS.find(entry => entry.id === id) ?? null
}

export function requireOperation(id: string): DocumentOperationDefinition {
  const operation = documentOperation(id)
  if (!operation) throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')
  return operation
}

export function operationIds(): DocumentOperationId[] {
  return DOCUMENT_OPERATIONS.map(entry => entry.id)
}

const ERROR_STATUS: Record<DocumentErrorCode, number> = {
  DOCUMENT_INPUT_REQUIRED: 422,
  DOCUMENT_INPUT_COUNT_INVALID: 422,
  DOCUMENT_INPUT_TYPE_NOT_SUPPORTED: 422,
  DOCUMENT_INPUT_TOO_LARGE: 413,
  DOCUMENT_TOTAL_SIZE_EXCEEDED: 413,
  DOCUMENT_UPLOAD_INCOMPLETE: 409,
  DOCUMENT_UPLOAD_EXPIRED: 410,
  DOCUMENT_INPUT_NOT_READY: 409,
  DOCUMENT_JOB_NOT_FOUND: 404,
  DOCUMENT_JOB_NOT_OWNED: 403,
  DOCUMENT_JOB_STATE_INVALID: 409,
  DOCUMENT_JOB_ALREADY_RUNNING: 409,
  DOCUMENT_OUTPUT_NOT_READY: 409,
  DOCUMENT_OUTPUT_EXPIRED: 410,
  DOCUMENT_OUTPUT_TOO_LARGE: 413,
  DOCUMENT_ARTIFACT_EXPIRED: 410,
  DOCUMENT_STORAGE_UNAVAILABLE: 503,
  DOCUMENT_STORAGE_NOT_CONFIGURED: 503,
  DOCUMENT_DATABASE_NOT_CONFIGURED: 503,
  DOCUMENT_TEMP_CAPACITY_EXCEEDED: 507,
  DOCUMENT_RUNTIME_NOT_SUPPORTED: 501,
  DOCUMENT_WORKER_REQUIRED: 422,
  DOCUMENT_OPERATION_NOT_SUPPORTED: 404,
  DOCUMENT_OPERATION_CONFIG_INVALID: 422,
  DOCUMENT_PROCESSING_TIMEOUT: 504,
  DOCUMENT_CLEANUP_FAILED: 500
}

const RETRYABLE = new Set<DocumentErrorCode>([
  'DOCUMENT_STORAGE_UNAVAILABLE',
  'DOCUMENT_STORAGE_NOT_CONFIGURED',
  'DOCUMENT_DATABASE_NOT_CONFIGURED',
  'DOCUMENT_PROCESSING_TIMEOUT',
  'DOCUMENT_UPLOAD_INCOMPLETE'
])

export class DocumentError extends Error {
  readonly code: DocumentErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: DocumentErrorCode, details?: Record<string, unknown>) {
    super(code)
    this.name = 'DocumentError'
    this.code = code
    this.details = details
  }

  get status(): number {
    return ERROR_STATUS[this.code] ?? 500
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code)
  }
}

export function documentHttpStatus(code: string): number {
  return ERROR_STATUS[code as DocumentErrorCode] ?? 500
}

export function toDocumentError(error: unknown): DocumentError {
  if (error instanceof DocumentError) return error
  const message = (error as Error)?.message ?? ''
  if (message in ERROR_STATUS) return new DocumentError(message as DocumentErrorCode)
  return new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { cause: message })
}
