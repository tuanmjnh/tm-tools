import type {
  DocumentArtifactView,
  DocumentJobView,
  DocumentOperationDefinition,
  DocumentRuntimeCapabilities
} from '#shared/types/document'

export interface DocumentErrorPayload {
  code: string
  message?: string
  retryable?: boolean
}

interface DocumentEnvelope<T> {
  ok: boolean
  data: T
  requestId: string
}

export interface UploadPlan {
  mode: 'form-post' | 'browser-put' | 'multipart'
  url?: string
  method?: 'PUT' | 'POST'
  headers?: Record<string, string>
  /** Provider upload session, echoed to `completeInput`. */
  uploadId?: string
  expiresAt: string
  multipart?: {
    uploadId: string
    key: string
    partSize: number
    partCount: number
    parts: { partNumber: number, url: string, expiresAt: string }[]
  }
}

export interface PlannedInput {
  id: string
  safeName: string
  size: number
  storageProvider: string
  storageKey: string
  status: string
}

function apiUrl(path: string): string {
  return `/api/v1/documents${path}`
}

function errorCodeOf(error: unknown): DocumentErrorPayload {
  const candidate = error as {
    statusMessage?: string
    data?: { error?: DocumentErrorPayload }
    message?: string
  }
  const fromBody = candidate?.data?.error
  if (fromBody?.code) return fromBody
  return { code: candidate?.statusMessage || candidate?.message || 'DOCUMENT_STORAGE_UNAVAILABLE' }
}

/**
 * One client for the v4 document API. Errors are normalized to the server's
 * `DOCUMENT_*` codes so pages can map them to locale keys instead of printing
 * whatever the transport produced.
 */
