import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  DocumentArtifactRecord,
  DocumentJobInputRecord,
  DocumentJobProgress,
  DocumentJobRecord,
  DocumentJobStatus
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
import { writeFileAtomic, ensureDir } from '../pdf/paths'
import { assertInsideJobs, documentDirs, ensureDocumentDirs, jobManifestPath, jobRoot } from './paths'
import { assertJobId } from './temporary'

interface JobManifest {
  job: DocumentJobRecord
  inputs: DocumentJobInputRecord[]
  artifacts: DocumentArtifactRecord[]
}

function manifestPath(jobId: string): string {
  return assertInsideJobs(jobId, jobManifestPath(jobId))
}

function readManifest(jobId: string): JobManifest | null {
  const path = manifestPath(jobId)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as JobManifest
    if (!parsed?.job?.id) return null
    return {
      job: parsed.job,
      inputs: Array.isArray(parsed.inputs) ? parsed.inputs : [],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : []
    }
  } catch {
    return null
  }
}

function writeManifest(jobId: string, manifest: JobManifest): void {
  ensureDocumentDirs()
  const path = manifestPath(jobId)
  // The manifest is the job's first object; the temp workspace may not exist yet.
  ensureDir(dirname(path))
  writeFileAtomic(path, JSON.stringify(manifest, null, 2), 'utf8')
}

/**
 * Durable job state for local/Electron: one JSON manifest per job under
 * `.system/jobs/<jobId>/`, rewritten atomically. A cloud deployment swaps in a
 * database adapter behind the same interface.
 */
export class LocalJobRepository implements DocumentJobRepository {
  async createJob(input: CreateDocumentJobInput): Promise<DocumentJobRecord> {
    if (input.idempotencyKey) {
      const existing = this.findByIdempotencyKey(input.ownerId, input.idempotencyKey)
      if (existing) return existing
    }

    const job: DocumentJobRecord = {
      id: randomUUID(),
      ownerId: input.ownerId,
      tenantId: input.tenantId,
      operationId: input.operationId,
      operationVersion: input.operationVersion,
      status: 'created',
      runtime: input.runtime,
      configSnapshot: input.configSnapshot,
      idempotencyKey: input.idempotencyKey,
      inputCount: 0,
      totalInputBytes: 0,
      outputCount: 0,
      progress: { totalUnits: 0, completedUnits: 0, failedUnits: 0 },
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      cleanupStatus: 'pending'
    }
    writeManifest(job.id, { job, inputs: [], artifacts: [] })
    return job
  }

  async getJob(jobId: string, ownerId: string): Promise<DocumentJobRecord | null> {
    const manifest = this.readOwned(jobId, ownerId)
    return manifest?.job ?? null
  }

