import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { config } from '#server/config'

/**
 * Server-only client for the TM Hub Storage Gateway (`/api/v1/apps/:id/storage`).
 *
 * The Hub owns provider credentials (R2/S3/Supabase Storage) and the object
 * manifest; tm-tools never sees them. Every call carries the app identity
 * (`X-App-Id` + `X-App-Secret`). The signed-in user's bearer rides along for
 * attribution, but the gateway authorizes the app, not the user.
 *
 * Hub answers `{ success: true, data }` / `{ error: true, statusMessage }`. The
 * object identity is `objectId`: tm-tools stores that, never a bucket or key.
 * Upload/download grants are short-lived bearer credentials for exactly one
 * object — they are returned to the caller, never logged or persisted.
 */

export type HubStorageErrorCode
  = | 'integrations.hubStorageNotConfigured'
    | 'integrations.hubStorageUnauthorized'
    | 'integrations.hubStorageNotFound'
    | 'integrations.hubStorageRejected'
    | 'integrations.hubStorageTimeout'
    | 'integrations.hubStorageFailed'

export interface HubStorageErrorDetail {
  hubCode?: string
  requestId?: string
}

export class HubStorageError extends Error {
  readonly code: HubStorageErrorCode
  readonly status: number
  readonly detail: HubStorageErrorDetail

  constructor(code: HubStorageErrorCode, status: number, detail: HubStorageErrorDetail = {}) {
    super(`Hub storage request failed: ${code}`)
    this.name = 'HubStorageError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

export interface HubStorageCapabilities {
  directUpload: boolean
  directDownload: boolean
  multipartUpload: boolean
  rangeRead: boolean
  copyObject: boolean
  listObjects: boolean
  maxSingleUploadBytes?: number
  maxObjectBytes?: number
}

export interface HubStorageConnection {
  connectionId: string
  provider: string
  name: string
  label: string | null
  environment: string
  origin: 'own' | 'granted'
  capabilities: HubStorageCapabilities
}

export interface HubObjectInfo {
  objectId: string
  connectionId: string
  namespace: string
  relativePath: string
  fileName: string
  contentType: string
  sizeBytes: number
  checksumSha256: string | null
  status: 'pending' | 'ready' | 'deleted' | 'failed'
}

export interface InitUploadInput {
  connectionId: string
  namespace: string
  relativePath: string
  fileName: string
  contentType: string
  sizeBytes: number
  overwrite?: boolean
}

/** Short-lived, single-object write grant. Never log or store `url`/`headers`. */
export interface HubUploadGrant {
  uploadId: string
  objectId: string
  connectionId: string
  url: string
  method: 'PUT' | 'POST'
  headers: Record<string, string>
  expiresAt: string
  maxBytes: number
}

/** Short-lived read grant. `url` is provider-signed; it stays inside the server. */
export interface HubDownloadGrant {
  objectId: string
  url: string
  expiresAt: string
  contentType: string
  contentLength: number
  fileName: string
}

export interface HubStorageClient {
  /** Storage connections granted to this app: metadata only, never a credential. */
  connections(): Promise<HubStorageConnection[]>
  /** Sign one object PUT; Hub creates the `pending` manifest entry. */
  initUpload(input: InitUploadInput): Promise<HubUploadGrant>
  /** Provider-verified completion; Hub HEADs the object before marking it ready. */
  completeUpload(uploadId: string): Promise<{ uploadId: string, object: HubObjectInfo | null }>
  abortUpload(uploadId: string): Promise<void>
  /** Manifest entry, or `null` when Hub does not know (or no longer has) it. */
  getObject(objectId: string): Promise<HubObjectInfo | null>
  createDownloadGrant(objectId: string): Promise<HubDownloadGrant>
  /** Remove one object; an absent object is not an error. */
  deleteObject(objectId: string): Promise<void>
}

interface HubEnvelope<T> {
  success?: boolean
  data?: T
  message?: string
  statusMessage?: string
}

export interface HubTarget {
  baseUrl: string
  headers: Record<string, string>
  timeoutMs: number
  requestId: string
}

/**
 * Hub error bodies carry a stable `statusMessage` (`storage.object_not_found`)
 * and a human `message`. Only the stable code is kept, so a refused request can
 * never smuggle a signed URL into an error surfaced to the caller.
 */
function hubCodeOf(body: HubEnvelope<unknown> | undefined): string | undefined {
  const status = body?.statusMessage
  if (typeof status === 'string' && /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/i.test(status)) return status
  return undefined
}

function unwrap<T>(response: HubEnvelope<T> | undefined, requestId: string): T {
  if (!response || response.success !== true || response.data === undefined) {
    throw new HubStorageError('integrations.hubStorageFailed', 502, {
      hubCode: hubCodeOf(response),
      requestId
    })
  }
  return response.data
}

function mapStatus(status: number, requestId: string, body?: HubEnvelope<unknown>): HubStorageError {
  const detail: HubStorageErrorDetail = { hubCode: hubCodeOf(body), requestId }
  if (status === 401 || status === 403) return new HubStorageError('integrations.hubStorageUnauthorized', status, detail)
  if (status === 404) return new HubStorageError('integrations.hubStorageNotFound', status, detail)
  if (status === 408 || status === 504) return new HubStorageError('integrations.hubStorageTimeout', status, detail)
  if (status >= 400 && status < 500) return new HubStorageError('integrations.hubStorageRejected', status, detail)
  return new HubStorageError('integrations.hubStorageFailed', status, detail)
}

interface HubRuntimeConfig {
  public?: { hubUrl?: string, hubAppId?: string }
  hubAppSecret?: string
}

/**
 * Resolved per call from the Nitro runtime config. `runtimeConfig.hubAppSecret`
 * is the deployment value and never appears in `runtimeConfig.public`.
 */
function hubSettings(event: H3Event): { url: string, appId: string, secret: string } {
  const runtime = useRuntimeConfig(event) as unknown as HubRuntimeConfig
  return {
    url: String(runtime.public?.hubUrl ?? '').replace(/\/+$/, ''),
    appId: String(runtime.public?.hubAppId ?? 'tm-tools').trim(),
    secret: String(runtime.hubAppSecret ?? '').trim()
  }
}

/**
 * Read from the event per call: one identity can never be served from a cache.
 * `context.authToken` is the raw bearer the middleware verified; `auth.token`
 * only exists in tests that stub the context directly.
 */
function callerToken(event: H3Event): string {
  const raw = (event.context as { authToken?: unknown } | undefined)?.authToken
  if (typeof raw === 'string' && raw) return raw
  const auth = (event.context?.auth ?? null) as { token?: string } | null
  return String(auth?.token ?? '')
}

export function hubTarget(event: H3Event): HubTarget {
  const { url: hubUrl, appId: hubAppId, secret } = hubSettings(event)
  const requestId = randomUUID()

  if (!hubUrl || !hubAppId || !secret) {
    throw new HubStorageError('integrations.hubStorageNotConfigured', 503, { requestId })
  }

  const headers: Record<string, string> = {
    'X-App-Id': hubAppId,
    'X-App-Secret': secret,
    'X-Request-Id': requestId,
    'Accept': 'application/json'
  }
  const token = callerToken(event)
  if (token) headers.Authorization = `Bearer ${token}`

  return {
    baseUrl: `${hubUrl}/api/v1/apps/${encodeURIComponent(hubAppId)}/storage`,
    headers,
    timeoutMs: config.document.hub.timeoutMs,
    requestId
  }
}

/**
 * Body of one gateway call. Signed URLs never enter an error message, a log
 * line or the returned value of a route that renders JSON: the caller gets a
 * stable tm-tools code and the Hub correlation id only.
 */
async function hubJson<T>(target: HubTarget, method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), target.timeoutMs)

