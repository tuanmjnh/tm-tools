import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { DocumentJobInputRecord, DocumentOperationDefinition } from '#shared/types/document'
import { MIME_BY_EXTENSION } from '../pdf/inspect'
import { safeFileName } from '../pdf/security'
import { DocumentError } from './operations'
import { assertInsideJobs, jobInputDir } from './paths'
import { localObjectKey } from './storage'

const MAX_ENTRIES = 4096

export function extensionOf(name: string): string {
  return extname(name).replace(/^\./, '').toLowerCase()
}

/**
 * Checks the leading bytes against the extension. A `.pdf` that is really a
 * ZIP (docx) would otherwise reach an engine that trusts the suffix and fail
 * deep inside pdf-lib with an opaque error.
 */
export function signatureMatches(extension: string, head: Buffer): boolean {
  const startsWith = (bytes: number[]): boolean =>
    head.length >= bytes.length && bytes.every((byte, index) => head[index] === byte)

  switch (extension) {
    case 'pdf':
      return startsWith([0x25, 0x50, 0x44, 0x46])
    case 'png':
      return startsWith([0x89, 0x50, 0x4e, 0x47])
    case 'jpg':
    case 'jpeg':
      return startsWith([0xff, 0xd8, 0xff])
    case 'docx':
    case 'xlsx':
      return startsWith([0x50, 0x4b, 0x03, 0x04])
    case 'csv':
    case 'json':
    case 'xml':
      return true
    default:
      return false
  }
}

export interface StagedInput {
  record: DocumentJobInputRecord
  stagedPath: string
}

export interface StageInputArgs {
  jobId: string
  ownerId: string
  operation: DocumentOperationDefinition
  fileName: string
  data: Buffer
  declaredMime?: string
  expiresAt: string
  maxFileBytes: number
}

/**
 * Stage-once: the bytes the browser picked are written straight into the job
 * input directory. Nothing is copied into a persistent library unless the user
 * explicitly imports it later.
 */
export function stageInput(args: StageInputArgs): StagedInput {
  const { jobId, ownerId, operation, data } = args
  const safeName = safeFileName(args.fileName)
  const extension = extensionOf(safeName)

  if (!data.length) throw new DocumentError('DOCUMENT_INPUT_REQUIRED', { fileName: args.fileName })
  if (data.length > args.maxFileBytes) throw new DocumentError('DOCUMENT_INPUT_TOO_LARGE', { fileName: args.fileName, size: data.length })
  if (!operation.input.acceptedExtensions.includes(extension)) {
    throw new DocumentError('DOCUMENT_INPUT_TYPE_NOT_SUPPORTED', { fileName: args.fileName, extension })
  }
  if (!signatureMatches(extension, data.subarray(0, 16))) {
    throw new DocumentError('DOCUMENT_INPUT_TYPE_NOT_SUPPORTED', { fileName: args.fileName, reason: 'signature' })
  }

  const inputId = randomUUID()
  const target = assertInsideJobs(jobId, join(jobInputDir(jobId), inputId, safeName))
  mkdirSync(join(jobInputDir(jobId), inputId), { recursive: true })
  writeFileSync(target, data)

  const checksum = createHash('sha256').update(data).digest('hex')
  const record: DocumentJobInputRecord = {
    id: inputId,
    jobId,
    ownerId,
    originalName: args.fileName,
    safeName,
    mimeType: args.declaredMime || MIME_BY_EXTENSION[extension] || 'application/octet-stream',
    extension,
    size: data.length,
    checksum,
    storageProvider: 'local',
    storageKey: localObjectKey(jobId, 'input', inputId, safeName),
    status: 'verified',
    createdAt: new Date().toISOString(),
    expiresAt: args.expiresAt
  }

  return { record, stagedPath: target }
}

export function existingStagedSize(path: string): number | null {
  return existsSync(path) ? statSync(path).size : null
}

/** Validates the whole selection against the operation's declared cardinality. */
export function validateCount(operation: DocumentOperationDefinition, count: number): void {
  if (count < operation.input.minFiles || count > Math.min(operation.input.maxFiles, MAX_ENTRIES)) {
    throw new DocumentError('DOCUMENT_INPUT_COUNT_INVALID', {
      count,
      min: operation.input.minFiles,
      max: operation.input.maxFiles
    })
  }
}
