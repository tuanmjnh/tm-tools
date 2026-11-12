/**
 * v4 Document Studio contracts.
 *
 * These types are shared by the Nitro server and the SPA. They describe the
 * business objects only: no filesystem paths, no storage keys, and nothing
 * that would let the renderer address storage directly.
 */

export * from './formats'

export const DOCUMENT_RUNTIMES = ['local', 'electron', 'vercel', 'worker'] as const

export type DocumentRuntimeKind = typeof DOCUMENT_RUNTIMES[number]

export const DOCUMENT_OPERATION_IDS = [
  'pdf.split',
  'pdf.merge',
  'pdf.rasterize',
  'pdf.images-to-pdf',
  'document.convert-to-pdf',
  'pdf.export',
  'document.ai-extract'
] as const

export type DocumentOperationId = typeof DOCUMENT_OPERATION_IDS[number]

export const DOCUMENT_OPERATION_CATEGORIES = ['pdf', 'convert', 'image', 'extract', 'export'] as const

export type DocumentOperationCategory = typeof DOCUMENT_OPERATION_CATEGORIES[number]

export const DOCUMENT_INPUT_MODES = ['single-file', 'multi-file', 'folder-batch'] as const

export type DocumentInputMode = typeof DOCUMENT_INPUT_MODES[number]

/** Configuration forms the client is allowed to mount for an operation. */
export const DOCUMENT_CONFIG_COMPONENTS = ['none', 'split', 'merge', 'rasterize', 'export-formats', 'ai-extraction'] as const

export type DocumentConfigComponent = typeof DOCUMENT_CONFIG_COMPONENTS[number]

export const DOCUMENT_ARTIFACT_MODES = ['single', 'multiple', 'archive', 'variable'] as const

export type DocumentArtifactMode = typeof DOCUMENT_ARTIFACT_MODES[number]

export const DOCUMENT_EXECUTION_MODES = ['inline', 'async-function', 'durable-workflow', 'external-worker'] as const

export type DocumentExecutionMode = typeof DOCUMENT_EXECUTION_MODES[number]

export interface DocumentOperationInputSpec {
  mode: DocumentInputMode
  acceptedExtensions: string[]
  minFiles: number
  maxFiles: number
  /** Order matters (merge, images→PDF) and the picker must offer reordering. */
  ordered: boolean
  allowFromInputLibrary: boolean
}

export interface DocumentOperationBatchSpec {
  mode: 'per-file' | 'combine'
  maxFiles: number
  maxConcurrency?: number
}

export interface DocumentOperationConfigSpec {
  schemaId?: string
  componentKey: DocumentConfigComponent
  hasAdvancedOptions: boolean
}

export interface DocumentOperationOutputSpec {
  artifactMode: DocumentArtifactMode
  defaultFileNamePattern?: string
  mimeTypes: string[]
}

export interface DocumentOperationExecutionSpec {
  mode: DocumentExecutionMode
  supportsProgress: boolean
  supportsCancel: boolean
  supportsPartial: boolean
  /** Key into the runtime resource policy table. */
  resourceProfile: string
}

/** Business metadata for one operation; storage destinations never live here. */
export interface DocumentOperationDefinition {
  id: DocumentOperationId
  version: string
  category: DocumentOperationCategory
  /** i18n key, resolved by the client in the active locale. */
  titleKey: string
  descriptionKey: string
  icon: string
  enabled: boolean
  input: DocumentOperationInputSpec
  configuration: DocumentOperationConfigSpec
  output: DocumentOperationOutputSpec
  execution: DocumentOperationExecutionSpec
  /** Client-side batch selection/pool metadata; per-job cardinality stays in input. */
  batch?: DocumentOperationBatchSpec
  /** v3 tool this definition replaces, used by the compatibility adapter. */
  legacyTool?: string
}

