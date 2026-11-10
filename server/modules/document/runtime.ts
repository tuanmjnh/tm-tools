import type {
  DocumentOperationId,
  DocumentRuntimeCapabilities,
  DocumentRuntimeKind
} from '#shared/types/document'
import { DOCUMENT_OPERATION_IDS } from '#shared/types/document'
import { config } from '#server/config'

/**
 * Runtime detection and resource policy.
 *
 * Electron imports the Nitro output into its main process, so `process.versions`
 * still reports Electron there; that is the only reliable signal and it is also
 * the one that matters, because `process.cwd()` is the install directory in that
 * runtime.
 */
export function detectRuntime(): DocumentRuntimeKind {
  const override = String(process.env.DOCUMENT_RUNTIME ?? '').trim()
  if (override === 'local' || override === 'electron' || override === 'vercel' || override === 'worker') {
    return override
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return 'vercel'
  if (process.versions.electron || process.env.TOOLS_DATA_DIR) return 'electron'
  return 'local'
}

const MB = 1024 * 1024

interface RuntimePolicy {
  maxFileBytes: number
  maxTotalInputBytes: number
  maxInputFiles: number
  maxTempBytes: number
  maxOutputBytes: number
  maxInlineDurationMs: number
  allowAsyncJobs: boolean
  allowExternalWorker: boolean
}

/**
 * Cloud limits follow the platform constraints recorded in the audit: a 4.5 MB
 * function payload and a 500 MB scratch disk. Local values are deliberately
 * conservative rather than unlimited, so a runaway raster job cannot fill the
 * host disk.
 */
const POLICIES: Record<DocumentRuntimeKind, RuntimePolicy> = {
  local: {
    maxFileBytes: 200 * MB,
    maxTotalInputBytes: 500 * MB,
    maxInputFiles: 50,
    maxTempBytes: 2 * 1024 * MB,
    maxOutputBytes: 1024 * MB,
    maxInlineDurationMs: 15 * 60 * 1000,
    allowAsyncJobs: true,
    allowExternalWorker: false
  },
  electron: {
    maxFileBytes: 200 * MB,
    maxTotalInputBytes: 500 * MB,
    maxInputFiles: 50,
    maxTempBytes: 2 * 1024 * MB,
    maxOutputBytes: 1024 * MB,
    maxInlineDurationMs: 15 * 60 * 1000,
    allowAsyncJobs: true,
    allowExternalWorker: false
  },
  vercel: {
    // Direct upload bypasses the 4.5 MB function body, so the file cap can stay
    // useful; the real constraint is the /tmp scratch budget shared by input,
    // intermediate and output bytes.
    maxFileBytes: 100 * MB,
    maxTotalInputBytes: 100 * MB,
    maxInputFiles: 10,
    maxTempBytes: 450 * MB,
    maxOutputBytes: 200 * MB,
    maxInlineDurationMs: 60 * 1000,
    allowAsyncJobs: false,
    allowExternalWorker: true
  },
  worker: {
    maxFileBytes: 1024 * MB,
    maxTotalInputBytes: 4 * 1024 * MB,
    maxInputFiles: 200,
    maxTempBytes: 8 * 1024 * MB,
    maxOutputBytes: 4 * 1024 * MB,
    maxInlineDurationMs: 60 * 60 * 1000,
    allowAsyncJobs: true,
    allowExternalWorker: true
  }
}

/**
 * How far this deployment's storage reaches.
 *
 * `durable`   — local disk (desktop/web) or an object bucket: an artifact
 *               written by one request can be read by a later one.
 * `ephemeral` — a serverless host with no bucket. `/tmp` lives for one
 *               invocation only, so the job must be created, uploaded, executed
 *               and handed back inside a single request.
 */
export type StorageMode = 'durable' | 'ephemeral'

export function isCloudRuntime(runtime: DocumentRuntimeKind = detectRuntime()): boolean {
  return runtime === 'vercel' || runtime === 'worker'
}

/**
 * True when tm-tools holds its own provider bucket. Retained for the
 * single-host OIDC relay path; no provider credential reaches the browser.
 */
export function hasObjectStorageConfig(): boolean {
  const r2 = config.document.r2
  return Boolean((r2.endpoint || r2.accountId) && r2.accessKeyId && r2.secretAccessKey && r2.bucket)
}

/**
 * True when Hub could serve this deployment's objects. Hub does not hold a
 * provider credential here: the app identity is the Hub App Secret, which a
 * plain local checkout may not have. Selection is per request, so this is a
 * capability question and not a verdict on the current caller.
 */
export function hasHubStorageConfig(): boolean {
  const enrolledDevice = Boolean(config.hub.deviceId && config.hub.deviceSecret)
  return Boolean(config.hub.url && (config.hub.appSecret || enrolledDevice))
}

// Which adapter auto settles on, from deployment config alone. Hub comes first
// because it owns the provider credentials; an operator who wants this
// deployment's own bucket sets `DOCUMENT_STORAGE_DRIVER=r2` explicitly.
// `local` never reaches Hub: a serverless host without a usable connection must
// fail loudly instead of writing artifacts to /tmp and losing them on the next
// request.
export function preferredStorageDriver(): 'r2' | 'hub' | null {
  if (config.document.storageDriver === 'local') return null
  if (config.document.storageDriver === 'hub') return hasHubStorageConfig() ? 'hub' : null
  if (config.document.storageDriver === 'r2') return hasObjectStorageConfig() ? 'r2' : null
  if (hasHubStorageConfig()) return 'hub'
  if (hasObjectStorageConfig()) return 'r2'
  return null
}

// Hub verifies the Storage grant per signed-in caller (its token rides along),
// so a request without one is refused before any bytes move. Local and
// Electron never take this path: their job ids mean nothing to Hub.
export function hubStorageAvailable(event: { context?: Record<string, unknown> }): boolean {
  if (detectRuntime() === 'local' || detectRuntime() === 'electron') return false
  if (preferredStorageDriver() !== 'hub') return false
  const context = event.context ?? {}
  const raw = context.authToken
  if (typeof raw === 'string' && raw) return true
  const auth = (context.auth ?? null) as { token?: string } | null
  return Boolean(auth?.token)
}

export function storageMode(runtime: DocumentRuntimeKind = detectRuntime()): StorageMode {
  if (!isCloudRuntime(runtime)) return 'durable'
  return preferredStorageDriver() ? 'durable' : 'ephemeral'
}

export function isEphemeralRuntime(runtime: DocumentRuntimeKind = detectRuntime()): boolean {
  return storageMode(runtime) === 'ephemeral'
}

/**
 * Per-runtime support for one operation. A single cloud-wide flag cannot express
 * this: split is bounded enough for a Function while rasterize and AI extraction
 * are not, and the UI has to disable exactly those entries.
 */
export interface OperationRuntimeSupport {
  runtime: DocumentRuntimeKind
  enabled: boolean
  executionMode: 'sync' | 'async' | 'worker'
  maxInputFiles: number
  maxInputBytes: number
  maxTotalInputBytes: number
  maxPages?: number
  maxEstimatedScratchBytes?: number
  reasonDisabled?: string
}

interface OperationOverride {
  executionMode?: OperationRuntimeSupport['executionMode']
  maxInputFiles?: number
  maxPages?: number
  enabled?: boolean
  reasonDisabled?: string
}

/**
 * Per-operation, per-runtime overrides. Anything not listed falls back to the
 * runtime policy above, so adding an operation does not mean editing four
 * tables.
 */
const OVERRIDES: Record<DocumentRuntimeKind, Partial<Record<DocumentOperationId, OperationOverride>>> = {
  local: {},
  electron: {},
  vercel: {
    // Rasterization pulls a native canvas build and AI extraction runs long
    // behind the hub relay; neither is proven inside a Function.
    'pdf.rasterize': { enabled: false, reasonDisabled: 'native-canvas-unavailable' },
    'document.ai-extract': { enabled: false, executionMode: 'worker', reasonDisabled: 'external-worker-required' },
    'pdf.export': { maxPages: 50 },
    'pdf.split': { maxPages: 100 },
    'pdf.merge': { maxInputFiles: 10 }
  },
  worker: {
    'document.ai-extract': { executionMode: 'worker' }
  }
}

/** Intermediate bytes an operation needs on top of its input, per input byte. */
const SCRATCH_MULTIPLIER: Record<DocumentOperationId, number> = {
  'pdf.split': 2.5,
  'pdf.merge': 2.5,
  'pdf.rasterize': 8,
  'pdf.images-to-pdf': 2.5,
  'document.convert-to-pdf': 3,
  'pdf.export': 6,
  'document.ai-extract': 3
}

export function policyFor(runtime: DocumentRuntimeKind = detectRuntime()): RuntimePolicy {
  const base = POLICIES[runtime]
  if (runtime === 'local' || runtime === 'electron') return base

  // Cloud numbers are operator-tunable: the hard-coded values above are
  // defaults, and an explicit env value wins so a plan change does not need a
  // code change.
  return {
    ...base,
    maxFileBytes: config.document.maxUploadBytes || base.maxFileBytes,
    maxTotalInputBytes: config.document.maxTotalJobBytes || base.maxTotalInputBytes,
    maxTempBytes: config.document.maxScratchBytes || base.maxTempBytes
  }
}

export function operationSupport(
  operationId: DocumentOperationId,
  runtime: DocumentRuntimeKind = detectRuntime()
): OperationRuntimeSupport {
  const policy = policyFor(runtime)
  const override = OVERRIDES[runtime][operationId] ?? {}
  const enabled = override.enabled ?? true

  return {
    runtime,
    enabled,
    executionMode: override.executionMode ?? (policy.allowAsyncJobs ? 'async' : 'sync'),
    maxInputFiles: override.maxInputFiles ?? policy.maxInputFiles,
    maxInputBytes: policy.maxFileBytes,
    maxTotalInputBytes: policy.maxTotalInputBytes,
    maxPages: override.maxPages,
    maxEstimatedScratchBytes: policy.maxTempBytes,
    reasonDisabled: enabled ? undefined : override.reasonDisabled ?? 'not-supported'
  }
}

/**
 * A single serverless request carries the upload AND the result, and the
 * platform caps the whole body at 4.5 MB. Base64 inflates by ~4/3, so the raw
 * budget for input and output together has to stay well under that.
 */
export const EPHEMERAL_MAX_BYTES = 3 * 1024 * 1024

export function runtimeCapabilities(runtime: DocumentRuntimeKind = detectRuntime()): DocumentRuntimeCapabilities {
  const policy = policyFor(runtime)
  const local = runtime === 'local' || runtime === 'electron'
  const ephemeralResults = isEphemeralRuntime(runtime)
  const cap = (value: number) => (ephemeralResults ? Math.min(value, EPHEMERAL_MAX_BYTES) : value)

  return {
    runtime,
    supportsLocalOutputFolder: local,
    supportsNativeSaveDialog: runtime === 'electron',
    // Feature detection still has to happen in the browser; this flag only says
    // the runtime does not forbid it.
    supportsBrowserFileSystemAccess: runtime !== 'worker',
    requiresDownloadDelivery: !local,
    ephemeralResults,
    supportsAsyncJobs: policy.allowAsyncJobs && !ephemeralResults,
    supportsDirectUpload: !local && !ephemeralResults,
    maxFileBytes: cap(policy.maxFileBytes),
    maxTotalInputBytes: cap(policy.maxTotalInputBytes),
    maxInputFiles: policy.maxInputFiles,
    maxTempBytes: policy.maxTempBytes,
    maxOutputBytes: cap(policy.maxOutputBytes),
    maxInlineDurationMs: policy.maxInlineDurationMs,
    allowExternalWorker: policy.allowExternalWorker,
    supportedOperations: DOCUMENT_OPERATION_IDS.filter(id => operationSupport(id, runtime).enabled)
  }
}

export function supportsOperation(operationId: DocumentOperationId, runtime = detectRuntime()): boolean {
  return operationSupport(operationId, runtime).enabled
}

/**
 * Bounded-processing check from the completion guide §6.4: an operation whose
 * input plus intermediates cannot fit the runtime scratch budget must be routed
 * to a worker instead of starting and failing halfway through.
 */
export function estimateScratchBytes(operationId: DocumentOperationId, totalInputBytes: number): number {
  return Math.ceil(totalInputBytes * (SCRATCH_MULTIPLIER[operationId] ?? 3))
}

export function exceedsScratchBudget(
  operationId: DocumentOperationId,
  totalInputBytes: number,
  runtime: DocumentRuntimeKind = detectRuntime()
): boolean {
  return estimateScratchBytes(operationId, totalInputBytes) > policyFor(runtime).maxTempBytes
}

export const DOCUMENT_DEFAULT_RETENTION_DAYS = 7
