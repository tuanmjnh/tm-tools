import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { Readable as NodeReadable } from 'node:stream'
import type { H3Event } from 'h3'
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
import { hubStorageAvailable } from './runtime'
import { HubStorageError, hubStorageClient } from '#server/utils/hubStorage'
import type { HubDownloadGrant, HubStorageClient } from '#server/utils/hubStorage'
import { config } from '#server/config'

/**
 * Cloud storage through the TM Hub Storage Gateway.
 *
 * The bucket belongs to the Hub: tm-tools holds no R2/S3/Supabase key and never
 * learns the physical key. It names an allowed namespace plus a validated
 * relative path, and Hub authorizes (app + connection grant + namespace) before
 * stamping the app/environment prefix on the object.
 *
 * The handle tm-tools persists is the Hub `objectId`, not a path: reads and
 * deletes resolve through the manifest, so a changed bucket layout cannot make
 * a stored reference point somewhere else. The signed upload grant is handed to
 * the signed-in browser (that is what it exists for); the download grant stays
 * on the server and is fetched here.
 */
export const HUB_DEFAULT_NAMESPACE = 'tm-tools/pdf'

function ownerSegment(ownerId: string): string {
  return createHash('sha256').update(ownerId).digest('hex').slice(0, 16)
}

/** Keys stay opaque outside the server, exactly like the R2 adapter's. */
export function hubObjectKey(
  ownerId: string,
  jobId: string,
  kind: 'input' | 'output',
  id: string,
  fileName: string
): string {
  const area = kind === 'input' ? 'inputs' : 'outputs'
  return `${ownerSegment(ownerId)}/jobs/${jobId}/${area}/${id}/${fileName}`
}

export function hubStorageGate(event: H3Event): void {
  if (!hubStorageAvailable(event)) throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED', { reason: 'hub-storage-unavailable' })
}

function storageFailure(error: unknown): DocumentError {
  if (error instanceof HubStorageError) {
    return new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', {
      reason: error.code,
      requestId: error.detail.requestId,
      hubCode: error.detail.hubCode
    })
  }
  return new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { reason: 'hub-storage' })
}

/** Hub reports a vanished object either as 404 or as an expired upload session. */
function isGone(error: unknown): boolean {
  if (!(error instanceof HubStorageError)) return false
  return error.code === 'integrations.hubStorageNotFound' || error.detail.hubCode === 'storage.upload_expired'
}