  let response: Response
  try {
    response = await fetch(`${target.baseUrl}${path}`, {
      method,
      headers: body ? { ...target.headers, 'Content-Type': 'application/json' } : target.headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError'
    throw new HubStorageError(
      aborted ? 'integrations.hubStorageTimeout' : 'integrations.hubStorageFailed',
      aborted ? 504 : 502,
      { requestId: target.requestId }
    )
  } finally {
    clearTimeout(timer)
  }

  const payload = await response.json().catch(() => undefined) as HubEnvelope<T> | undefined
  if (!response.ok) throw mapStatus(response.status, target.requestId, payload)
  return unwrap(payload, target.requestId)
}

/** A grant must be an absolute http(s) URL; anything else is a broken gateway. */
function grantUrl(target: HubTarget, raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new HubStorageError('integrations.hubStorageFailed', 502, { requestId: target.requestId })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HubStorageError('integrations.hubStorageFailed', 502, { requestId: target.requestId })
  }
  return value
}

function toObjectInfo(raw: unknown): HubObjectInfo | null {
  const value = raw as Partial<Record<keyof HubObjectInfo, unknown>> | null
  if (!value || typeof value.objectId !== 'string' || !value.objectId) return null
  const status = value.status === 'pending' || value.status === 'ready' || value.status === 'deleted' || value.status === 'failed'
    ? value.status
    : 'ready'
  return {
    objectId: value.objectId,
    connectionId: String(value.connectionId ?? ''),
    namespace: String(value.namespace ?? ''),
    relativePath: String(value.relativePath ?? ''),
    fileName: String(value.fileName ?? ''),
    contentType: String(value.contentType ?? 'application/octet-stream'),
    sizeBytes: Number(value.sizeBytes ?? 0),
    checksumSha256: typeof value.checksumSha256 === 'string' ? value.checksumSha256 : null,
    status
  }
}

export function hubStorageClient(event: H3Event): HubStorageClient {
  const target = hubTarget(event)

  return {
    async connections() {
      const payload = await hubJson<{ connections?: unknown[] }>(target, 'GET', '/connections')
      const list = Array.isArray(payload.connections) ? payload.connections : []
      return list.flatMap((raw) => {
        const value = raw as Partial<HubStorageConnection> | null
        if (!value || typeof value.connectionId !== 'string' || !value.connectionId) return []
        return [{
          connectionId: value.connectionId,
          provider: String(value.provider ?? ''),
          name: String(value.name ?? 'default'),
          label: typeof value.label === 'string' ? value.label : null,
          environment: String(value.environment ?? 'production'),
          origin: value.origin === 'granted' ? 'granted' as const : 'own' as const,
          capabilities: value.capabilities ?? {
            directUpload: false,
            directDownload: false,
            multipartUpload: false,
            rangeRead: false,
            copyObject: false,
            listObjects: false
          }
        }]
      })
    },

    async initUpload(input) {
      const payload = await hubJson<Record<string, unknown>>(target, 'POST', '/uploads/initiate', {
        connectionId: input.connectionId,
        namespace: input.namespace,
        relativePath: input.relativePath,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        overwrite: input.overwrite === true
      })

      if (payload.transferMode === 'multipart') {
        // tm-tools signs one PUT per object; a multipart plan needs a different
        // client contract and none of the document flows request one.
        throw new HubStorageError('integrations.hubStorageRejected', 501, {
          hubCode: 'storage.multipart_not_supported',
          requestId: target.requestId
        })
      }

      const uploadId = String(payload.uploadId ?? '')
      const objectId = String(payload.objectId ?? '')
      if (!uploadId || !objectId) {
        throw new HubStorageError('integrations.hubStorageFailed', 502, { requestId: target.requestId })
      }
      return {
        uploadId,
        objectId,
        connectionId: String(payload.connectionId ?? input.connectionId),
        url: grantUrl(target, payload.uploadUrl),
        method: payload.method === 'POST' ? 'POST' : 'PUT',
        headers: (payload.headers ?? {}) as Record<string, string>,
        expiresAt: String(payload.expiresAt ?? ''),
        maxBytes: Number(payload.maxBytes ?? input.sizeBytes)
      }
    },

    async completeUpload(uploadId) {
      const payload = await hubJson<{ uploadId?: unknown, object?: unknown }>(
        target,
        'POST',
        `/uploads/${encodeURIComponent(uploadId)}/complete`
      )
      return { uploadId: String(payload.uploadId ?? uploadId), object: toObjectInfo(payload.object) }
    },

    async abortUpload(uploadId) {
      await hubJson<unknown>(target, 'POST', `/uploads/${encodeURIComponent(uploadId)}/abort`)
    },

    async getObject(objectId) {
      try {
        const payload = await hubJson<{ object?: unknown }>(
          target,
          'GET',
          `/objects/${encodeURIComponent(objectId)}`
        )
        return toObjectInfo(payload.object)
      } catch (error) {
        if (error instanceof HubStorageError && error.code === 'integrations.hubStorageNotFound') return null
        throw error
      }
    },

    async createDownloadGrant(objectId) {
      const payload = await hubJson<Record<string, unknown>>(
        target,
        'POST',
        `/objects/${encodeURIComponent(objectId)}/download-grant`
      )
      return {
        objectId: String(payload.objectId ?? objectId),
        url: grantUrl(target, payload.downloadUrl),
        expiresAt: String(payload.expiresAt ?? ''),
        contentType: String(payload.contentType ?? 'application/octet-stream'),
        contentLength: Number(payload.contentLength ?? 0),
        fileName: String(payload.fileName ?? '')
      }
    },

    async deleteObject(objectId) {
      try {
        await hubJson<unknown>(target, 'DELETE', `/objects/${encodeURIComponent(objectId)}`)
      } catch (error) {
        // Absent already: the caller asked for the object to be gone.
        if (error instanceof HubStorageError && error.code === 'integrations.hubStorageNotFound') return
        throw error
      }
    }
  }
}