export function useDocumentApi() {
  /**
   * `/health` is public and answers the payload directly, while every
   * authenticated route wraps it in `DocumentEnvelope`. Reading `data` blindly
   * left the Settings page with an empty health object.
   */
  async function get<T>(path: string, query?: Record<string, string>): Promise<T> {
    try {
      const res = await $fetch<DocumentEnvelope<T> | T>(apiUrl(path), { method: 'GET', query })
      const envelope = res as DocumentEnvelope<T>
      return envelope?.data ?? (res as T)
    } catch (error) {
      throw errorCodeOf(error)
    }
  }

  async function post<T>(path: string, body?: Record<string, unknown> | FormData): Promise<T> {
    try {
      const res = await $fetch<DocumentEnvelope<T>>(apiUrl(path), { method: 'POST', body })
      return res.data
    } catch (error) {
      throw errorCodeOf(error)
    }
  }

  async function del<T>(path: string): Promise<T> {
    try {
      const res = await $fetch<DocumentEnvelope<T>>(apiUrl(path), { method: 'DELETE' })
      return res.data
    } catch (error) {
      throw errorCodeOf(error)
    }
  }

  /**
   * Implements the upload contract against whatever plan the server returned:
   * the browser writes straight to storage (single `PUT`/`POST` to a signed
   * grant, or multipart parts), so large files never travel through the
   * Function body. A single-grant session id comes back for `completeInput`.
   */
  async function uploadWithPlan(
    plan: UploadPlan,
    file: File
  ): Promise<{ uploadId?: string, key?: string, parts?: { partNumber: number, etag: string }[] }> {
    if (plan.mode === 'form-post') return {}

    if (plan.mode === 'multipart' && plan.multipart) {
      const parts: { partNumber: number, etag: string }[] = []
      for (const part of plan.multipart.parts) {
        const start = (part.partNumber - 1) * plan.multipart.partSize
        const chunk = file.slice(start, Math.min(file.size, start + plan.multipart.partSize))
        const response = await fetch(part.url, { method: 'PUT', body: chunk })
        const etag = response.headers.get('etag')
        if (!response.ok || !etag) throw { code: 'DOCUMENT_UPLOAD_INCOMPLETE' }
        parts.push({ partNumber: part.partNumber, etag })
      }
      return { uploadId: plan.multipart.uploadId, key: plan.multipart.key, parts }
    }

    if (!plan.url) throw { code: 'DOCUMENT_UPLOAD_INCOMPLETE' }
    const response = await fetch(plan.url, {
      method: plan.method ?? 'PUT',
      headers: plan.headers,
      body: file
    })
    if (!response.ok) throw { code: 'DOCUMENT_UPLOAD_INCOMPLETE' }
    return plan.uploadId ? { uploadId: plan.uploadId } : {}
  }

  return {
    get,
    post,
    del,
    uploadWithPlan,
    /**
     * Ephemeral cloud path: one multipart request carries the files, and the
     * finished artifacts come back with their bytes attached. There is no job
     * to poll or download afterwards.
     */
    runInline: (operationId: string, files: File[], config: Record<string, unknown> = {}) => {
      const body = new FormData()
      body.append('operationId', operationId)
      body.append('config', JSON.stringify(config))
      for (const file of files) body.append('files', file)
      return post<DocumentJobView>('/run', body)
    },
    operations: () => get<{
      runtime: string
      capabilities: DocumentRuntimeCapabilities
      operations: (DocumentOperationDefinition & { available: boolean })[]
      formats?: import('#shared/types/document/formats').DocumentFormatDefinition[]
      conversions?: import('#shared/types/document/formats').ConversionEdge[]
    }>('/operations'),
    createJob: (operationId: string, config: Record<string, unknown>, retentionDays?: number, idempotencyKey?: string) =>
      post<DocumentJobView>('/jobs', { operationId, config, retentionDays, idempotencyKey }),
    uploadInputs: (jobId: string, files: File[]) => {
      const body = new FormData()
      for (const file of files) body.append('files', file)
      return post<{ id: string, safeName: string, size: number }[]>(`/jobs/${encodeURIComponent(jobId)}/inputs`, body)
    },
    declareInput: (jobId: string, file: { name: string, size: number, type: string }) =>
      post<{ input: PlannedInput, plan: UploadPlan }>(
        `/jobs/${encodeURIComponent(jobId)}/inputs/intent`,
        { fileName: file.name, size: file.size, mimeType: file.type }
      ),
    completeInput: (jobId: string, inputId: string, body: Record<string, unknown> = {}) =>
      post<PlannedInput>(`/jobs/${encodeURIComponent(jobId)}/inputs/${encodeURIComponent(inputId)}/complete`, body),
    startJob: (jobId: string) => post<DocumentJobView>(`/jobs/${encodeURIComponent(jobId)}/start`),
    cancelJob: (jobId: string) => post<{ cancelled: boolean }>(`/jobs/${encodeURIComponent(jobId)}/cancel`),
    deleteJob: (jobId: string) => del<{ deleted: boolean }>(`/jobs/${encodeURIComponent(jobId)}`),
    job: (jobId: string) => get<DocumentJobView>(`/jobs/${encodeURIComponent(jobId)}`),
    jobs: (query?: Record<string, string>) => get<DocumentJobView[]>('/jobs', query),
    artifacts: (jobId: string) => get<DocumentArtifactView[]>(`/jobs/${encodeURIComponent(jobId)}/artifacts`),
    artifactUrl: (jobId: string, artifactId: string) =>
      post<{ url: string }>(`/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/url`),
    deleteArtifact: (jobId: string, artifactId: string) =>
      del<{ deleted: boolean }>(`/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}`),
    validate: (operationId: string, files: { name: string, size: number }[], config: Record<string, unknown> = {}) =>
      post<{ ok: boolean, issues: { code: string, file?: string }[] }>(
        `/operations/${encodeURIComponent(operationId)}/validate`,
        { files, config }
      ),
    settings: () => get<{
      runtime: string
      defaultOutputPath: string
      delivery: 'folder' | 'download'
      supportsNativeSaveDialog: boolean
      defaultRetentionDays: number
      maxRetentionDays: number
    }>('/settings'),
    health: () => get<{
      runtime: string
      storage: {
        driver: 'local' | 'hub' | 'r2' | 'none'
        persistent: boolean
        requiresSession: boolean
        mode: 'durable' | 'ephemeral'
        ephemeral: boolean
        configured: boolean
      }
      database: { configured: boolean, connected: boolean }
      limits: {
        maxFileBytes: number
        maxTotalInputBytes: number
        maxInputFiles: number
        maxTempBytes: number
        maxInlineDurationMs: number
      }
    }>('/health')
  }
}