function fileNameOf(key: string): string {
  return key.split('/').pop() || 'object'
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

export class HubStorageProvider implements DocumentStorageProvider {
  readonly kind = 's3-compatible' as const

  constructor(
    private readonly event: H3Event,
    private readonly namespace: string = HUB_DEFAULT_NAMESPACE,
    private readonly configuredConnectionId: string = config.document.hub.connectionId
  ) {}

  private client(): HubStorageClient {
    return hubStorageClient(this.event)
  }

  /**
   * An explicit connection wins. Otherwise the first one Hub lets this app
   * upload to: Hub still authorizes the namespace on every call, so choosing
   * here cannot widen the app's access.
   */
  private async connectionId(client: HubStorageClient): Promise<string> {
    if (this.configuredConnectionId) return this.configuredConnectionId
    const connections = await client.connections()
    const usable = connections.find(entry => entry.capabilities.directUpload)
    if (!usable) throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED', { reason: 'no-hub-storage-connection' })
    return usable.connectionId
  }

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    const relativePath = hubObjectKey(input.ownerId, input.jobId, 'input', input.inputId, input.fileName)
    try {
      const client = this.client()
      const connectionId = await this.connectionId(client)
      const grant = await client.initUpload({
        connectionId,
        namespace: this.namespace,
        relativePath,
        fileName: input.fileName,
        contentType: input.mimeType,
        sizeBytes: input.size
      })
      return {
        url: grant.url,
        method: grant.method,
        headers: grant.headers,
        uploadId: grant.uploadId,
        ref: {
          provider: 's3-compatible',
          key: grant.objectId,
          ownerId: input.ownerId,
          size: input.size,
          mimeType: input.mimeType
        },
        expiresAt: grant.expiresAt
      }
    } catch (error) {
      if (error instanceof DocumentError) throw error
      throw storageFailure(error)
    }
  }

  async verifyUploadedObject(ref: StorageObjectRef, uploadId?: string): Promise<VerifiedObject> {
    try {
      const client = this.client()
      // The upload session lets Hub HEAD the object before it marks it ready.
      const object = uploadId
        ? (await client.completeUpload(uploadId)).object
        : await client.getObject(ref.key)
      if (!object || object.status !== 'ready' || object.objectId !== ref.key) {
        return { ref, verified: false, reason: 'missing' }
      }
      if (object.sizeBytes !== ref.size) return { ref, verified: false, reason: 'size-mismatch' }
      return { ref, verified: true }
    } catch (error) {
      if (isGone(error)) return { ref, verified: false, reason: 'missing' }
      throw storageFailure(error)
    }
  }

  async createReadStream(ref: StorageObjectRef): Promise<Readable> {
    let grant: HubDownloadGrant
    try {
      grant = await this.client().createDownloadGrant(ref.key)
    } catch (error) {
      if (isGone(error)) throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
      throw storageFailure(error)
    }

    let response: Response
    try {
      response = await fetch(grant.url)
    } catch {
      throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { reason: 'hub-download-grant' })
    }
    if (response.status === 404 || response.status === 410) throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
    if (!response.ok || !response.body) {
      throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { reason: 'hub-download-grant' })
    }
    return NodeReadable.fromWeb(response.body as Parameters<typeof NodeReadable.fromWeb>[0])
  }

  async getMetadata(ref: StorageObjectRef): Promise<StorageObjectMetadata> {
    try {
      const object = await this.client().getObject(ref.key)
      if (!object || object.status !== 'ready') throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
      return {
        key: ref.key,
        size: object.sizeBytes,
        mimeType: object.contentType,
        checksum: object.checksumSha256 ?? ref.checksum
      }
    } catch (error) {
      if (error instanceof DocumentError) throw error
      if (isGone(error)) throw new DocumentError('DOCUMENT_OUTPUT_EXPIRED')
      throw storageFailure(error)
    }
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectRef> {
    const data = Buffer.isBuffer(input.data) ? input.data : await streamToBuffer(input.data)
    const client = this.client()
    let uploadId = ''

    try {
      const connectionId = await this.connectionId(client)
      const grant = await client.initUpload({
        connectionId,
        namespace: this.namespace,
        relativePath: `${ownerSegment(input.ownerId)}/${input.key}`,
        fileName: fileNameOf(input.key),
        contentType: input.mimeType,
        sizeBytes: data.length,
        overwrite: true
      })
      uploadId = grant.uploadId

      // Body is a Uint8Array, not a Buffer: the RequestInit body union in this
      // TypeScript build does not accept Buffer.
      const response = await fetch(grant.url, {
        method: grant.method,
        headers: grant.headers,
        body: new Uint8Array(data)
      })
      if (!response.ok) throw new HubStorageError('integrations.hubStorageFailed', response.status)

      const completed = await client.completeUpload(grant.uploadId)
      const object = completed.object
      if (!object || object.status !== 'ready') {
        throw new HubStorageError('integrations.hubStorageFailed', 502, { requestId: '' })
      }
      return {
        provider: 's3-compatible',
        key: object.objectId,
        ownerId: input.ownerId,
        size: object.sizeBytes,
        mimeType: object.contentType,
        checksum: object.checksumSha256 ?? input.checksum
      }
    } catch (error) {
      if (uploadId) await client.abortUpload(uploadId).catch(() => undefined)
      if (error instanceof DocumentError) throw error
      throw storageFailure(error)
    }
  }

  async deleteObject(ref: StorageObjectRef): Promise<void> {
    try {
      await this.client().deleteObject(ref.key)
    } catch (error) {
      if (isGone(error)) return
      throw storageFailure(error)
    }
  }
}
