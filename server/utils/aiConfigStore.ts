import type { H3Event } from 'h3'
import {
  createMongoAIConfigStore,
  generateMasterKey,
  openSecret,
  parseAppConnections,
  providerDisplayName,
  sealSecret,
  storedToAppConnection,
  type AIConfigStore,
  type AppAIConnection,
  type MongoCollectionLike,
  type MongoDatabaseLike,
  type StoredAIConnection
} from '@tuanmjnh/tm-ai-client'
import { getSharedConnection } from '../modules/database/shared'
import { requireChatUser } from './chatAuth'

export interface SafeAIModel {
  modelId: string
  displayName?: string
  enabled: boolean
  isPrimary?: boolean
}

export interface SafeAIConnection {
  connectionId: string
  providerKey: string
  providerName: string
  baseUrl: string
  apiKeyEnv: string | null
  hasKey: boolean
  enabled: boolean
  models: SafeAIModel[]
}

interface TestHooks {
  db?: { collection(name: string): unknown }
  secret?: string | null
  env?: Record<string, string | undefined>
}

let hooks: TestHooks = {}

export function __setTestHooks(next: TestHooks): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test hooks are not available')
  hooks = next
}

function envValue(key: string): string | undefined {
  const fakeEnv = (globalThis as Record<string, unknown>).__env as Record<string, string | undefined> | undefined
  return (hooks.env ?? fakeEnv ?? process.env)[key]
}

export function resolveAIConfigSecret(): string | null {
  if (hooks.secret !== undefined) return hooks.secret
  const value = String(process.env.AI_CONFIG_SECRET || '').trim()
  return value || null
}

export function requireAIConfigSecret(): string {
  const secret = resolveAIConfigSecret()
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'error.aiConfigSecretMissing',
      message: 'AI_CONFIG_SECRET is not configured on this server'
    })
  }
  return secret
}

/** Generated lazily so a read-only deployment can still list env connections. */
let ephemeralSecret: string | null = null
function secretForWrite(): string {
  const configured = resolveAIConfigSecret()
  if (configured) return configured
  if (!ephemeralSecret) {
    console.warn('[ai-config] AI_CONFIG_SECRET is unset; using an ephemeral master key (keys will not survive a restart)')
    ephemeralSecret = generateMasterKey()
  }
  return ephemeralSecret
}

export function storeOwnerId(event: H3Event): string {
  return requireChatUser(event).userId
}

export function aiConfigStore(ownerId: string): AIConfigStore {
  const fakeMongo = (globalThis as Record<string, unknown>).__fakeMongo
  const db = (hooks.db ?? fakeMongo ?? null) as MongoDatabaseLike | null
  if (db) return createMongoAIConfigStore(db, ownerId)
  // getSharedConnection is async; Mongo driver construction is synchronous, so
  // the first operation awaits the connection through this proxy. `find` hands
  // back a cursor synchronously in the driver contract, so it wraps toArray.
  const proxy: MongoDatabaseLike = {
    collection(name: string): MongoCollectionLike {
      const live = async () => (await getSharedConnection()).db.collection(name) as unknown as MongoCollectionLike
      return {
        find: filter => ({ toArray: async () => (await live()).find(filter).toArray() }),
        findOne: filter => live().then(collection => collection.findOne(filter)),
        updateOne: (filter, update, options) => live().then(collection => collection.updateOne(filter, update, options)),
        deleteOne: filter => live().then(collection => collection.deleteOne(filter)),
        createIndex: (spec, options) => live().then(collection => collection.createIndex(spec, options))
      }
    }
  }
  return createMongoAIConfigStore(proxy, ownerId)
}

export function safeConnection(record: StoredAIConnection): SafeAIConnection {
  const apiKeyEnv = record.apiKeyEnv ?? null
  return {
    connectionId: record.connectionId,
    providerKey: record.providerKey,
    providerName: providerDisplayName(record.providerKey),
    baseUrl: record.baseUrl,
    apiKeyEnv,
    hasKey: Boolean(record.apiKeyCipher) || !apiKeyEnv,
    enabled: record.enabled,
    models: record.models.map(model => ({
      modelId: model.modelId,
      ...(model.displayName ? { displayName: model.displayName } : {}),
      enabled: model.enabled,
      ...(model.isPrimary ? { isPrimary: true } : {})
    }))
  }
}

export async function sealForKey(plain: string): Promise<string> {
  return sealSecret(secretForWrite(), plain)
}

async function decryptKey(record: StoredAIConnection): Promise<string | undefined> {
  if (record.apiKeyCipher) {
    const secret = resolveAIConfigSecret() ?? ephemeralSecret
    if (!secret) {
      console.warn(`[ai-config] cannot decrypt connection "${record.connectionId}": no master key configured`)
      return undefined
    }
    try {
      return await openSecret(secret, record.apiKeyCipher)
    } catch (err) {
      console.warn(`[ai-config] cannot decrypt connection "${record.connectionId}": ${(err as Error).message}`)
      return undefined
    }
  }
  if (record.apiKeyEnv) return String(envValue(record.apiKeyEnv) || '').trim() || undefined
  return undefined
}

export async function importEnvConnections(ownerId: string): Promise<number> {
  const store = aiConfigStore(ownerId)
  const existing = await store.listConnections()
  if (existing.length) return 0
  const parsed = parseAppConnections(envValue('AI_LOCAL_CONNECTIONS') || '')
  let imported = 0
  for (const entry of parsed.connections) {
    await store.upsertConnection({
      connectionId: entry.connectionId,
      providerKey: entry.providerKey,
      baseUrl: entry.baseUrl,
      apiKeyCipher: entry.apiKey ? await sealForKey(entry.apiKey) : '',
      ...(entry.apiKeyEnv ? { apiKeyEnv: entry.apiKeyEnv } : {}),
      enabled: true,
      models: entry.models.map(model => ({ modelId: model.modelId, displayName: model.displayName, enabled: true }))
    })
    imported++
  }
  return imported
}

export async function configuredConnections(event?: H3Event): Promise<AppAIConnection[]> {
  const ownerId = event?.context?.auth ? storeOwnerId(event) : null
  if (!ownerId) {
    return parseAppConnections(envValue('AI_LOCAL_CONNECTIONS') || '').connections
  }
  await importEnvConnections(ownerId)
  const records = await aiConfigStore(ownerId).listConnections()
  const out: AppAIConnection[] = []
  for (const record of records) {
    if (!record.enabled) continue
    const apiKey = await decryptKey(record)
    out.push(storedToAppConnection(record, { apiKey }))
  }
  return out
}

export async function findConfiguredConnection(connectionId: string, event?: H3Event): Promise<AppAIConnection | undefined> {
  const entries = await configuredConnections(event)
  return entries.find(entry => entry.connectionId === connectionId.replace(/^app:/, ''))
}
