import { randomUUID } from 'node:crypto'
import type {
  DocumentJobInputRecord,
  DocumentJobRecord,
  DocumentOperationDefinition,
  StorageObjectRef
} from '#shared/types/document'
import type {
  DocumentJobRepository,
  DocumentStorageProvider
} from './contracts'
import { DocumentError } from './operations'
import { extensionOf, validateCount } from './staging'
import { safeFileName } from '../pdf/security'
import { MIME_BY_EXTENSION } from '../pdf/inspect'
import type { CloudflareR2StorageProvider, CompletedPart } from './r2-storage'

/** Above this size a single signed PUT is replaced by a multipart plan. */
const MULTIPART_THRESHOLD = 25 * 1024 * 1024

export interface UploadPlan {
  mode: 'browser-put' | 'multipart'
  expiresAt: string
  headers?: Record<string, string>
  url?: string
  /** `PUT` (R2) or `POST` (Hub's presigned form); defaults to `PUT`. */
  method?: 'PUT' | 'POST'
  /** Provider upload session; the client echoes it to `complete`. */
  uploadId?: string
  multipart?: {
    uploadId: string
    key: string
    partSize: number
    partCount: number
    parts: { partNumber: number, url: string, expiresAt: string }[]
  }
}

export interface DeclaredUpload {
  input: DocumentJobInputRecord
  plan: UploadPlan
}

export interface DeclareUploadArgs {
  job: DocumentJobRecord
  operation: DocumentOperationDefinition
  existingCount: number
  fileName: string
  size: number
  mimeType?: string
  maxFileBytes: number
  storage: DocumentStorageProvider
}

/**
 * Registers one declared cloud input and hands the browser a short-lived place
 * to put its bytes, so the Function never proxies the body. The record stays
 * `pending` until `completeUpload` verifies the stored object.
 */
export async function declareUpload(args: DeclareUploadArgs): Promise<DeclaredUpload> {
  if (args.storage.kind === 'local') {
    // The local runtime uploads through the multipart route, which stages the
    // bytes directly into the job workspace.
    throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED', { reason: 'local-runtime-uses-form-post' })
  }

  const safeName = safeFileName(args.fileName)
  const extension = extensionOf(safeName)
  const mimeType = args.mimeType || MIME_BY_EXTENSION[extension] || 'application/octet-stream'

  if (!args.size) throw new DocumentError('DOCUMENT_INPUT_REQUIRED', { fileName: args.fileName })
  if (args.size > args.maxFileBytes) {
    throw new DocumentError('DOCUMENT_INPUT_TOO_LARGE', { fileName: args.fileName, size: args.size })
  }
  if (!args.operation.input.acceptedExtensions.includes(extension)) {
    throw new DocumentError('DOCUMENT_INPUT_TYPE_NOT_SUPPORTED', { fileName: args.fileName, extension })
  }
  validateCount(args.operation, args.existingCount + 1)

  const inputId = randomUUID()
  const record = (storageKey: string): DocumentJobInputRecord => ({
    id: inputId,
    jobId: args.job.id,
    ownerId: args.job.ownerId,
    originalName: args.fileName,
    safeName,
    mimeType,
    extension,
    size: args.size,
    storageProvider: args.storage.kind,
    storageKey,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: args.job.expiresAt
  })

  const multipart = args.storage as Partial<CloudflareR2StorageProvider>

  if (args.size > MULTIPART_THRESHOLD && typeof multipart.createMultipartUpload === 'function') {
    const intent = await multipart.createMultipartUpload({
      ownerId: args.job.ownerId,
      jobId: args.job.id,
      inputId,
      fileName: safeName,
      mimeType,
      size: args.size
    })
    const parts = await Promise.all(
      Array.from({ length: intent.partCount }, (_, index) =>
        multipart.signUploadPart!(intent.key, intent.uploadId, index + 1))
    )
    return {
      input: record(intent.key),
      plan: {
        mode: 'multipart',
        expiresAt: parts[0]?.expiresAt ?? args.job.expiresAt,
        multipart: {
          uploadId: intent.uploadId,
          key: intent.key,
          partSize: intent.partSize,
          partCount: intent.partCount,
          parts
        }
      }
    }
  }

  const target = await args.storage.createUploadTarget({
    ownerId: args.job.ownerId,
    jobId: args.job.id,
    inputId,
    fileName: safeName,
    mimeType,
    size: args.size
  })
  return {
    // The provider decides the durable identity: R2 keeps the key it signed,
    // Hub returns an `objectId` that reads and deletes resolve through.
    input: record(target.ref.key),
    plan: {
      mode: 'browser-put',
      url: target.url,
      method: target.method,
      headers: target.headers,
      uploadId: target.uploadId,
      expiresAt: target.expiresAt
    }
  }
}

export interface CompleteUploadArgs {
  jobs: DocumentJobRepository
  storage: DocumentStorageProvider
  job: DocumentJobRecord
  inputId: string
  ownerId: string
  parts?: CompletedPart[]
  uploadId?: string
  key?: string
}

/**
 * Finalize: the stored object must exist and match the declared byte count
 * before the input flips to `verified`. A multipart upload is completed first so
 * its parts become one object; a mismatch aborts it rather than leaving a
 * half-written object behind.
 */
export async function completeUpload(args: CompleteUploadArgs): Promise<DocumentJobInputRecord> {
  const inputs = await args.jobs.listInputs(args.job.id, args.ownerId)
  const input = inputs.find(entry => entry.id === args.inputId)
  if (!input) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  if (input.status === 'verified') return input

  const ref: StorageObjectRef = {
    provider: input.storageProvider as StorageObjectRef['provider'],
    key: input.storageKey,
    ownerId: input.ownerId,
    size: input.size,
    mimeType: input.mimeType
  }

  if (args.parts?.length) {
    if (!args.uploadId || !args.key || args.key !== input.storageKey) {
      throw new DocumentError('DOCUMENT_UPLOAD_INCOMPLETE', { reason: 'upload-session-mismatch' })
    }
    const r2 = args.storage as CloudflareR2StorageProvider
    const completed = await r2.completeMultipartUpload(args.key, args.uploadId, args.parts, ref)
    if (!completed.verified) {
      await r2.abortMultipartUpload(args.key, args.uploadId)
      throw new DocumentError('DOCUMENT_UPLOAD_INCOMPLETE', { reason: completed.reason })
    }
  }

  // A multipart session was already closed above; only a single-PUT session
  // (Hub) still needs completing here.
  const verified = await args.storage.verifyUploadedObject(ref, args.parts?.length ? undefined : args.uploadId)
  if (!verified.verified) {
    throw new DocumentError('DOCUMENT_UPLOAD_INCOMPLETE', { reason: verified.reason })
  }

  const updated: DocumentJobInputRecord = { ...input, status: 'verified' }
  await args.jobs.addInput(updated)
  return updated
}
