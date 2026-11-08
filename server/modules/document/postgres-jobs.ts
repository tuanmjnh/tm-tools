import { randomUUID } from 'node:crypto'
import type {
  DocumentArtifactRecord,
  DocumentArtifactStatus,
  DocumentCleanupState,
  DocumentInputStatus,
  DocumentJobInputRecord,
  DocumentJobProgress,
  DocumentJobRecord,
  DocumentJobStatus,
  DocumentOperationId,
  DocumentRuntimeKind
} from '#shared/types/document'
import { DOCUMENT_JOB_TRANSITIONS } from '#shared/types/document'
import type {
  CreateDocumentJobInput,
  DocumentJobRepository,
  ExpiredJobCandidate,
  JobListQuery,
  JobTransition
} from './contracts'
import { DocumentError } from './operations'
import type { DocumentSql } from './postgres-client'

interface JobRow {
  id: string
  owner_id: string
  operation_id: string
  operation_version: string
  runtime: string
  status: string
  config_json: Record<string, unknown>
  progress_total: number
  progress_completed: number
  progress_failed: number
  progress_label: string | null
  input_count: number
  total_input_bytes: string | number
  output_count: number
  cleanup_status: string
  error_code: string | null
  error_message_safe: string | null
  created_at: Date | string
  started_at: Date | string | null
  finished_at: Date | string | null
  expires_at: Date | string
}

interface InputRow {
  id: string
  job_id: string
  owner_id: string
  original_name: string
  safe_name: string
  mime_type: string
  extension: string
  size_bytes: string | number
  sha256: string | null
  storage_provider: string
  storage_key: string
  upload_status: string
  created_at: Date | string
  expires_at: Date | string
}

interface ArtifactRow {
  id: string
  job_id: string
  owner_id: string
  file_name: string
  mime_type: string
  size_bytes: string | number
  sha256: string | null
  storage_provider: string
  storage_key: string
  artifact_status: string
  download_count: number
  first_downloaded_at: Date | string | null
  last_downloaded_at: Date | string | null
  created_at: Date | string
  expires_at: Date | string
}

function iso(value: Date | string | null): string | undefined {
  if (!value) return undefined
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toJob(row: JobRow): DocumentJobRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    operationId: row.operation_id as DocumentOperationId,
    operationVersion: row.operation_version,
    status: row.status as DocumentJobStatus,
    runtime: row.runtime as DocumentRuntimeKind,
    configSnapshot: row.config_json ?? {},
    inputCount: Number(row.input_count),
    totalInputBytes: Number(row.total_input_bytes),
    outputCount: Number(row.output_count),
    progress: {
      totalUnits: row.progress_total,
      completedUnits: row.progress_completed,
      failedUnits: row.progress_failed,
      currentLabel: row.progress_label ?? undefined
    },
    errorCode: (row.error_code ?? undefined) as DocumentJobRecord['errorCode'],
    errorMessageSafe: row.error_message_safe ?? undefined,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
    expiresAt: iso(row.expires_at) ?? new Date().toISOString(),
    cleanupStatus: row.cleanup_status as DocumentCleanupState
  }
}

function toInput(row: InputRow): DocumentJobInputRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    ownerId: row.owner_id,
    originalName: row.original_name,
    safeName: row.safe_name,
    mimeType: row.mime_type,
    extension: row.extension,
    size: Number(row.size_bytes),
    checksum: row.sha256 ?? undefined,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    status: row.upload_status as DocumentInputStatus,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    expiresAt: iso(row.expires_at) ?? new Date().toISOString()
  }
}

function toArtifact(row: ArtifactRow): DocumentArtifactRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    ownerId: row.owner_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: Number(row.size_bytes),
    checksum: row.sha256 ?? undefined,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    status: row.artifact_status as DocumentArtifactStatus,
    downloadCount: row.download_count,
    firstDownloadedAt: iso(row.first_downloaded_at),
    lastDownloadedAt: iso(row.last_downloaded_at),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    expiresAt: iso(row.expires_at) ?? new Date().toISOString()
  }
}

