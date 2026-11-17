import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { H3Event } from 'h3'

/**
 * The extraction picker used to resolve the env-only catalogue, so a provider
 * configured in `ai_connections` never appeared. The list must read the
 * requesting account's rows, and it must never hand one account's list to the
 * next caller through the cache.
 *
 * Nitro globals are stubbed because this spec imports server modules outside a
 * Nuxt runtime; the account store is the same in-memory fake ai_config_store
 * uses.
 */
process.env.NODE_ENV = 'test'

interface ErrorInput {
  statusCode?: number
  statusMessage?: string
  message?: string
}

const globals = globalThis as unknown as Record<string, unknown>
globals.createError = (input: ErrorInput) => {
  const error = new Error(input.message ?? input.statusMessage ?? 'error') as Error & ErrorInput
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  return error
}
globals.useRuntimeConfig = () => ({ aiLocalConnections: '' })

class MemoryCollection {
  docs: Array<Record<string, unknown>> = []
  indexes: Array<[Record<string, unknown>, Record<string, unknown>?]> = []

  async createIndex(spec: Record<string, unknown>, opts?: Record<string, unknown>) { this.indexes.push([spec, opts]) }

  find(filter: Record<string, unknown>) {
    const hit = (doc: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => doc[k] === v)
    return { toArray: async () => this.docs.filter(hit).map(doc => ({ ...doc })) }
  }

  async findOne(filter: Record<string, unknown>) {
    const hit = (doc: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => doc[k] === v)
    return this.docs.find(hit) ?? null
  }

  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, opts?: { upsert?: boolean }) {
    const hit = (doc: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => doc[k] === v)
    let doc = this.docs.find(hit)
    if (!doc) {
      if (!opts?.upsert) return {}
      doc = { ...filter }
      this.docs.push(doc)
    }
    Object.assign(doc, (update.$set ?? {}) as Record<string, unknown>)
    return {}
  }

  async deleteOne(filter: Record<string, unknown>) {
    const hit = (doc: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => doc[k] === v)
    const i = this.docs.findIndex(hit)
    if (i >= 0) this.docs.splice(i, 1)
    return {}
  }
}

const collections = new Map<string, MemoryCollection>()
const fakeDb = {
  collection(name: string) {
    if (!collections.has(name)) collections.set(name, new MemoryCollection())
    return collections.get(name)!
  }
}

const storeMod = await import('../../server/utils/aiConfigStore')
storeMod.__setTestHooks({ db: fakeDb, secret: null, env: {} })

function eventFor(userId: string): H3Event {
  return { context: { auth: { sub: userId } } } as unknown as H3Event
}

async function seed(ownerId: string, connectionId: string, modelId: string) {
  await storeMod.aiConfigStore(ownerId).upsertConnection({
    connectionId,
    providerKey: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:9/v1',
    apiKeyCipher: '',
    enabled: true,
    models: [{ modelId, enabled: true, isPrimary: true }]
  })
}

describe('PDF extraction model list', () => {
  it('offers a connection that exists only in the account store', async () => {
    await seed('acct-a', 'acct-a-lab', 'price-text-a')
    const { listExtractModels } = await import('../../server/modules/pdf/extract/models')

    const models = await listExtractModels(eventFor('acct-a'))
    const entry = models.find(model => model.connectionId === 'app:acct-a-lab')
    assert.ok(entry, 'the DB-only connection must appear in the picker')
    assert.equal(entry.modelId, 'price-text-a')
    assert.equal(entry.displayName, 'price-text-a')
  })

  it('never serves one account the connection list of another from cache', async () => {
    await seed('acct-b', 'acct-b-lab', 'price-text-b')
    const { listExtractModels } = await import('../../server/modules/pdf/extract/models')

    // Resolve acct-a first: a cached list would then leak into acct-b's call.
    const first = await listExtractModels(eventFor('acct-a'))
    assert.ok(first.some(model => model.connectionId === 'app:acct-a-lab'))

    const second = await listExtractModels(eventFor('acct-b'))
    assert.equal(second.some(model => model.connectionId === 'app:acct-a-lab'), false)
    assert.ok(second.some(model => model.connectionId === 'app:acct-b-lab'))
  })
})