/** What the client is allowed to know about one runtime. */
export interface DocumentRuntimeCapabilities {
  runtime: DocumentRuntimeKind
  /** Local filesystem output folder exists and can receive published results. */
  supportsLocalOutputFolder: boolean
  /** Electron main can show a native Save As dialog. */
  supportsNativeSaveDialog: boolean
  /** Browser may offer File System Access API handles (feature-detect anyway). */
  supportsBrowserFileSystemAccess: boolean
  /** Results must reach the user through a download route rather than a folder. */
  requiresDownloadDelivery: boolean
  /**
   * Cloud host with no bucket: results are returned in the run response and
   * cannot be downloaded again after that request ends.
   */
  ephemeralResults: boolean
  supportsAsyncJobs: boolean
  supportsDirectUpload: boolean
  maxFileBytes: number
  maxTotalInputBytes: number
  maxInputFiles: number
  maxTempBytes: number
  maxOutputBytes: number
  maxInlineDurationMs: number
  allowExternalWorker: boolean
  /** Operation ids this runtime can actually execute. */
  supportedOperations: DocumentOperationId[]
}

export interface SelectedDocumentFile {
  /** Client-side opaque id, stable for the lifetime of the selection. */
  id: string
  name: string
  size: number
  mimeType: string
  extension: string
  origin: 'device' | 'input-library'
  /** Server-side id when the file came from the reusable input library. */
  sourceId?: string
  status: 'selected' | 'invalid' | 'staged'
  errorCode?: DocumentErrorCode
}

export const OUTPUT_DESTINATION_KINDS = [
  'default-local-output',
  'save-as-file',
  'browser-download',
  'browser-file-handle',
  'browser-directory-handle',
  'private-cloud-result',
  'zip-download'
] as const

export type OutputDestinationKind = typeof OUTPUT_DESTINATION_KINDS[number]

/**
 * Where a run should deliver its artifacts. Browser handles are referenced by
 * an opaque id owned by the client adapter; the raw handle never reaches an
 * API body or a job record.
 */
export type OutputDestination
  = | { kind: 'default-local-output' }
    | { kind: 'save-as-file' }
    | { kind: 'browser-download' }
    | { kind: 'browser-file-handle', handleId: string }
    | { kind: 'browser-directory-handle', handleId: string }
    | { kind: 'private-cloud-result' }
    | { kind: 'zip-download' }

export const DOCUMENT_JOB_STATUSES = [
  'created',
  'uploading',
  'queued',
  'running',
  'cancel_requested',
  'publishing',
  'completed',
  'partial',
  'failed',
  'cancelled',
  'expired'
] as const

export type DocumentJobStatus = typeof DOCUMENT_JOB_STATUSES[number]

/** Server-owned transitions; anything else is rejected by the repository. */
export const DOCUMENT_JOB_TRANSITIONS: Record<DocumentJobStatus, readonly DocumentJobStatus[]> = {
  created: ['uploading', 'queued', 'cancelled', 'failed'],
  uploading: ['queued', 'failed', 'cancelled'],
  queued: ['running', 'cancelled', 'failed'],
  running: ['cancel_requested', 'publishing', 'partial', 'failed', 'completed'],
  cancel_requested: ['cancelled', 'partial', 'failed'],
  publishing: ['completed', 'partial', 'failed'],
  completed: ['expired'],
  partial: ['expired'],
  failed: ['queued', 'expired'],
  cancelled: ['expired'],
  expired: []
}

export interface DocumentJobProgress {
  totalUnits: number
  completedUnits: number
  failedUnits: number
  currentLabel?: string
}

export const DOCUMENT_CLEANUP_STATES = ['pending', 'partial', 'completed', 'failed'] as const

export type DocumentCleanupState = typeof DOCUMENT_CLEANUP_STATES[number]

export interface DocumentJobRecord {
  id: string
  ownerId: string
  tenantId?: string
  operationId: DocumentOperationId
  operationVersion: string
  status: DocumentJobStatus
  runtime: DocumentRuntimeKind
  configSnapshot: Record<string, unknown>
  /** Present only when the client supplied a retry token; never sent to the UI. */
  idempotencyKey?: string
  inputCount: number
  totalInputBytes: number
  outputCount: number
  progress: DocumentJobProgress
  errorCode?: DocumentErrorCode
  /** User-safe message only; never a stack trace or a server path. */
  errorMessageSafe?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  expiresAt: string
  cleanupStatus: DocumentCleanupState
}

/** Must stay identical to the `upload_status` CHECK in migration 0001. */
export const DOCUMENT_INPUT_STATUSES = ['pending', 'uploading', 'uploaded', 'verified', 'rejected', 'expired'] as const

