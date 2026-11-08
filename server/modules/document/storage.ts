import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { Readable } from 'node:stream'
import { dirname, join } from 'node:path'
import type { StorageObjectRef } from '#shared/types/document'
import type {
  CreateUploadTargetInput,
  DocumentStorageProvider,
  PutObjectInput,
  StorageObjectMetadata,
  UploadTarget,
  VerifiedObject
} from './contracts'
import { DocumentError } from './operations'
import { assertInsideJobs, jobInputDir, jobOutputDir } from './paths'
import { assertJobId } from './temporary'

/**
 * Local objects are plain files inside the job workspace. The `key` is a
 * logical `input/<inputId>/<name>` or `output/<name>` path, never an absolute
 * path, so a stored key can be resolved without trusting the client.
 */
function resolveLocalKey(ownerId: string, key: string): string {
  const parts = key.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length < 2) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  const [area, maybeJob, ...rest] = parts

  if (area === 'job') return resolveJobKey(maybeJob ?? '', ownerId, rest)
  throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
}

function resolveJobKey(jobId: string, _ownerId: string, rest: string[]): string {
  assertJobId(jobId)
  if (rest.length < 2) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  const [kind, ...tail] = rest
  const base = kind === 'input' ? jobInputDir(jobId) : kind === 'output' ? jobOutputDir(jobId) : ''
  if (!base) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  const target = join(base, ...tail)
  return assertInsideJobs(jobId, target)
}

export function localObjectKey(jobId: string, kind: 'input' | 'output', ...segments: string[]): string {
  return ['job', jobId, kind, ...segments].join('/')
}

export class LocalStorageProvider implements DocumentStorageProvider {
  readonly kind = 'local' as const

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    const key = localObjectKey(input.jobId, 'input', input.inputId, input.fileName)
    const target = resolveLocalKey(input.ownerId, key)
    mkdirSync(dirname(target), { recursive: true })

    return {
      // The client POSTs the bytes to its own authenticated upload route; the
      // page never sees a filesystem path.
      url: `/api/v1/documents/jobs/${encodeURIComponent(input.jobId)}/inputs/${encodeURIComponent(input.inputId)}/content`,
      method: 'POST',
      ref: {
        provider: 'local',
        key,
        ownerId: input.ownerId,
        size: input.size,
        mimeType: input.mimeType
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }
  }

  async verifyUploadedObject(ref: StorageObjectRef): Promise<VerifiedObject> {
    const target = resolveLocalKey(ref.ownerId, ref.key)
    if (!existsSync(target)) return { ref, verified: false, reason: 'missing' }
    const size = statSync(target).size
    if (size !== ref.size) return { ref, verified: false, reason: 'size-mismatch' }
    return { ref, verified: true }
  }

  async createReadStream(ref: StorageObjectRef): Promise<Readable> {
    const target = resolveLocalKey(ref.ownerId, ref.key)
    if (!existsSync(target)) throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
    return createReadStream(target)
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectRef> {
    const target = resolveLocalKey(input.ownerId, input.key)
    mkdirSync(dirname(target), { recursive: true })

    if (Buffer.isBuffer(input.data)) {
      writeFileSync(target, input.data)
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of input.data) chunks.push(Buffer.from(chunk as Buffer))
      writeFileSync(target, Buffer.concat(chunks))
    }

    const size = statSync(target).size
    return {
      provider: 'local',
      key: input.key,
      ownerId: input.ownerId,
      size,
      mimeType: input.mimeType,
      checksum: input.checksum
    }
  }

  async deleteObject(ref: StorageObjectRef): Promise<void> {
    const target = resolveLocalKey(ref.ownerId, ref.key)
    rmSync(target, { force: true })
  }

  async getMetadata(ref: StorageObjectRef): Promise<StorageObjectMetadata> {
    const target = resolveLocalKey(ref.ownerId, ref.key)
    if (!existsSync(target)) throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
    const stats = statSync(target)
    return {
      key: ref.key,
      size: stats.size,
      mimeType: ref.mimeType,
      checksum: ref.checksum,
      localPath: target
    }
  }
}

export function localPathForRef(ref: StorageObjectRef): string {
  return resolveLocalKey(ref.ownerId, ref.key)
}

export function checksumOfFile(path: string): string | undefined {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return undefined
  }
}

export const localStorageProvider = new LocalStorageProvider()
