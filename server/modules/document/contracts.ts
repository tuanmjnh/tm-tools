import type { Readable } from 'node:stream'
import type {
  DocumentArtifactRecord,
  DocumentJobInputRecord,
  DocumentJobProgress,
  DocumentJobRecord,
  DocumentJobStatus,
  DocumentOperationDefinition,
  DocumentRuntimeKind,
  StorageObjectRef
} from '#shared/types/document'

/**
 * Adapter contracts for the v4 document runtime. Nothing here touches the
 * filesystem or a provider SDK: the local and cloud modules implement these
 * interfaces so the executor and the API stay storage-agnostic.
 */

export interface CreateUploadTargetInput {
  ownerId: string
  jobId: string
  inputId: string
  fileName: string
  mimeType: string
  size: number
}

export interface UploadTarget {
  /** Where the client may PUT/upload the bytes; provider specific. */
  url: string
  method: 'PUT' | 'POST'
  headers?: Record<string, string>
  /** Provider upload session the client must hand back to `complete`. */
  uploadId?: string
  /** Server-side object the finished upload will be verified against. */
  ref: StorageObjectRef
  expiresAt: string
}

export interface VerifiedObject {
  ref: StorageObjectRef
  verified: boolean
  reason?: 'missing' | 'size-mismatch' | 'type-mismatch'
}

export interface PutObjectInput {
  ownerId: string
  key: string
  data: Buffer | Readable
  mimeType: string
  size?: number
  checksum?: string
}

export interface StorageObjectMetadata {
  key: string
  size: number
  mimeType: string
  checksum?: string
  /** Server-only location for adapters that stage objects on local disk. */
  localPath?: string
}

export interface DocumentStorageProvider {
  readonly kind: StorageObjectRef['provider']
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>
  /**
   * `uploadId` closes the provider's own upload session (Hub HEADs the object
   * before marking it ready); providers without sessions ignore it.
   */
  verifyUploadedObject(ref: StorageObjectRef, uploadId?: string): Promise<VerifiedObject>
  createReadStream(ref: StorageObjectRef): Promise<Readable>
  putObject(input: PutObjectInput): Promise<StorageObjectRef>
  deleteObject(ref: StorageObjectRef): Promise<void>
  getMetadata(ref: StorageObjectRef): Promise<StorageObjectMetadata>
  /**
   * Optional: a URL the browser may fetch directly. Present only when this
   * deployment owns the bucket and can sign its own grant. Hub cannot — its
   * provider grant must never reach the browser — so routes fall back to
   * streaming through `createReadStream`.
   */
  createDownloadUrl?(ref: StorageObjectRef, fileName?: string): Promise<string>
}

export interface TempUsage {
  jobId: string
  bytes: number
  limitBytes: number
  files: number
}

export interface CleanupReport {
  jobId: string
  removedBytes: number
  removedEntries: number
  failed: string[]
}

/** Server-only working area for one job. Paths never leave the server process. */
export interface TempJobWorkspace {
  jobId: string
  root: string
  inputDir: string
  workingDir: string
  outputDir: string
  cleanup(): Promise<CleanupReport>
}

export interface TemporaryWorkspace {
  create(jobId: string): Promise<TempJobWorkspace>
  cleanup(jobId: string): Promise<CleanupReport>
  /** Drops input/ and working/ but keeps output/, which artifact downloads read. */
  releaseStaging(jobId: string): Promise<CleanupReport>
  getUsage(jobId: string): Promise<TempUsage>
  ensureCapacity(jobId: string, expectedBytes: number): Promise<void>
  /** Jobs whose temp root is older than the TTL; startup janitor input. */
  listOrphans(before: Date): Promise<string[]>
}

export interface JobTransition {
  to: DocumentJobStatus
  errorCode?: string
  errorMessageSafe?: string
  at?: string
}

export interface JobListQuery {
  ownerId: string
  status?: DocumentJobStatus[]
  operationId?: string
  limit?: number
  cursor?: string
}

export interface ExpiredJobCandidate {
  jobId: string
  ownerId: string
  expiresAt: string
}