function terminal(status: DocumentJobStatus): boolean {
  return status === 'completed' || status === 'partial' || status === 'failed' || status === 'cancelled'
}

function active(status: DocumentJobStatus): boolean {
  return status === 'uploading' || status === 'queued' || status === 'running' || status === 'publishing' || status === 'cancel_requested'
}

/**
 * Durable job store for the cloud runtime. Every read is scoped by `ownerId`
 * from the session, and claims use a conditional UPDATE so two workers cannot
 * both take the same job.
 */
export class PostgresJobRepository implements DocumentJobRepository {
  constructor(private readonly sql: DocumentSql) {}

  async createJob(input: CreateDocumentJobInput): Promise<DocumentJobRecord> {
    const now = new Date()
    const [row] = input.idempotencyKey
      ? await this.sql<JobRow[]>`
          INSERT INTO document_jobs (
            id, owner_id, operation_id, operation_version, runtime, status,
            idempotency_key, config_json, created_at, updated_at, expires_at
          ) VALUES (
            ${randomUUID()}, ${input.ownerId}, ${input.operationId}, ${input.operationVersion},
            ${input.runtime}, 'created', ${input.idempotencyKey},
            ${this.sql.json(input.configSnapshot as never)},
            ${now}, ${now}, ${new Date(input.expiresAt)}
          )
          ON CONFLICT (owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL
          DO NOTHING
          RETURNING *
        `
      : await this.sql<JobRow[]>`
          INSERT INTO document_jobs (
            id, owner_id, operation_id, operation_version, runtime, status,
            config_json, created_at, updated_at, expires_at
          ) VALUES (
            ${randomUUID()}, ${input.ownerId}, ${input.operationId}, ${input.operationVersion},
            ${input.runtime}, 'created', ${this.sql.json(input.configSnapshot as never)},
            ${now}, ${now}, ${new Date(input.expiresAt)}
          )
          RETURNING *
        `
    if (row) return toJob(row)

    // A concurrent request already owns this key: return that job, scoped by
    // owner so a guessed key can never surface someone else's job.
    const [existing] = await this.sql<JobRow[]>`
      SELECT * FROM document_jobs
      WHERE owner_id = ${input.ownerId} AND idempotency_key = ${input.idempotencyKey!}
      LIMIT 1
    `
    if (!existing) {
      throw new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { reason: 'insert-returned-nothing' })
    }
    return toJob(existing)
  }

  async getJob(jobId: string, ownerId: string): Promise<DocumentJobRecord | null> {
    const [row] = await this.sql<JobRow[]>`
      SELECT * FROM document_jobs WHERE id = ${jobId} AND owner_id = ${ownerId} LIMIT 1
    `
    return row ? toJob(row) : null
  }

  async updateStatus(jobId: string, transition: JobTransition): Promise<void> {
    const [current] = await this.sql<{ status: string }[]>`
      SELECT status FROM document_jobs WHERE id = ${jobId} LIMIT 1
    `
    if (!current) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    const from = current.status as DocumentJobStatus
    if (!DOCUMENT_JOB_TRANSITIONS[from].includes(transition.to)) {
      throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { from, to: transition.to })
    }

    const at = transition.at ? new Date(transition.at) : new Date()
    const updated = await this.sql`
      UPDATE document_jobs SET
        status = ${transition.to},
        started_at = CASE WHEN ${transition.to} = 'running' THEN COALESCE(started_at, ${at}) ELSE started_at END,
        finished_at = CASE WHEN ${terminal(transition.to)} THEN ${at} ELSE finished_at END,
        error_code = COALESCE(${transition.errorCode ?? null}, error_code),
        error_message_safe = COALESCE(${transition.errorMessageSafe ?? null}, error_message_safe),
        updated_at = ${at}
      WHERE id = ${jobId} AND status = ${from}
    `
    if (updated.count === 0) throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { from, to: transition.to })
  }

  async updateProgress(jobId: string, progress: DocumentJobProgress): Promise<void> {
    const updated = await this.sql`
      UPDATE document_jobs SET
        progress_total = COALESCE(${progress.totalUnits ?? null}, progress_total),
        progress_completed = COALESCE(${progress.completedUnits ?? null}, progress_completed),
        progress_failed = COALESCE(${progress.failedUnits ?? null}, progress_failed),
        progress_label = COALESCE(${progress.currentLabel ?? null}, progress_label),
        updated_at = now()
      WHERE id = ${jobId}
    `
    if (updated.count === 0) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  }

  async addInput(input: DocumentJobInputRecord): Promise<void> {
    await this.sql.begin(async (tx) => {
      const [job] = await tx<{ id: string }[]>`
        SELECT id FROM document_jobs WHERE id = ${input.jobId} LIMIT 1
      `
      if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

      await tx`
        INSERT INTO document_job_inputs (
          id, job_id, owner_id, original_name, safe_name, mime_type, extension,
          size_bytes, sha256, storage_provider, storage_key, upload_status, created_at, expires_at
        ) VALUES (
          ${input.id}, ${input.jobId}, ${input.ownerId}, ${input.originalName}, ${input.safeName},
          ${input.mimeType}, ${input.extension}, ${input.size}, ${input.checksum ?? null},
          ${input.storageProvider}, ${input.storageKey}, ${input.status},
          ${new Date(input.createdAt)}, ${new Date(input.expiresAt)}
        )
        ON CONFLICT (id) DO UPDATE SET
          upload_status = EXCLUDED.upload_status,
          sha256 = COALESCE(EXCLUDED.sha256, document_job_inputs.sha256)
      `

      await tx`
        UPDATE document_jobs SET
          input_count = (SELECT COUNT(*) FROM document_job_inputs WHERE job_id = ${input.jobId}),
          total_input_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM document_job_inputs WHERE job_id = ${input.jobId}),
          updated_at = now()
        WHERE id = ${input.jobId}
      `
    })
  }

  async listInputs(jobId: string, ownerId: string): Promise<DocumentJobInputRecord[]> {
    const rows = await this.sql<InputRow[]>`
      SELECT * FROM document_job_inputs
      WHERE job_id = ${jobId} AND owner_id = ${ownerId}
      ORDER BY created_at
    `
    return rows.map(toInput)
  }

  async addArtifact(artifact: DocumentArtifactRecord): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO document_artifacts (
          id, job_id, owner_id, file_name, mime_type, size_bytes, sha256,
          storage_provider, storage_key, artifact_status, created_at, expires_at
        ) VALUES (
          ${artifact.id}, ${artifact.jobId}, ${artifact.ownerId}, ${artifact.fileName},
          ${artifact.mimeType}, ${artifact.size}, ${artifact.checksum ?? null},
          ${artifact.storageProvider}, ${artifact.storageKey}, ${artifact.status},
          ${new Date(artifact.createdAt)}, ${new Date(artifact.expiresAt)}
        )
        ON CONFLICT (id) DO NOTHING
      `
      await tx`
        UPDATE document_jobs SET
          output_count = (SELECT COUNT(*) FROM document_artifacts WHERE job_id = ${artifact.jobId}),
          updated_at = now()
        WHERE id = ${artifact.jobId}
      `
    })
  }

  async listArtifacts(jobId: string, ownerId: string): Promise<DocumentArtifactRecord[]> {
    const rows = await this.sql<ArtifactRow[]>`
      SELECT * FROM document_artifacts
      WHERE job_id = ${jobId} AND owner_id = ${ownerId}
      ORDER BY created_at
    `
    return rows.map(toArtifact)
  }

  async getArtifact(artifactId: string, ownerId: string): Promise<DocumentArtifactRecord | null> {
    const [row] = await this.sql<ArtifactRow[]>`
      SELECT * FROM document_artifacts
      WHERE id = ${artifactId} AND owner_id = ${ownerId}
      LIMIT 1
    `
    return row ? toArtifact(row) : null
  }

  async updateArtifact(artifact: DocumentArtifactRecord): Promise<void> {
    const updated = await this.sql`
      UPDATE document_artifacts SET
        artifact_status = ${artifact.status},
        download_count = ${artifact.downloadCount},
        first_downloaded_at = ${artifact.firstDownloadedAt ? new Date(artifact.firstDownloadedAt) : null},
        last_downloaded_at = ${artifact.lastDownloadedAt ? new Date(artifact.lastDownloadedAt) : null}
      WHERE id = ${artifact.id} AND owner_id = ${artifact.ownerId}
    `
    if (updated.count === 0) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
  }

  async listJobs(query: JobListQuery): Promise<DocumentJobRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const statuses = query.status?.length ? query.status : null
    const operationId = query.operationId ?? null
    const cursor = query.cursor ? new Date(query.cursor) : null

    const rows = await this.sql<JobRow[]>`
      SELECT * FROM document_jobs
      WHERE owner_id = ${query.ownerId}
        AND (${statuses}::text[] IS NULL OR status = ANY(${statuses}::text[]))
        AND (${operationId}::text IS NULL OR operation_id = ${operationId}::text)
        AND (${cursor}::timestamptz IS NULL OR created_at < ${cursor}::timestamptz)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    return rows.map(toJob)
  }

  async findExpired(before: Date, limit: number): Promise<ExpiredJobCandidate[]> {
    const rows = await this.sql<{ id: string, owner_id: string, expires_at: Date | string }[]>`
      SELECT id, owner_id, expires_at FROM document_jobs
      WHERE status NOT IN ('uploading', 'queued', 'running', 'publishing', 'cancel_requested')
        AND expires_at <= ${before}
      ORDER BY expires_at
      LIMIT ${limit}
    `
    return rows.map(row => ({
      jobId: row.id,
      ownerId: row.owner_id,
      expiresAt: iso(row.expires_at) ?? before.toISOString()
    }))
  }

  async deleteJob(jobId: string, ownerId: string): Promise<void> {
    const [row] = await this.sql<{ status: string }[]>`
      SELECT status FROM document_jobs WHERE id = ${jobId} AND owner_id = ${ownerId} LIMIT 1
    `
    if (!row) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (active(row.status as DocumentJobStatus)) throw new DocumentError('DOCUMENT_JOB_ALREADY_RUNNING')
    await this.sql`DELETE FROM document_jobs WHERE id = ${jobId} AND owner_id = ${ownerId}`
  }

  async markExpired(jobId: string, ownerId: string): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE document_jobs SET
          status = 'expired', cleanup_status = 'completed', finished_at = now(), updated_at = now()
        WHERE id = ${jobId} AND owner_id = ${ownerId}
      `
      await tx`
        UPDATE document_artifacts SET artifact_status = 'expired'
        WHERE job_id = ${jobId} AND owner_id = ${ownerId}
      `
    })
  }

  /**
   * Conditional claim used by a bounded worker: only a queued job with no live
   * lease can be taken, and the row that comes back is the one this caller owns.
   */
  async claimJob(jobId: string, leaseOwner: string, leaseSeconds = 120): Promise<DocumentJobRecord | null> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000)
    const [row] = await this.sql<JobRow[]>`
      UPDATE document_jobs SET
        status = 'running',
        lease_owner = ${leaseOwner},
        lease_expires_at = ${leaseUntil},
        attempt = attempt + 1,
        started_at = COALESCE(started_at, ${now}),
        updated_at = ${now}
      WHERE id = ${jobId}
        AND status IN ('queued', 'created')
        AND (lease_expires_at IS NULL OR lease_expires_at < ${now})
      RETURNING *
    `
    return row ? toJob(row) : null
  }

  async heartbeat(jobId: string, leaseOwner: string, leaseSeconds = 120): Promise<boolean> {
    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000)
    const updated = await this.sql`
      UPDATE document_jobs SET lease_expires_at = ${leaseUntil}, updated_at = now()
      WHERE id = ${jobId} AND lease_owner = ${leaseOwner}
    `
    return updated.count > 0
  }

  async releaseLease(jobId: string, leaseOwner: string): Promise<void> {
    await this.sql`
      UPDATE document_jobs SET lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE id = ${jobId} AND lease_owner = ${leaseOwner}
    `
  }
}
