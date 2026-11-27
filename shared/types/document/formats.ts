export const DOCUMENT_FORMAT_IDS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'csv',
  'json',
  'xml',
  'png',
  'jpg',
  'webp',
  'svg',
  'ico',
  'icns',
  'txt',
  'md',
  'zip'
] as const

export type DocumentFormatId = typeof DOCUMENT_FORMAT_IDS[number]

export interface DocumentFormatDefinition {
  id: DocumentFormatId
  extensions: readonly string[]
  mimeTypes: readonly string[]
  category: 'document' | 'spreadsheet' | 'structured-data' | 'image' | 'text' | 'archive'
  previewKind: 'pdf' | 'image' | 'text' | 'table' | 'none'
}

export const DOCUMENT_FORMATS: readonly DocumentFormatDefinition[] = [
  {
    id: 'pdf',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    category: 'document',
    previewKind: 'pdf'
  },
  {
    id: 'docx',
    extensions: ['docx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    category: 'document',
    previewKind: 'none'
  },
  {
    id: 'md',
    extensions: ['md', 'markdown'],
    mimeTypes: ['text/markdown'],
    category: 'document',
    previewKind: 'text'
  },
  {
    id: 'doc',
    extensions: ['doc'],
    mimeTypes: ['application/msword'],
    category: 'document',
    previewKind: 'none'
  },
  {
    id: 'xlsx',
    extensions: ['xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    category: 'spreadsheet',
    previewKind: 'table'
  },
  {
    id: 'xls',
    extensions: ['xls'],
    mimeTypes: ['application/vnd.ms-excel'],
    category: 'spreadsheet',
    previewKind: 'none'
  },
  {
    id: 'csv',
    extensions: ['csv'],
    mimeTypes: ['text/csv'],
    category: 'spreadsheet',
    previewKind: 'table'
  },
  {
    id: 'json',
    extensions: ['json'],
    mimeTypes: ['application/json'],
    category: 'structured-data',
    previewKind: 'text'
  },
  {
    id: 'xml',
    extensions: ['xml'],
    mimeTypes: ['application/xml', 'text/xml'],
    category: 'structured-data',
    previewKind: 'text'
  },
  {
    id: 'png',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    category: 'image',
    previewKind: 'image'
  },
  {
    id: 'jpg',
    extensions: ['jpg', 'jpeg'],
    mimeTypes: ['image/jpeg'],
    category: 'image',
    previewKind: 'image'
  },
  {
    id: 'webp',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    category: 'image',
    previewKind: 'image'
  },
  {
    id: 'svg',
    extensions: ['svg'],
    mimeTypes: ['image/svg+xml'],
    category: 'image',
    previewKind: 'image'
  },
  {
    id: 'ico',
    extensions: ['ico'],
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'],
    category: 'image',
    previewKind: 'image'
  },
  {
    id: 'icns',
    extensions: ['icns'],
    mimeTypes: ['image/icns', 'image/x-icns'],
    category: 'image',
    previewKind: 'image'
  },
  {
    id: 'txt',
    extensions: ['txt'],
    mimeTypes: ['text/plain'],
    category: 'text',
    previewKind: 'text'
  },
  {
    id: 'zip',
    extensions: ['zip'],
    mimeTypes: ['application/zip'],
    category: 'archive',
    previewKind: 'none'
  }
]

export interface ConversionEdge {
  source: DocumentFormatId
  target: DocumentFormatId
  operationId: string
  strategy: 'binary' | 'layout' | 'structured-data' | 'ocr' | 'ai-assisted'
  available: boolean
  runtimeRestrictions?: string[]
  reasonDisabled?: string
}

export const CONVERSION_MATRIX: readonly ConversionEdge[] = [
  { source: 'pdf', target: 'pdf', operationId: 'pdf.split', strategy: 'binary', available: true },
  { source: 'pdf', target: 'pdf', operationId: 'pdf.merge', strategy: 'binary', available: true },
  { source: 'pdf', target: 'png', operationId: 'pdf.rasterize', strategy: 'layout', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'png', target: 'pdf', operationId: 'pdf.images-to-pdf', strategy: 'layout', available: true },
  { source: 'jpg', target: 'pdf', operationId: 'pdf.images-to-pdf', strategy: 'layout', available: true },
  { source: 'docx', target: 'pdf', operationId: 'document.convert-to-pdf', strategy: 'layout', available: true },
  { source: 'xlsx', target: 'pdf', operationId: 'document.convert-to-pdf', strategy: 'layout', available: true },
  { source: 'csv', target: 'pdf', operationId: 'document.convert-to-pdf', strategy: 'layout', available: true },
  { source: 'json', target: 'pdf', operationId: 'document.convert-to-pdf', strategy: 'layout', available: true },
  { source: 'xml', target: 'pdf', operationId: 'document.convert-to-pdf', strategy: 'layout', available: true },
  { source: 'pdf', target: 'docx', operationId: 'pdf.export', strategy: 'layout', available: true },
  { source: 'pdf', target: 'xlsx', operationId: 'pdf.export', strategy: 'structured-data', available: true },
  { source: 'pdf', target: 'csv', operationId: 'pdf.export', strategy: 'structured-data', available: true },
  { source: 'pdf', target: 'json', operationId: 'pdf.export', strategy: 'structured-data', available: true },
  { source: 'pdf', target: 'xml', operationId: 'pdf.export', strategy: 'structured-data', available: true },
  // Image ↔ image and icon conversions run on the bundled canvas, so they are
  // local/electron only, exactly like pdf.rasterize.
  { source: 'png', target: 'jpg', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'png', target: 'webp', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'jpg', target: 'png', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'jpg', target: 'webp', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'webp', target: 'png', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'webp', target: 'jpg', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'svg', target: 'png', operationId: 'image.convert', strategy: 'layout', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'svg', target: 'jpg', operationId: 'image.convert', strategy: 'layout', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'svg', target: 'webp', operationId: 'image.convert', strategy: 'layout', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'png', target: 'ico', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'jpg', target: 'ico', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'webp', target: 'ico', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'svg', target: 'ico', operationId: 'image.convert', strategy: 'layout', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'ico', target: 'png', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  // ICNS (macOS) stores up to 512 in one container.
  { source: 'png', target: 'icns', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'jpg', target: 'icns', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'webp', target: 'icns', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'svg', target: 'icns', operationId: 'image.convert', strategy: 'layout', available: true, runtimeRestrictions: ['local', 'electron'] },
  { source: 'icns', target: 'png', operationId: 'image.convert', strategy: 'binary', available: true, runtimeRestrictions: ['local', 'electron'] },
  // Structured data: csv ↔ xlsx and xml ↔ json (was declared-but-disabled).
  { source: 'csv', target: 'xlsx', operationId: 'structured.convert', strategy: 'structured-data', available: true },
  { source: 'xlsx', target: 'csv', operationId: 'structured.convert', strategy: 'structured-data', available: true },
  { source: 'xml', target: 'json', operationId: 'structured.convert', strategy: 'structured-data', available: true },
  { source: 'json', target: 'xml', operationId: 'structured.convert', strategy: 'structured-data', available: true },
  // webp → PDF now runs: pdf-lib embeds it after the canvas re-encodes to PNG.
  { source: 'webp', target: 'pdf', operationId: 'pdf.images-to-pdf', strategy: 'layout', available: true },
  // Office & Data (Word, Excel, CSV, Markdown, JSON, XML — deterministic or AI-guided).
  { source: 'xlsx', target: 'docx', operationId: 'office.convert', strategy: 'layout', available: true },
  { source: 'xlsx', target: 'md', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'xlsx', target: 'json', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'xlsx', target: 'xml', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'xls', target: 'docx', operationId: 'office.convert', strategy: 'layout', available: true },
  { source: 'docx', target: 'xlsx', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'docx', target: 'csv', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'docx', target: 'md', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'docx', target: 'json', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'docx', target: 'xml', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'doc', target: 'xlsx', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'doc', target: 'csv', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'doc', target: 'md', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'doc', target: 'json', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'doc', target: 'xml', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'csv', target: 'docx', operationId: 'office.convert', strategy: 'layout', available: true },
  { source: 'csv', target: 'md', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'csv', target: 'json', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'csv', target: 'xml', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'md', target: 'docx', operationId: 'office.convert', strategy: 'layout', available: true },
  { source: 'md', target: 'xlsx', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'md', target: 'csv', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'md', target: 'json', operationId: 'office.convert', strategy: 'structured-data', available: true },
  { source: 'md', target: 'xml', operationId: 'office.convert', strategy: 'structured-data', available: true }
]

export function formatById(id: string): DocumentFormatDefinition | null {
  return DOCUMENT_FORMATS.find(f => f.id === id) ?? null
}

export function formatByExtension(ext: string): DocumentFormatDefinition | null {
  const clean = ext.replace(/^\./, '').toLowerCase()
  return DOCUMENT_FORMATS.find(f => f.extensions.includes(clean)) ?? null
}

export function allowedTargetsFor(source: DocumentFormatId): ConversionEdge[] {
  return CONVERSION_MATRIX.filter(edge => edge.source === source)
}