export interface CreateDocumentJobInput {
  ownerId: string
  tenantId?: string
  operationId: DocumentOperationDefinition['id']
  operationVersion: string
  runtime: DocumentRuntimeKind
  configSnapshot: Record<string, unknown>
  expiresAt: string
  /**
   * Optional client token. A retry with the same owner + key returns the job
   * created by the first attempt instead of creating a duplicate.
   */
  idempotencyKey?: string
}

/**
 * Source of truth for job state. Local writes JSON under
 * `.system/jobs/<jobId>/manifest.json`; a cloud adapter writes rows in the
 * durable database. Both must scope every read by `ownerId`.
 */
export interface DocumentJobRepository {
  createJob(input: CreateDocumentJobInput): Promise<DocumentJobRecord>
  getJob(jobId: string, ownerId: string): Promise<DocumentJobRecord | null>
  updateStatus(jobId: string, transition: JobTransition): Promise<void>
  updateProgress(jobId: string, progress: DocumentJobProgress): Promise<void>
  addInput(input: DocumentJobInputRecord): Promise<void>
  listInputs(jobId: string, ownerId: string): Promise<DocumentJobInputRecord[]>
  addArtifact(artifact: DocumentArtifactRecord): Promise<void>
  listArtifacts(jobId: string, ownerId: string): Promise<DocumentArtifactRecord[]>
  getArtifact(artifactId: string, ownerId: string): Promise<DocumentArtifactRecord | null>
  updateArtifact(artifact: DocumentArtifactRecord): Promise<void>
  listJobs(query: JobListQuery): Promise<DocumentJobRecord[]>
  findExpired(before: Date, limit: number): Promise<ExpiredJobCandidate[]>
  deleteJob(jobId: string, ownerId: string): Promise<void>
  /** Retention cleanup: keeps the record for history but frees its bytes. */
  markExpired(jobId: string, ownerId: string): Promise<void>
}

/** One input after the server verified it: staged locally, never client-trusted. */
export interface VerifiedInput {
  inputId: string
  originalName: string
  safeName: string
  mimeType: string
  extension: string
  size: number
  /** Absolute path inside the job temp input directory. */
  stagedPath: string
  checksum?: string
}

export interface ValidationIssue {
  code: string
  inputId?: string
  details?: Record<string, unknown>
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export interface OperationEstimate {
  units: number
  estimatedOutputBytes: number
  estimatedDurationMs: number
}

/** One produced file, already written inside the job output directory. */
export interface ProducedFile {
  fileName: string
  mimeType: string
  path: string
  size: number
}

export interface OperationExecutionContext {
  jobId: string
  ownerId: string
  runtime: DocumentRuntimeKind
  workspace: TempJobWorkspace
  inputs: VerifiedInput[]
  signal: AbortSignal
  onProgress: (progress: Partial<DocumentJobProgress>) => Promise<void> | void
}

export interface OperationExecutionResult {
  files: ProducedFile[]
  /** Units that failed while the rest succeeded; drives the `partial` status. */
  failedUnits?: number
  errorCode?: string
}

/**
 * Adapter around one existing engine. Implementations stage inputs, call the
 * v3 engine with local paths, and return files inside the job output dir.
 */
export interface DocumentOperationExecutor<TConfig = unknown> {
  readonly operationId: DocumentOperationDefinition['id']
  validateInputs(inputs: VerifiedInput[], config: TConfig): Promise<ValidationResult>
  estimate?(inputs: VerifiedInput[], config: TConfig): Promise<OperationEstimate>
  execute(context: OperationExecutionContext, config: TConfig): Promise<OperationExecutionResult>
}

/** Where a published artifact's bytes ended up, after delivery ran. */
export interface PublishedObject {
  storageProvider: StorageObjectRef['provider']
  storageKey: string
  size: number
  checksum?: string
  /** Where the file landed when the delivery writes a user-visible copy. */
  localPath?: string
}

/** File Access / delivery capability: how a finished artifact reaches the user. */
export interface OutputDeliveryAdapter {
  /**
   * `folder` means the runtime can write into a server-side default output
   * folder; `download` means artifacts must be fetched over the authenticated
   * download route (cloud) or a browser save flow.
   */
  readonly mode: 'folder' | 'download'
  publish(artifact: DocumentArtifactRecord, localPath: string): Promise<PublishedObject>
  remove(artifact: DocumentArtifactRecord): Promise<void>
}
