import type { DocumentArtifactRecord, DocumentJobInputRecord, StorageObjectRef } from '#shared/types/document'
import type { DocumentJobRepository, DocumentStorageProvider } from './contracts'

const HOUR = 60 * 60 * 1000

export interface CleanupOptions {
  jobs: DocumentJobRepository
  storage: DocumentStorageProvider
  now?: Date
  /** Rows processed per pass; a janitor runs in small batches by design. */
  batchSize?: number
}

export interface CleanupSummary {
  artifactsExpired: number
  objectsDeleted: number
  inputsExpired: number
  failures: number
}

function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime()
}

/**
 * Retention sweep. It only touches rows the database already marks as inactive,
 * deletes objects by their exact stored key (never by listing the bucket), and
 * treats an already-missing object as a completed cleanup so a retried pass
 * cannot fail forever.
 */
export async function runArtifactCleanup(options: CleanupOptions): Promise<CleanupSummary> {
  const now = options.now ?? new Date()
  const batch = Math.min(Math.max(options.batchSize ?? 50, 1), 200)
  const candidates = await options.jobs.findExpired(now, batch)
  const summary: CleanupSummary = { artifactsExpired: 0, objectsDeleted: 0, inputsExpired: 0, failures: 0 }

  for (const candidate of candidates) {
    const artifacts = await options.jobs.listArtifacts(candidate.jobId, candidate.ownerId)
    const live = artifacts.filter(artifact => artifact.status !== 'deleted' && artifact.status !== 'expired')

    for (const artifact of live) {
      if (!isExpired(artifact.expiresAt, now)) continue
      const deleted = await deleteObject(options.storage, artifact)
      if (!deleted) {
        summary.failures++
        continue
      }
      summary.objectsDeleted++
      await options.jobs.updateArtifact({ ...artifact, status: 'deleted' }).catch(() => {
        summary.failures++
      })
    }

    const inputs = await options.jobs.listInputs(candidate.jobId, candidate.ownerId)
    let removedInputs = 0
    for (const input of inputs) {
      if (!isExpired(input.expiresAt, now)) continue
      const deleted = await deleteInputObject(options.storage, input)
      // An input object that survives this pass is retried next run, which is
      // why the job is not marked expired yet.
      if (!deleted) {
        summary.failures++
        continue
      }
      removedInputs++
    }
    summary.inputsExpired += removedInputs

    if (!summary.failures) {
      await options.jobs.markExpired(candidate.jobId, candidate.ownerId).catch(() => {
        summary.failures++
      })
      summary.artifactsExpired += live.length
    }
  }

  return summary
}

async function deleteObject(storage: DocumentStorageProvider, artifact: DocumentArtifactRecord): Promise<boolean> {
  if (artifact.storageProvider === 'local') return true
  const ref: StorageObjectRef = {
    provider: artifact.storageProvider as StorageObjectRef['provider'],
    key: artifact.storageKey,
    ownerId: artifact.ownerId,
    size: artifact.size,
    mimeType: artifact.mimeType
  }
  try {
    // Deleting a missing key succeeds in S3/R2, so a retried sweep is safe.
    await storage.deleteObject(ref)
    return true
  } catch {
    return false
  }
}

async function deleteInputObject(storage: DocumentStorageProvider, input: DocumentJobInputRecord): Promise<boolean> {
  if (input.storageProvider === 'local') return true
  const ref: StorageObjectRef = {
    provider: input.storageProvider as StorageObjectRef['provider'],
    key: input.storageKey,
    ownerId: input.ownerId,
    size: input.size,
    mimeType: input.mimeType
  }
  try {
    await storage.deleteObject(ref)
    return true
  } catch {
    return false
  }
}

/**
 * Removes abandoned uploads: an input that never reached `verified` and whose
 * job already passed its upload window. Incomplete multipart uploads are aborted
 * by the provider's lifecycle rule, so this only clears the row and object.
 */
export async function cleanupAbandonedInputs(
  jobs: DocumentJobRepository,
  storage: DocumentStorageProvider,
  now = new Date()
): Promise<{ removed: number, failures: number }> {
  const candidates = await jobs.findExpired(new Date(now.getTime() - 24 * HOUR), 100)
  let removed = 0
  let failures = 0

  for (const candidate of candidates) {
    const inputs = await jobs.listInputs(candidate.jobId, candidate.ownerId)
    for (const input of inputs) {
      // A verified input is owned by the job's own cleanup; `expired` already
      // means the object was reclaimed on an earlier sweep.
      if (input.status === 'verified' || input.status === 'expired') continue
      const deleted = await deleteInputObject(storage, input)
      if (deleted) removed++
      else failures++
    }
  }

  return { removed, failures }
}
