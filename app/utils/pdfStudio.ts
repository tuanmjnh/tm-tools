import type { PdfJobStatus, PdfSourceExportFormat } from '#shared/types/pdf'

export const PDF_STUDIO_POLL_MS = 2500
export const PDF_PAGE_SIZE = 25
export const PDF_UPLOAD_ACCEPT = 'application/pdf'
export const PDF_IMAGE_ACCEPT = '.png,.jpg,.jpeg'
export const PDF_WORD_ACCEPT = '.docx'
export const PDF_INPUT_ACCEPT = '.png,.jpg,.jpeg,.docx,.xlsx,.csv,.json,.xml'
export const PDF_DATA_ACCEPT = '.csv,.json,.xml'
export const PDF_SHEET_ACCEPT = '.xlsx'
export const PDF_OFFICE_ACCEPT = '.docx,.xlsx'

export type PdfFileArea = 'sources' | 'inputs' | 'word' | 'split' | 'images' | 'merged' | 'products' | 'office'

export const PDF_AREA_DIR: Record<PdfFileArea, string> = {
  sources: 'sources',
  inputs: 'inputs',
  word: 'word',
  split: 'split',
  images: 'images',
  merged: 'merged',
  products: 'products',
  office: 'office'
}

export const PDF_EXPORT_FORMAT_META: Record<PdfSourceExportFormat, { icon: string, labelKey: string, hintKey: string }> = {
  png: { icon: 'i-lucide-images', labelKey: 'pdf.formats.png', hintKey: 'pdf.formats.pngHint' },
  docx: { icon: 'i-lucide-file-type-2', labelKey: 'pdf.formats.docx', hintKey: 'pdf.formats.docxHint' },
  xlsx: { icon: 'i-lucide-file-spreadsheet', labelKey: 'pdf.formats.xlsx', hintKey: 'pdf.formats.xlsxHint' },
  csv: { icon: 'i-lucide-table-2', labelKey: 'pdf.formats.csv', hintKey: 'pdf.formats.csvHint' },
  json: { icon: 'i-lucide-braces', labelKey: 'pdf.formats.json', hintKey: 'pdf.formats.jsonHint' },
  xml: { icon: 'i-lucide-code-xml', labelKey: 'pdf.formats.xml', hintKey: 'pdf.formats.xmlHint' }
}

export const PDF_INPUT_FORMAT_META = {
  image: { icon: 'i-lucide-image', labelKey: 'pdf.formats.image', hintKey: 'pdf.formats.imageHint', accept: PDF_IMAGE_ACCEPT },
  docx: { icon: 'i-lucide-file-type-2', labelKey: 'pdf.formats.docx', hintKey: 'pdf.formats.docxToPdfHint', accept: PDF_WORD_ACCEPT },
  xlsx: { icon: 'i-lucide-file-spreadsheet', labelKey: 'pdf.formats.xlsx', hintKey: 'pdf.formats.sheetToPdfHint', accept: PDF_SHEET_ACCEPT },
  csv: { icon: 'i-lucide-table-2', labelKey: 'pdf.formats.csv', hintKey: 'pdf.formats.dataToPdfHint', accept: '.csv' },
  json: { icon: 'i-lucide-braces', labelKey: 'pdf.formats.json', hintKey: 'pdf.formats.dataToPdfHint', accept: '.json' },
  xml: { icon: 'i-lucide-code-xml', labelKey: 'pdf.formats.xml', hintKey: 'pdf.formats.dataToPdfHint', accept: '.xml' }
} as const

export const PDF_STATUS_META: Record<PdfJobStatus, { icon: string, color: 'neutral' | 'info' | 'success' | 'error' | 'warning' }> = {
  queued: { icon: 'i-lucide-clock', color: 'neutral' },
  running: { icon: 'i-lucide-loader-circle', color: 'info' },
  done: { icon: 'i-lucide-circle-check', color: 'success' },
  failed: { icon: 'i-lucide-circle-alert', color: 'error' },
  cancelled: { icon: 'i-lucide-circle-slash', color: 'warning' }
}