export type DocumentInputStatus = typeof DOCUMENT_INPUT_STATUSES[number]

export interface DocumentJobInputRecord {
  id: string
  jobId: string
  ownerId: string
  originalName: string
  safeName: string
  mimeType: string
  extension: string
  size: number
  checksum?: string
  storageProvider: string
  storageKey: string
  status: DocumentInputStatus
  createdAt: string
  expiresAt: string
}

export const DOCUMENT_ARTIFACT_STATUSES = ['publishing', 'ready', 'downloaded', 'delete_pending', 'deleted', 'expired'] as const

export type DocumentArtifactStatus = typeof DOCUMENT_ARTIFACT_STATUSES[number]

export interface DocumentArtifactRecord {
  id: string
  jobId: string
  ownerId: string
  fileName: string
  mimeType: string
  size: number
  checksum?: string
  storageProvider: string
  storageKey: string
  /** Absolute path of the published copy; local/Electron delivery only. */
  localPath?: string
  status: DocumentArtifactStatus
  downloadCount: number
  firstDownloadedAt?: string
  lastDownloadedAt?: string
  createdAt: string
  expiresAt: string
}

/** Server-side handle to one stored object. Never sent to the client as-is. */
export interface StorageObjectRef {
  provider: 'local' | 'vercel-blob' | 's3-compatible'
  key: string
  ownerId: string
  size: number
  mimeType: string
  checksum?: string
}

export const DOCUMENT_ERROR_CODES = [
  'DOCUMENT_INPUT_REQUIRED',
  'DOCUMENT_INPUT_COUNT_INVALID',
  'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED',
  'DOCUMENT_INPUT_TOO_LARGE',
  'DOCUMENT_TOTAL_SIZE_EXCEEDED',
  'DOCUMENT_UPLOAD_INCOMPLETE',
  'DOCUMENT_UPLOAD_EXPIRED',
  'DOCUMENT_INPUT_NOT_READY',
  'DOCUMENT_JOB_NOT_FOUND',
  'DOCUMENT_JOB_NOT_OWNED',
  'DOCUMENT_JOB_STATE_INVALID',
  'DOCUMENT_JOB_ALREADY_RUNNING',
  'DOCUMENT_OUTPUT_NOT_READY',
  'DOCUMENT_OUTPUT_EXPIRED',
  'DOCUMENT_OUTPUT_TOO_LARGE',
  'DOCUMENT_ARTIFACT_EXPIRED',
  'DOCUMENT_STORAGE_UNAVAILABLE',
  'DOCUMENT_STORAGE_NOT_CONFIGURED',
  'DOCUMENT_DATABASE_NOT_CONFIGURED',
  'DOCUMENT_TEMP_CAPACITY_EXCEEDED',
  'DOCUMENT_RUNTIME_NOT_SUPPORTED',
  'DOCUMENT_WORKER_REQUIRED',
  'DOCUMENT_OPERATION_NOT_SUPPORTED',
  'DOCUMENT_OPERATION_CONFIG_INVALID',
  'DOCUMENT_PROCESSING_TIMEOUT',
  'DOCUMENT_CLEANUP_FAILED'
] as const

export type DocumentErrorCode = typeof DOCUMENT_ERROR_CODES[number]

/** Client-safe artifact view: a display name plus an authorized download route. */
export interface DocumentArtifactView {
  id: string
  jobId: string
  fileName: string
  mimeType: string
  size: number
  status: DocumentArtifactStatus
  expiresAt: string
  downloadPath: string
  /** Published file on disk; only local/Electron delivery knows this. */
  localPath?: string
  /**
   * Only present for an ephemeral run: the bytes ride along in the response
   * because no later request can read them back.
   */
  inlineBase64?: string
}

export interface DocumentJobView extends Omit<DocumentJobRecord, 'configSnapshot' | 'idempotencyKey'> {
  artifacts: DocumentArtifactView[]
}

export interface DocumentSettings {
  /** Local/Electron: remember the last destination the user chose. */
  rememberOutputDestination: boolean
  askBeforeOverwrite: boolean
  defaultRetentionDays: number
}
