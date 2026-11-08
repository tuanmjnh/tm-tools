import { createWriteStream, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import type {
  DocumentArtifactRecord,
  DocumentArtifactView,
  DocumentJobInputRecord,
  DocumentJobRecord,
  DocumentJobView,
  DocumentOperationDefinition,
  DocumentSettings,
  DocumentRuntimeKind,
  StorageObjectRef
} from '#shared/types/document'
import type {
  DocumentJobRepository,
  DocumentStorageProvider,
  OutputDeliveryAdapter,
  TemporaryWorkspace,
  VerifiedInput
} from './contracts'
import { executorFor, hasExecutor } from './executors'
import { DocumentError, requireOperation } from './operations'
import { exceedsScratchBudget } from './runtime'
import { safeFileName, safeRelativePath } from '../pdf/security'

export interface DocumentRunDeps {
  jobs: DocumentJobRepository
  temp: TemporaryWorkspace
  storage: DocumentStorageProvider
  delivery: OutputDeliveryAdapter
}

export const MAX_RETENTION_DAYS = 90

export function defaultSettings(): DocumentSettings {
  return { rememberOutputDestination: true, askBeforeOverwrite: true, defaultRetentionDays: 7 }
}

export function retentionExpiry(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

export interface CreateDraftJobArgs {
  ownerId: string
  operationId: string
  runtime: DocumentRuntimeKind
  config: Record<string, unknown>
  retentionDays?: number
  idempotencyKey?: string
}

/** Creates the draft job the client then uploads inputs into. */
export async function createDraftJob(
  deps: DocumentRunDeps,
  args: CreateDraftJobArgs
): Promise<DocumentJobRecord> {
  const operation = requireOperation(args.operationId)
  if (!hasExecutor(operation.id)) {
    throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { operationId: operation.id })
  }

  const job = await deps.jobs.createJob({
    ownerId: args.ownerId,
    operationId: operation.id,
    operationVersion: operation.version,
    runtime: args.runtime,
    configSnapshot: args.config,
    expiresAt: retentionExpiry(args.retentionDays ?? defaultSettings().defaultRetentionDays),
    idempotencyKey: args.idempotencyKey
  })

  // Local keeps the workspace beside the manifest. A cloud draft has no
  // persistent filesystem, so its scratch directory is created by the
  // invocation that actually runs the job.
  if (deps.storage.kind === 'local') await deps.temp.create(job.id)
  return job
}

/**
 * Local inputs are already on disk in the job input directory; a cloud input
 * lives in the bucket and is streamed into scratch here, once, before the
 * engine sees it.
 */
async function materializeInput(
  deps: DocumentRunDeps,
  input: DocumentJobInputRecord,
  inputDir: string
): Promise<VerifiedInput> {
  const target = join(inputDir, input.id, input.safeName)

  if (input.storageProvider === 'local') {
    return {
      inputId: input.id,
      originalName: input.originalName,
      safeName: input.safeName,
      mimeType: input.mimeType,
      extension: input.extension,
      size: input.size,
      stagedPath: target,
      checksum: input.checksum
    }
  }

  const ref: StorageObjectRef = {
    provider: input.storageProvider as StorageObjectRef['provider'],
    key: input.storageKey,
    ownerId: input.ownerId,
    size: input.size,
    mimeType: input.mimeType,
    checksum: input.checksum
  }
  mkdirSync(dirname(target), { recursive: true })
  await pipeline(await deps.storage.createReadStream(ref), createWriteStream(target))

  return {
    inputId: input.id,
    originalName: input.originalName,
    safeName: input.safeName,
    mimeType: input.mimeType,
    extension: input.extension,
    size: statSync(target).size,
    stagedPath: target,
    checksum: input.checksum
  }
}

/**
 * Runs the job through the state machine: validate the staged inputs, execute
 * the engine adapter, validate the produced files, publish artifacts, then drop
 * input/working bytes in a `finally`. Publishing output to the user's folder is
 * the delivery adapter's decision, not the runner's.
 */
export async function startDocumentJob(
  deps: DocumentRunDeps,
  jobId: string,
  ownerId: string
): Promise<DocumentJobView> {
  const job = await deps.jobs.getJob(jobId, ownerId)
  if (!job) throw new DocumentError('DOCUMENT_JOB_NOT_FOUND')

  const inputs = await deps.jobs.listInputs(jobId, ownerId)
  if (!inputs.length) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')

  const operation = requireOperation(job.operationId)
  if (inputs.some(input => input.storageProvider !== 'local' && input.status !== 'verified')) {
    throw new DocumentError('DOCUMENT_INPUT_NOT_READY')
  }

  // Refuse before touching storage: a job that cannot fit the scratch budget
  // must be routed to a worker instead of failing halfway through.
  const totalInputBytes = inputs.reduce((total, input) => total + input.size, 0)
  if (exceedsScratchBudget(operation.id, totalInputBytes, job.runtime)) {
    throw new DocumentError('DOCUMENT_WORKER_REQUIRED', {
      operationId: operation.id,
      totalInputBytes
    })
  }

  const workspace = await deps.temp.create(jobId)

  try {
    await deps.jobs.updateStatus(jobId, { to: 'queued' })
    await deps.jobs.updateStatus(jobId, { to: 'running' })

    await deps.temp.ensureCapacity(jobId, totalInputBytes * 2)

    const verified: VerifiedInput[] = []
    for (const input of inputs) {
      verified.push(await materializeInput(deps, input, workspace.inputDir))
    }

    const executor = executorFor(operation.id)
    const validation = await executor.validateInputs(verified, job.configSnapshot as never)
    if (!validation.ok) {
      const issue = validation.issues[0]
      throw new DocumentError((issue?.code as DocumentError['code']) ?? 'DOCUMENT_INPUT_REQUIRED', issue?.details)
    }

    const execution = await executor.execute({
      jobId,
      ownerId,
      runtime: job.runtime,
      workspace,
      inputs: verified,
      signal: new AbortController().signal,
      onProgress: progress => deps.jobs.updateProgress(jobId, {
        totalUnits: 0,
        completedUnits: 0,
        failedUnits: 0,
        ...progress
      })
    }, job.configSnapshot as never)

    await deps.jobs.updateStatus(jobId, { to: 'publishing' })
    const customOutputDir = typeof (job.configSnapshot as { outputDir?: unknown })?.outputDir === 'string'
      ? (job.configSnapshot as { outputDir: string }).outputDir.trim()
      : undefined
    const artifacts = await publishArtifacts(deps, job, operation, execution.files, customOutputDir)

    const partial = (execution.failedUnits ?? 0) > 0
    await deps.jobs.updateStatus(jobId, {
      to: partial ? 'partial' : 'completed',
      errorCode: execution.errorCode,
      errorMessageSafe: partial ? 'Some outputs could not be produced' : undefined
    })

    const finished = await deps.jobs.getJob(jobId, ownerId)
    return toView(finished ?? job, artifacts)
  } catch (error) {
    const normalized = error instanceof DocumentError
      ? error
      : new DocumentError('DOCUMENT_STORAGE_UNAVAILABLE', { cause: (error as Error)?.message })

    try {
      await deps.jobs.updateStatus(jobId, {
        to: 'failed',
        errorCode: normalized.code,
        errorMessageSafe: normalized.code
      })
    } catch {
      // Already terminal; the caller still gets the original error.
    }
    throw normalized
  } finally {
    // Output stays until retention expires because downloads still read it.
    await deps.temp.releaseStaging(jobId).catch(() => undefined)
  }
}

async function publishArtifacts(
  deps: DocumentRunDeps,
  job: DocumentJobRecord,
  operation: DocumentOperationDefinition,
  files: { fileName: string, mimeType: string, path: string, size: number }[],
  customOutputDir?: string
): Promise<DocumentArtifactRecord[]> {
  const artifacts: DocumentArtifactRecord[] = []

  for (const file of files) {
    const stats = statSync(file.path)
    if (stats.size === 0) continue
    const fileName = safeRelativePath(file.fileName) || safeFileName(file.fileName)

    const artifact: DocumentArtifactRecord = {
      id: randomUUID(),
      jobId: job.id,
      ownerId: job.ownerId,
      fileName,
      mimeType: file.mimeType,
      size: stats.size,
      storageProvider: deps.storage.kind,
      storageKey: `job/${job.id}/output/${fileName}`,
      status: 'ready',
      downloadCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: job.expiresAt
    }

    const published = await deps.delivery.publish(artifact, file.path, customOutputDir)
    const stored: DocumentArtifactRecord = {
      ...artifact,
      storageProvider: published.storageProvider,
      storageKey: published.storageKey,
      size: published.size || artifact.size,
      checksum: published.checksum,
      localPath: published.localPath
    }
    await deps.jobs.addArtifact(stored)
    artifacts.push(stored)
  }

  if (!artifacts.length) throw new DocumentError('DOCUMENT_OUTPUT_NOT_READY', { operationId: operation.id })
  return artifacts
}

export function toView(job: DocumentJobRecord, artifacts: DocumentArtifactRecord[]): DocumentJobView {
  const { configSnapshot: _snapshot, idempotencyKey: _key, ...rest } = job
  return { ...rest, artifacts: artifacts.map(toArtifactView) }
}

export function toArtifactView(artifact: DocumentArtifactRecord): DocumentArtifactView {
  return {
    id: artifact.id,
    jobId: artifact.jobId,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    size: artifact.size,
    status: artifact.status,
    expiresAt: artifact.expiresAt,
    downloadPath: `/api/v1/documents/jobs/${encodeURIComponent(artifact.jobId)}/artifacts/${encodeURIComponent(artifact.id)}/download`,
    localPath: artifact.localPath
  }
}

/**
 * Ephemeral runtime: the response is the only chance to hand the bytes over,
 * so each artifact carries its base64 body. The cap keeps the whole response
 * inside a Function's payload limit.
 */
export function attachInlineBytes(view: DocumentJobView, bodies: Map<string, string>): DocumentJobView {
  let total = 0
  const artifacts = view.artifacts.map((artifact) => {
    const body = bodies.get(artifact.id) ?? ''
    total += Buffer.byteLength(body, 'utf8')
    return { ...artifact, inlineBase64: body }
  })
  if (total > EPHEMERAL_RESPONSE_MAX_BYTES) {
    throw new DocumentError('DOCUMENT_OUTPUT_TOO_LARGE', { inlineBytes: total, limit: EPHEMERAL_RESPONSE_MAX_BYTES })
  }
  return { ...view, artifacts }
}

/** Base64 of the raw payload; ~4/3 inflation is already accounted for. */
const EPHEMERAL_RESPONSE_MAX_BYTES = 4 * 1024 * 1024

export async function jobView(
  deps: DocumentRunDeps,
  jobId: string,
  ownerId: string
): Promise<DocumentJobView | null> {
  const job = await deps.jobs.getJob(jobId, ownerId)
  if (!job) return null
  const artifacts = await deps.jobs.listArtifacts(jobId, ownerId)
  return toView(job, artifacts)
}
