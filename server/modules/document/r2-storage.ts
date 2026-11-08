import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
import { config } from '#server/config'

/** R2 rejects multipart parts smaller than 5 MB (the last part excepted). */
export const R2_MIN_PART_BYTES = 5 * 1024 * 1024
export const R2_MAX_PARTS = 10_000

export interface R2Settings {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export function r2Settings(): R2Settings {
  const r2 = config.document.r2
  const endpoint = r2.endpoint || (r2.accountId ? `https://${r2.accountId}.r2.cloudflarestorage.com` : '')
  if (!endpoint || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucket) {
    throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED')
  }
  return {
    endpoint,
    region: r2.region || 'auto',
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
    bucket: r2.bucket
  }
}

export function isR2Configured(): boolean {
  const r2 = config.document.r2
  return Boolean((r2.endpoint || r2.accountId) && r2.accessKeyId && r2.secretAccessKey && r2.bucket)
}

let cached: { client: S3Client, settings: R2Settings } | null = null

function r2Client(): { client: S3Client, settings: R2Settings } {
  if (cached) return cached
  const settings = r2Settings()
  cached = {
    settings,
    client: new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      // R2 is S3-compatible but does not implement every signature feature;
      // path-style addressing avoids bucket-in-host resolution problems.
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey
      }
    })
  }
  return cached
}

/**
 * Object keys are generated server-side only: `document/<ownerId>/<jobId>/…`.
 * The owner segment is a UUID-shaped hash so a key never carries a readable
 * user id, and it still lets a prefix delete stay scoped.
 */
export function r2ObjectKey(ownerId: string, jobId: string, kind: 'input' | 'output', ...segments: string[]): string {
  const owner = createHash('sha256').update(ownerId).digest('hex').slice(0, 16)
  return ['document', owner, jobId, kind, ...segments].join('/')
}

export interface MultipartIntent {
  uploadId: string
  key: string
  partSize: number
  partCount: number
}

export interface SignedPart {
  partNumber: number
  url: string
  expiresAt: string
}

export interface CompletedPart {
  partNumber: number
  etag: string
}