export const PDF_ERROR_KEYS: Record<string, string> = {
  PDF_INVALID: 'pdf.errors.invalid',
  PDF_INVALID_EXTENSION: 'pdf.errors.invalidExtension',
  PDF_EMPTY_UPLOAD: 'pdf.errors.emptyUpload',
  PDF_UPLOAD_TOO_LARGE: 'pdf.errors.tooLarge',
  PDF_TOO_MANY_PAGES: 'pdf.errors.tooManyPages',
  PDF_SOURCE_NOT_FOUND: 'pdf.errors.sourceNotFound',
  PDF_OUTPUT_NOT_FOUND: 'pdf.errors.outputNotFound',
  PDF_FOLDER_NOT_FOUND: 'pdf.errors.folderNotFound',
  PDF_RESULT_NOT_FOUND: 'pdf.errors.resultNotFound',
  PDF_EMPTY_FOLDER: 'pdf.errors.emptyFolder',
  PDF_JOB_RUNNING: 'pdf.errors.jobRunning',
  PDF_JOB_NOT_FOUND: 'pdf.errors.jobNotFound',
  PDF_PRESET_NAME_REQUIRED: 'pdf.extract.presetNameRequired',
  PDF_WORD_LEGACY: 'pdf.errors.wordLegacy',
  PDF_WORD_INVALID: 'pdf.errors.wordInvalid',
  PDF_WORD_NOT_FOUND: 'pdf.errors.wordNotFound',
  PDF_OFFICE_NOT_FOUND: 'pdf.errors.officeNotFound',
  PDF_FONT_MISSING: 'pdf.errors.fontMissing',
  PDF_PRESET_LIMIT: 'pdf.errors.generic',
  PDF_AI_KEY_MISSING: 'pdf.errors.aiKeyMissing',
  PDF_AI_TIMEOUT: 'pdf.errors.aiTimeout',
  PDF_AI_HTTP_429: 'pdf.errors.aiRateLimited',
  PDF_FILE_NOT_FOUND: 'pdf.errors.fileNotFound',
  PDF_INPUT_INVALID: 'pdf.errors.inputInvalid',
  PDF_INPUT_NOT_FOUND: 'pdf.errors.inputNotFound',
  PDF_NO_ROWS: 'pdf.errors.noRows',
  PDF_EXPORT_NO_FORMAT: 'pdf.errors.noFormat',
  PDF_EXPORT_FAILED: 'pdf.errors.exportFailed',
  PDF_PREVIEW_NEEDS_PDF: 'pdf.errors.previewNeedsPdf',
  PDF_TRASH_ITEM_NOT_FOUND: 'pdf.errors.trashNotFound',
  PDF_FOLDER_ALREADY_EXISTS: 'pdf.errors.folderExists',
  PDF_FOLDER_IMMUTABLE: 'pdf.errors.folderImmutable',
  PDF_FILE_IMMUTABLE: 'pdf.errors.fileImmutable',
  PDF_FILE_ALREADY_EXISTS: 'pdf.errors.fileExists',
  PDF_FOLDER_NAME_REQUIRED: 'pdf.errors.folderNameRequired',
  PDF_NAME_REQUIRED: 'pdf.errors.nameRequired',
  PDF_INVALID_PATH: 'pdf.errors.invalidPath'
}

function segment(name: string): string {
  return encodeURIComponent(name)
}

/** Streams any library file; `inline` opens it for rendering instead of saving. */
export function pdfFileUrl(area: PdfFileArea, name: string, inline = false): string {
  return `/api/v1/pdf/file?area=${area}&name=${segment(name)}${inline ? '&inline=1' : ''}`
}

export function pdfInspectUrl(area: PdfFileArea, name: string): string {
  return `/api/v1/pdf/inspect?area=${area}&name=${segment(name)}`
}

/** In-app preview window, opened with `window.open` (own Electron window). */
export function pdfPreviewHref(area: PdfFileArea, name: string, path?: string): string {
  const base = `/pdf/preview?area=${area}&name=${segment(name)}`
  return path ? `${base}&path=${segment(path)}` : base
}