  async updateStatus(jobId: string, transition: JobTransition): Promise<void> {
    const manifest = this.readAny(jobId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    const from = manifest.job.status
    if (!DOCUMENT_JOB_TRANSITIONS[from].includes(transition.to)) {
      throw new DocumentError('DOCUMENT_JOB_STATE_INVALID', { from, to: transition.to })
    }

    const at = transition.at ?? new Date().toISOString()
    manifest.job.status = transition.to
    if (transition.to === 'running' && !manifest.job.startedAt) manifest.job.startedAt = at
    if (isTerminal(transition.to)) manifest.job.finishedAt = at
    if (transition.errorCode) manifest.job.errorCode = transition.errorCode as DocumentJobRecord['errorCode']
    if (transition.errorMessageSafe) manifest.job.errorMessageSafe = transition.errorMessageSafe
    writeManifest(jobId, manifest)
  }

  async updateProgress(jobId: string, progress: DocumentJobProgress): Promise<void> {
    const manifest = this.readAny(jobId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    manifest.job.progress = { ...manifest.job.progress, ...progress }
    writeManifest(jobId, manifest)
  }

  async addInput(input: DocumentJobInputRecord): Promise<void> {
    const manifest = this.readAny(input.jobId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    manifest.inputs = [...manifest.inputs.filter(entry => entry.id !== input.id), input]
    manifest.job.inputCount = manifest.inputs.length
    manifest.job.totalInputBytes = manifest.inputs.reduce((total, entry) => total + entry.size, 0)
    writeManifest(input.jobId, manifest)
  }

  async listInputs(jobId: string, ownerId: string): Promise<DocumentJobInputRecord[]> {
    return this.readOwned(jobId, ownerId)?.inputs ?? []
  }

  async addArtifact(artifact: DocumentArtifactRecord): Promise<void> {
    const manifest = this.readAny(artifact.jobId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    manifest.artifacts = [...manifest.artifacts.filter(entry => entry.id !== artifact.id), artifact]
    manifest.job.outputCount = manifest.artifacts.length
    writeManifest(artifact.jobId, manifest)
  }

  async listArtifacts(jobId: string, ownerId: string): Promise<DocumentArtifactRecord[]> {
    return this.readOwned(jobId, ownerId)?.artifacts ?? []
  }

  async getArtifact(artifactId: string, ownerId: string): Promise<DocumentArtifactRecord | null> {
    for (const jobId of this.allJobIds()) {
      const manifest = this.readOwned(jobId, ownerId)
      const found = manifest?.artifacts.find(entry => entry.id === artifactId)
      if (found) return found
    }
    return null
  }

  async updateArtifact(artifact: DocumentArtifactRecord): Promise<void> {
    const manifest = this.readAny(artifact.jobId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    manifest.artifacts = manifest.artifacts.map(entry => entry.id === artifact.id ? artifact : entry)
    writeManifest(artifact.jobId, manifest)
  }

  async listJobs(query: JobListQuery): Promise<DocumentJobRecord[]> {
    const jobs = this.allJobIds()
      .map(jobId => this.readOwned(jobId, query.ownerId)?.job)
      .filter((job): job is DocumentJobRecord => Boolean(job))
      .filter(job => !query.status?.length || query.status.includes(job.status))
      .filter(job => !query.operationId || job.operationId === query.operationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return query.limit ? jobs.slice(0, query.limit) : jobs
  }

  async findExpired(before: Date, limit: number): Promise<ExpiredJobCandidate[]> {
    const cutoff = before.getTime()
    return this.allJobIds()
      .map(jobId => this.readAny(jobId)?.job)
      .filter((job): job is DocumentJobRecord => Boolean(job))
      .filter(job => !isActive(job.status) && new Date(job.expiresAt).getTime() <= cutoff)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
      .slice(0, limit)
      .map(job => ({ jobId: job.id, ownerId: job.ownerId, expiresAt: job.expiresAt }))
  }

  async deleteJob(jobId: string, ownerId: string): Promise<void> {
    const manifest = this.readOwned(jobId, ownerId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    if (isActive(manifest.job.status)) throw new DocumentError('DOCUMENT_JOB_ALREADY_RUNNING')
    // The caller removes the directory right after; rewriting a manifest here
    // would resurrect the file the cleanup is about to delete.
  }

  async markExpired(jobId: string, ownerId: string): Promise<void> {
    const manifest = this.readOwned(jobId, ownerId)
    if (!manifest) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')
    manifest.job.status = 'expired'
    manifest.job.cleanupStatus = 'completed'
    manifest.job.finishedAt = new Date().toISOString()
    manifest.artifacts = manifest.artifacts.map(artifact => ({ ...artifact, status: 'expired' }))
    writeManifest(jobId, manifest)
  }

  private allJobIds(): string[] {
    if (!existsSync(documentDirs.jobs)) return []
    return readdirSync(documentDirs.jobs, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter((name) => {
        try {
          assertJobId(name)
          return true
        } catch {
          return false
        }
      })
  }

  private readAny(jobId: string): JobManifest | null {
    assertJobId(jobId)
    return readManifest(jobId)
  }

  /** Local has no unique index, so the scan is bounded by the job count. */
  private findByIdempotencyKey(ownerId: string, key: string): DocumentJobRecord | null {
    for (const jobId of this.allJobIds()) {
      const job = this.readOwned(jobId, ownerId)?.job
      if (job?.idempotencyKey === key) return job
    }
    return null
  }

  /** Ownership is checked on every read; a mismatch is reported as "not found". */
  private readOwned(jobId: string, ownerId: string): JobManifest | null {
    const manifest = this.readAny(jobId)
    if (!manifest) return null
    return manifest.job.ownerId === ownerId ? manifest : null
  }
}

function isTerminal(status: DocumentJobStatus): boolean {
  return status === 'completed' || status === 'partial' || status === 'failed' || status === 'cancelled'
}

function isActive(status: DocumentJobStatus): boolean {
  return status === 'uploading' || status === 'queued' || status === 'running' || status === 'publishing' || status === 'cancel_requested'
}

export function jobDirectory(jobId: string): string {
  return jobRoot(jobId)
}

export function jobManifestFile(jobId: string): string {
  return join(jobRoot(jobId), 'manifest.json')
}

export const localJobRepository = new LocalJobRepository()