export class CloudflareR2StorageProvider implements DocumentStorageProvider {
  readonly kind = 's3-compatible' as const

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    const { client, settings } = r2Client()
    const key = r2ObjectKey(input.ownerId, input.jobId, 'input', input.inputId, input.fileName)
    const expiresIn = config.document.presignUploadTtlSeconds

    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: settings.bucket,
        Key: key,
        ContentType: input.mimeType,
        ContentLength: input.size
      }),
      { expiresIn }
    )

    return {
      url,
      method: 'PUT',
      headers: { 'content-type': input.mimeType },
      ref: {
        provider: 's3-compatible',
        key,
        ownerId: input.ownerId,
        size: input.size,
        mimeType: input.mimeType
      },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
    }
  }

  async verifyUploadedObject(ref: StorageObjectRef): Promise<VerifiedObject> {
    try {
      const metadata = await this.headObject(ref)
      if (!metadata) return { ref, verified: false, reason: 'missing' }
      // Multipart ETags are not a whole-file MD5, so only the byte count is
      // compared; the checksum is recomputed when the object is downloaded.
      if (metadata.size !== ref.size) return { ref, verified: false, reason: 'size-mismatch' }
      return { ref, verified: true }
    } catch (error) {
      if (error instanceof DocumentError) throw error
      return { ref, verified: false, reason: 'missing' }
    }
  }

  async createReadStream(ref: StorageObjectRef): Promise<Readable> {
    const { client, settings } = r2Client()
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: ref.key }))
      if (!response.Body) throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
      return response.Body as Readable
    } catch (error) {
      if (error instanceof DocumentError) throw error
      throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED', { key: ref.key })
    }
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectRef> {
    const { client, settings } = r2Client()
    const body = Buffer.isBuffer(input.data) ? input.data : await streamToBuffer(input.data)
    try {
      await client.send(new PutObjectCommand({
        Bucket: settings.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.mimeType,
        ContentLength: body.length
      }))
    } catch (error) {
      throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { cause: (error as Error).name })
    }
    return {
      provider: 's3-compatible',
      key: input.key,
      ownerId: input.ownerId,
      size: body.length,
      mimeType: input.mimeType,
      checksum: input.checksum
    }
  }

  async deleteObject(ref: StorageObjectRef): Promise<void> {
    const { client, settings } = r2Client()
    try {
      await client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: ref.key }))
    } catch (error) {
      throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { cause: (error as Error).name })
    }
  }

  async getMetadata(ref: StorageObjectRef): Promise<StorageObjectMetadata> {
    const metadata = await this.headObject(ref)
    if (!metadata) throw new DocumentError('DOCUMENT_ARTIFACT_EXPIRED', { key: ref.key })
    return metadata
  }

  async headObject(ref: StorageObjectRef): Promise<StorageObjectMetadata | null> {
    const { client, settings } = r2Client()
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: settings.bucket, Key: ref.key }))
      return {
        key: ref.key,
        size: Number(head.ContentLength ?? 0),
        mimeType: head.ContentType ?? ref.mimeType,
        checksum: head.Metadata?.sha256
      }
    } catch (error) {
      const name = (error as Error).name
      if (name === 'NotFound' || name === 'NoSuchKey' || name === 'NotFoundError') return null
      throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { cause: name })
    }
  }

  /**
   * Streams an object to a scratch path. `downloadToLocal` never buffers the
   * whole file, which is what keeps a 100 MB input inside the Function budget.
   */
  async downloadToLocal(ref: StorageObjectRef, targetPath: string): Promise<{ path: string, size: number, checksum?: string }> {
    mkdirSync(dirname(targetPath), { recursive: true })
    const stream = await this.createReadStream(ref)
    await pipeline(stream, createWriteStream(targetPath))
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(targetPath)) hash.update(chunk as Buffer)
    return { path: targetPath, size: statSync(targetPath).size, checksum: hash.digest('hex') }
  }

  /** Uploads a finished artifact without ever putting its bytes in a request body. */
  async uploadFromLocal(ownerId: string, jobId: string, fileName: string, localPath: string, mimeType: string): Promise<StorageObjectRef> {
    const { client, settings } = r2Client()
    const key = r2ObjectKey(ownerId, jobId, 'output', fileName)
    const size = statSync(localPath).size
    const hash = createHash('sha256')
    const body = createReadStream(localPath)
    body.on('data', chunk => hash.update(chunk))
    await client.send(new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      ContentLength: size
    }))
    return {
      provider: 's3-compatible',
      key,
      ownerId,
      size,
      mimeType,
      checksum: hash.digest('hex')
    }
  }

  async createDownloadUrl(ref: StorageObjectRef, fileName?: string): Promise<string> {
    const { client, settings } = r2Client()
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: settings.bucket,
        Key: ref.key,
        ResponseContentDisposition: fileName
          ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
          : undefined
      }),
      { expiresIn: config.document.presignDownloadTtlSeconds }
    )
  }

  async createMultipartUpload(input: CreateUploadTargetInput): Promise<MultipartIntent> {
    const { client, settings } = r2Client()
    const key = r2ObjectKey(input.ownerId, input.jobId, 'input', input.inputId, input.fileName)
    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: settings.bucket,
      Key: key,
      ContentType: input.mimeType
    }))
    if (!created.UploadId) throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { reason: 'no-upload-id' })
    const partSize = Math.max(R2_MIN_PART_BYTES, Math.ceil(input.size / R2_MAX_PARTS))
    return {
      uploadId: created.UploadId,
      key,
      partSize,
      partCount: Math.max(1, Math.ceil(input.size / partSize))
    }
  }

  async signUploadPart(key: string, uploadId: string, partNumber: number): Promise<SignedPart> {
    const { client, settings } = r2Client()
    const expiresIn = config.document.presignUploadTtlSeconds
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({ Bucket: settings.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn }
    )
    return { partNumber, url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[], ref: StorageObjectRef): Promise<VerifiedObject> {
    const { client, settings } = r2Client()
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber)
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: settings.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: ordered.map(part => ({ PartNumber: part.partNumber, ETag: part.etag }))
      }
    }))
    return this.verifyUploadedObject({ ...ref, key })
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const { client, settings } = r2Client()
    try {
      await client.send(new AbortMultipartUploadCommand({ Bucket: settings.bucket, Key: key, UploadId: uploadId }))
    } catch {
      // An already-gone upload is a completed abort for cleanup purposes.
    }
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

export const r2StorageProvider = new CloudflareR2StorageProvider()
