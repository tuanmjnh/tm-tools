/**
 * The workspace has exactly two roots: everything the operator feeds in, and
 * everything a tool produces. Tool-specific folders live below `output/`.
 */
export const PDF_FILE_AREAS = ['input', 'output'] as const
export type PdfFileArea = typeof PDF_FILE_AREAS[number]

/** Subfolders of `output/` that each tool writes into. */
export const PDF_OUTPUT_FOLDERS = ['split', 'images', 'merged', 'products', 'office'] as const
export type PdfOutputFolder = typeof PDF_OUTPUT_FOLDERS[number]

export const PDF_EXPORT_COLUMNS = [
  'no',
  'sku',
  'title',
  'barcode',
  'basePrice',
  'salePrice',
  'prices',
  'stock',
  'manageStock',
  'categories',
  'tags',
  'keywords',
  'status',
  'description',
  'shortDesc',
  'attributes',
  'opt1_name',
  'opt1_val',
  'opt2_name',
  'opt2_val',
  'v_sku',
  'v_barcode',
  'v_basePrice',
  'v_salePrice',
  'v_stock'
] as const

export type PdfExportColumn = typeof PDF_EXPORT_COLUMNS[number]

export type PdfExportRow = Record<PdfExportColumn, string>

export interface PdfExtractVariant {
  opt1Val: string
  price: string
}

export interface PdfExtractProduct {
  sku: string
  title: string
  isNewProduct: boolean
  width: string
  depth: string
  height: string
  description: string
  shortDesc: string
  opt1Name: string
  variants: PdfExtractVariant[]
}

export interface PdfExtractPage {
  pageId: string
  pageCategorySlugs: string
  products: PdfExtractProduct[]
}

export const PDF_JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const
export type PdfJobStatus = typeof PDF_JOB_STATUSES[number]

/**
 * Bumped whenever the extraction contract changes shape: prompt, schema, or the
 * meaning of a field. Old checkpoints stop being reused; they are not deleted.
 */
export const PDF_EXTRACT_CHECKPOINT_VERSION = 2

export interface PdfExtractJobState {
  id: string
  status: PdfJobStatus
  source: string
  /** Model used for this run (null for runs started before model selection). */
  model?: string | null
  /** AI connection the model belongs to; chosen from the live catalogue. */
  connectionId?: string | null
  /** Name of the extraction preset used for this run, when one was selected. */
  preset?: string | null
  totalPages: number
  processedPages: number
  cachedPages: number
  failedPages: string[]
  currentPage: string | null
  productCount: number
  rowCount: number
  error: string | null
  createdAt: string
  finishedAt: string | null
  cancelRequested: boolean
}

/**
 * Reusable extraction guidance. `description` tells the model what the document
 * is and how its columns work; `sample` is a short example of correct output.
 */
export interface PdfExtractPreset {
  id: string
  name: string
  description: string
  sample: string
  updatedAt: string
}

export interface PdfExtractJobSummary extends PdfExtractJobState {
  available: boolean
  rows: PdfExportRow[]
}

export interface PdfFileInfo {
  name: string
  /** Absolute on-disk path — used by "open file location" in the desktop app. */
  path: string
  size: number
  modifiedAt: string
  /** Relative subpath within the area root, e.g. "reports/2026/q1.pdf" or "q1.pdf". */
  relativePath?: string
  /** Parent folder relative path, e.g. "reports/2026" or "". */
  parentFolder?: string
  /** Set when an upload replaced a file that already had this name. */
  overwritten?: boolean
  /** Served under this area but stored in the read-only `word/` folder. */
  legacy?: boolean
}

export interface PdfFolderInfo {
  name: string
  /** Absolute path of the folder, for "open file location". */
  path: string
  fileCount: number
  modifiedAt: string
  /** Relative path within the area root, e.g. "reports/2026". */
  relativePath?: string
  /** Parent folder relative path, e.g. "reports" or "". */
  parentFolder?: string
}

export interface PdfTrashItem {
  id: string
  originalName: string
  originalRelativePath: string
  originalPath: string
  area: string
  isDirectory: boolean
  size: number
  deletedAt: string
}

