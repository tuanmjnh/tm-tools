import type {
  DocumentJobRepository,
  DocumentStorageProvider,
  OutputDeliveryAdapter,
  TemporaryWorkspace
} from './contracts'
import type { DocumentRuntimeCapabilities, DocumentOperationId, DocumentRuntimeKind } from '#shared/types/document'
import type { H3Event } from 'h3'
import { localJobRepository } from './jobs'
import { ephemeralOutputDelivery, localOutputDelivery, ObjectStorageDelivery } from './output'
import {
  detectRuntime,
  hasObjectStorageConfig,
  hubStorageAvailable,
  isEphemeralRuntime,
  operationSupport,
  preferredStorageDriver,
  runtimeCapabilities
} from './runtime'
import { localStorageProvider } from './storage'
import { localTemporaryWorkspace } from './temporary'
import { isDatabaseConfigured, documentDatabase } from './postgres-client'
import { PostgresJobRepository } from './postgres-jobs'
import { r2StorageProvider } from './r2-storage'
import { HubStorageProvider } from './hub-storage'
import { DocumentError } from './operations'
import { config } from '#server/config'

export interface DocumentRuntime {
  capabilities: DocumentRuntimeCapabilities
  storage: DocumentStorageProvider
  temp: TemporaryWorkspace
  jobs: DocumentJobRepository
  delivery: OutputDeliveryAdapter
}

export function isLocalRuntime(runtime: DocumentRuntimeKind = detectRuntime()): boolean {
  return runtime === 'local' || runtime === 'electron'
}

let cachedRuntime: DocumentRuntime | null = null

/**
 * One place that decides which adapters a runtime gets.
 *
 * Local/Electron stay on the filesystem and never touch a cloud credential.
 * A cloud runtime needs Postgres for job metadata and object storage for bytes;
 * when either is missing the API answers with a configuration error for that
 * provider only, rather than refusing every operation at once (§11.1 of the
 * completion guide).
 *
 * The Hub provider is bound to one request because every gateway call carries
 * the signed-in user's token: caching it would pin the first caller's identity
 * onto everybody after them. Only the identity-free adapter set is cached.
 */
export async function documentRuntime(event?: H3Event): Promise<DocumentRuntime> {
  const driver = preferredStorageDriver()

  // Ephemeral cloud: no bucket exists, so the data root is `/tmp` and the local
  // filesystem adapters are the only coherent choice. A job here must finish
  // inside one request; nothing is promised to a later one.
  if ((!event || isLocalRuntime()) && isEphemeralRuntime()) {
    const capabilities = runtimeCapabilities()
    return {
      capabilities,
      storage: localStorageProvider,
      temp: localTemporaryWorkspace,
      jobs: localJobRepository,
      delivery: ephemeralOutputDelivery
    }
  }

  if (isLocalRuntime() || !driver) return cachedRuntime ?? (cachedRuntime = localRuntimeSet())
  if (driver === 'hub') {
    if (!event) throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED', { reason: 'hub-storage-requires-request' })
    return hubRuntimeSet(event)
  }
  if (cachedRuntime) return cachedRuntime
  cachedRuntime = await r2RuntimeSet()
  return cachedRuntime
}

function localRuntimeSet(): DocumentRuntime {
  return {
    capabilities: runtimeCapabilities(),
    storage: localStorageProvider,
    temp: localTemporaryWorkspace,
    jobs: localJobRepository,
    delivery: localOutputDelivery
  }
}

/**
 * Hub is byte storage for a cloud deployment: TM Hub owns the provider bucket
 * and the credential. Job metadata still belongs to this app, so Postgres is
 * required exactly as it is for the R2 adapter.
 */
async function hubRuntimeSet(event: H3Event): Promise<DocumentRuntime> {
  if (!isDatabaseConfigured()) throw new DocumentError('DOCUMENT_DATABASE_NOT_CONFIGURED')
  if (!hubStorageAvailable(event)) {
    throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED', { reason: 'hub-storage-unavailable' })
  }

  const storage = new HubStorageProvider(event, config.document.hub.namespace)
  return {
    capabilities: runtimeCapabilities(),
    storage,
    temp: localTemporaryWorkspace,
    jobs: new PostgresJobRepository(documentDatabase()),
    delivery: new ObjectStorageDelivery(storage)
  }
}

/**
 * R2 is the single-host adapter: this deployment owns the bucket credential,
 * so the provider carries no caller identity and may be shared by every request.
 */
async function r2RuntimeSet(): Promise<DocumentRuntime> {
  if (!isDatabaseConfigured()) throw new DocumentError('DOCUMENT_DATABASE_NOT_CONFIGURED')
  if (!hasObjectStorageConfig()) throw new DocumentError('DOCUMENT_STORAGE_NOT_CONFIGURED')

  const storage = r2StorageProvider
  return {
    capabilities: runtimeCapabilities(),
    storage,
    temp: localTemporaryWorkspace,
    jobs: new PostgresJobRepository(documentDatabase()),
    delivery: new ObjectStorageDelivery(storage)
  }
}

/**
 * Gate for one operation. `DOCUMENT_RUNTIME_NOT_SUPPORTED` is raised only when
 * that specific operation has no adapter for this runtime; the rest of the app
 * keeps working.
 */
export function requireOperationSupport(operationId: DocumentOperationId): void {
  const support = operationSupport(operationId)
  if (support.enabled) return

  throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', {
    runtime: support.runtime,
    operationId,
    reason: support.reasonDisabled
  })
}

/**
 * An ephemeral deployment has no store a later request can read, so every
 * route that addresses a job by id would answer 404 by construction. Refusing
 * here names the supported path instead of pretending the job is missing.
 */
export function requireJobRoutes(): void {
  if (!isEphemeralRuntime()) return
  throw new DocumentError('DOCUMENT_RUNTIME_NOT_SUPPORTED', { reason: 'use-single-request-run' })
}

/** Test seam: a new runtime configuration must not keep a stale adapter set. */
export function resetDocumentRuntime(): void {
  cachedRuntime = null
}