export function openPdfPreview(area: PdfFileArea, name: string, path?: string): void {
  if (typeof window === 'undefined') return
  const width = Math.min(1400, Math.max(900, Math.round(window.innerWidth * 0.8)))
  const height = Math.min(980, Math.max(640, Math.round(window.innerHeight * 0.85)))
  window.open(pdfPreviewHref(area, name, path), '_blank', `popup=yes,width=${width},height=${height}`)
}

/** Desktop-only helpers; they no-op in the browser build. */
export function isPdfDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron)
}

function normalizeLocalPath(path: string): string {
  return window.electronAPI?.platform === 'win32' ? path.replace(/\//g, '\\') : path
}

/** Opens a file or folder with the OS default handler. */
export function openLocalPath(path?: string | null): void {
  if (!path || !isPdfDesktop() || !window.electronAPI?.openPath) return
  void window.electronAPI.openPath(normalizeLocalPath(path)).catch(() => undefined)
}

/** Reveals a file (or opens its folder) in Explorer/Finder. */
export function revealLocalPath(path?: string | null): void {
  if (!path || !isPdfDesktop()) return
  const normalized = normalizeLocalPath(path)
  if (window.electronAPI?.showItemInFolder) {
    void window.electronAPI.showItemInFolder(normalized).catch(() => undefined)
    return
  }
  void window.electronAPI?.openPath(normalized).catch(() => undefined)
}

export function pdfMergedUrl(name: string): string {
  return `/api/v1/pdf/merged/${segment(name)}`
}

export function pdfProductsUrl(source: string, format: PdfSourceExportFormat | 'docx'): string {
  return `/api/v1/pdf/products/${segment(source)}?format=${format}`
}

export function pdfWordUrl(name: string): string {
  return `/api/v1/pdf/word/${segment(name)}`
}

export function pdfOfficeUrl(name: string): string {
  return `/api/v1/pdf/office/${segment(name)}`
}

export function pdfProductFileUrl(name: string): string {
  return `/api/v1/pdf/products/${segment(name)}`
}

export function pdfInputsUrl(): string {
  return '/api/v1/pdf/inputs/upload'
}

export function pdfJobProgress(job: { processedPages: number, cachedPages: number, totalPages: number }): number {
  if (!job.totalPages) return 0
  return Math.min(100, Math.round(((job.processedPages + job.cachedPages) / job.totalPages) * 100))
}

/** Folder that holds a library file, used by the "open folder" menu entries. */
export function pdfParentPath(filePath?: string | null): string | undefined {
  if (!filePath) return undefined
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index > 0 ? filePath.slice(0, index) : undefined
}

export function formatPdfBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

export function pdfFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

/** Colour + icon for a library file, shared by every workspace list. */
export function pdfFileMeta(name: string): { icon: string, tone: string } {
  const extension = pdfFileExtension(name)
  if (extension === 'pdf') return { icon: 'i-lucide-file-text', tone: 'text-(--ui-primary)' }
  if (['png', 'jpg', 'jpeg'].includes(extension)) return { icon: 'i-lucide-image', tone: 'text-(--ui-info)' }
  if (extension === 'docx') return { icon: 'i-lucide-file-type-2', tone: 'text-(--ui-info)' }
  if (extension === 'xlsx') return { icon: 'i-lucide-file-spreadsheet', tone: 'text-(--ui-success)' }
  if (extension === 'csv') return { icon: 'i-lucide-table-2', tone: 'text-(--ui-success)' }
  if (extension === 'json') return { icon: 'i-lucide-braces', tone: 'text-(--ui-warning)' }
  if (extension === 'xml') return { icon: 'i-lucide-code-xml', tone: 'text-(--ui-warning)' }
  return { icon: 'i-lucide-file', tone: 'text-muted' }
}

/** Which preview surface a file needs. */
export function pdfPreviewKind(name: string): 'pdf' | 'image' | 'table' | 'json' | 'xml' | 'docx' | 'other' {
  const extension = pdfFileExtension(name)
  if (extension === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg'].includes(extension)) return 'image'
  if (['csv', 'xlsx'].includes(extension)) return 'table'
  if (extension === 'json') return 'json'
  if (extension === 'xml') return 'xml'
  if (extension === 'docx') return 'docx'
  return 'other'
}