export interface PdfFolderTreeNode {
  id: string
  label: string
  path: string
  relativePath: string
  fileCount: number
  /** Workspace area the node belongs to; unset means the caller's own area. */
  area?: PdfFileArea
  /** Folder mutations are disabled for this node (legacy read-only storage). */
  readonly?: boolean
  /** Fixed system root: shown with a lock and cannot be renamed or deleted. */
  system?: boolean
  children?: PdfFolderTreeNode[]
  /** This node has subfolders that were not sent; fetch them on expand. */
  hasChildren?: boolean
}

export interface PdfDirectoryListing {
  area: string
  currentFolder: string
  parentFolder: string | null
  breadcrumbs: Array<{ name: string, path: string }>
  folders: PdfFolderInfo[]
  files: PdfFileInfo[]
  tree?: PdfFolderTreeNode[]
}

export interface PdfLibrary {
  /** Every file under the `input/` root (PDF and non-PDF). */
  input: PdfFileInfo[]
  /** Tool folders directly under the `output/` root. */
  output: PdfFolderInfo[]
  sources: PdfFileInfo[]
  /** Non-PDF uploads (docx, xlsx, csv, json, xml, images) waiting to be converted. */
  inputs: PdfFileInfo[]
  split: PdfFolderInfo[]
  images: PdfFolderInfo[]
  merged: PdfFileInfo[]
  products: PdfFileInfo[]
  /** Uploaded .docx price lists, before conversion. */
  word: PdfFileInfo[]
  /** Generated .docx / .xlsx files (PDF→Word, spreadsheet exports). */
  office: PdfFileInfo[]
  maxUploadMb: number
  maxPages: number
  imageScale: number
  trashCount?: number
}

export const PDF_OFFICE_FORMATS = ['xlsx', 'docx', 'csv', 'json', 'xml'] as const

export type PdfOfficeFormat = typeof PDF_OFFICE_FORMATS[number]

/** Formats a source PDF can be exported to from the export workspace. */
export const PDF_SOURCE_EXPORT_FORMATS = ['png', 'docx', 'xlsx', 'csv', 'json', 'xml'] as const

export type PdfSourceExportFormat = typeof PDF_SOURCE_EXPORT_FORMATS[number]

/** Non-PDF inputs that the import workspace accepts. */
export const PDF_INPUT_FORMATS = ['image', 'docx', 'xlsx', 'csv', 'json', 'xml'] as const

export type PdfInputFormat = typeof PDF_INPUT_FORMATS[number]

export interface PdfExportFormatResult {
  format: PdfSourceExportFormat
  ok: boolean
  /** Generated file or folder name, when the export produced one. */
  name?: string
  error?: string
}

export const PDF_AREA_KINDS = ['source', 'processing', 'extraction', 'system'] as const

export type PdfAreaKind = typeof PDF_AREA_KINDS[number]

/** Capabilities of one workspace area, as decided by the server registry. */
export interface PdfAreaDescriptor {
  area: PdfFileArea
  /** Stable logical key, independent of the display label. */
  key: string
  kind: PdfAreaKind
  /** Files inside the area can be uploaded, renamed and deleted. */
  writableFiles: boolean
  /** Subfolders inside the area can be created, renamed and deleted. */
  writableFolders: boolean
  /** The area root is a fixed system folder: never renamed or deleted. */
  systemRoot: boolean
  accept: 'pdf' | 'input' | 'all'
}

export interface PdfWorkspaceAreaReport extends PdfAreaDescriptor {
  /** Absolute on-disk root, so the desktop app can reveal it. */
  root: string
  exists: boolean
  fileCount: number
  folderCount: number
}

export interface PdfWorkspaceReport {
  areas: PdfWorkspaceAreaReport[]
  /** True when a managed area root is missing from disk. */
  needsRepair: boolean
  /** Subfolder of `output/` each tool writes to. */
  outputMapping: Record<string, string>
}

/** Result of the manual repair: only missing folders are recreated. */
export interface PdfWorkspaceRepair {
  created: PdfFileArea[]
  needsRepair: boolean
}

/** A document the operator picked to process: one file, or one folder. */
export interface PdfDocumentRef {
  area: PdfFileArea
  /** Relative path inside the area; "" means the area root itself. */
  relativePath: string
  name: string
  kind: 'file' | 'folder'
}

export interface PdfSelection {
  mode: 'single-file' | 'folder'
  item: PdfDocumentRef
}
