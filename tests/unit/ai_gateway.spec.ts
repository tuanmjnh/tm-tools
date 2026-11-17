import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

process.env.NODE_ENV = 'test'

/**
 * The mock provider is started by this spec on an ephemeral loopback port, so
 * the check is self-contained and never depends on an external service.
 * Nitro globals are stubbed because this spec imports a server module outside
 * a Nuxt runtime.
 */
let server: Server | null = null
let baseUrl = ''

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

function freshFakeDb() {
  const collections = new Map<string, MemoryCollection>()
  return {
    collection(name: string) {
      if (!collections.has(name)) collections.set(name, new MemoryCollection())
      return collections.get(name)!
    }
  }
}

function stubNitro() {
  const globals = globalThis as unknown as Record<string, unknown>
  globals.useRuntimeConfig = () => ({
    aiLocalConnections: JSON.stringify([
      {
        connectionId: 'local-test',
        providerKey: 'nvidia',
        baseUrl,
        models: ['mock-model']
      }
    ])
  })
  globals.createError = (options: Record<string, unknown>) =>
    Object.assign(new Error(String(options.message || 'error')), options)
  globals.$fetch = async () => {
    throw Object.assign(new Error('hub unavailable'), { statusCode: 503 })
  }
}

describe('AI gateway local mode', () => {
  before(async () => {
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        const payload = JSON.parse(body || '{}')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          choices: [{ message: { content: `pong:${payload.model}` } }]
        }))
      })
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('mock provider did not bind')
    baseUrl = `http://127.0.0.1:${address.port}/v1`
    stubNitro()
  })

  after(async () => {
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve())
  })

  it('routes a configured local connection straight to the provider', async () => {
    const { chatWithConnection } = await import('../../server/utils/aiGateway')
    const result = await chatWithConnection({
      connectionId: 'local-test',
      model: 'mock-model',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8
    })
    assert.equal(result.ok, true)
    assert.equal(result.content, 'pong:mock-model')
    assert.equal(result.provider, 'nvidia')
  })

  it('routes a namespaced catalogue id back to the configured connection', async () => {
    const { chatWithConnection } = await import('../../server/utils/aiGateway')
    const result = await chatWithConnection({
      connectionId: 'app:local-test',
      model: 'mock-model',
      messages: [{ role: 'user', content: 'ping' }]
    })
    assert.equal(result.content, 'pong:mock-model')
  })

  it('keeps unknown connections on the hub relay', async () => {
    const { chatWithConnection } = await import('../../server/utils/aiGateway')
    await assert.rejects(
      () => chatWithConnection({
        connectionId: 'hub-only',
        model: 'x',
        messages: [{ role: 'user', content: 'ping' }]
      }),
      (err: { statusCode?: number }) => err.statusCode === 503
    )
  })

  it('reads the desktop env name when the runtime config is empty', async () => {
    const globals = globalThis as unknown as Record<string, unknown>
    const runtime = globals.useRuntimeConfig
    globals.useRuntimeConfig = () => ({ aiLocalConnections: '' })
    process.env.AI_LOCAL_CONNECTIONS = JSON.stringify([
      { connectionId: 'env-local', provider: 'openai-compatible', baseUrl, models: ['mock-model'] }
    ])
    try {
      const { chatWithConnection } = await import('../../server/utils/aiGateway')
      const result = await chatWithConnection({
        connectionId: 'env-local',
        model: 'mock-model',
        messages: [{ role: 'user', content: 'ping' }]
      })
      assert.equal(result.content, 'pong:mock-model')
    } finally {
      delete process.env.AI_LOCAL_CONNECTIONS
      globals.useRuntimeConfig = runtime
    }
  })

  it('falls back to local connections when the hub catalogue is down', async () => {
    const { fetchAICatalog } = await import('../../server/utils/aiGateway')
    const catalog = await fetchAICatalog()
    assert.equal(catalog.length, 1)
    // The app-local namespace keeps the id from colliding with a hub row.
    assert.equal(catalog[0]!.connectionId, 'app:local-test')
    assert.equal(catalog[0]!.provider, 'nvidia')
    assert.equal(catalog[0]!.source, 'app')
    assert.deepEqual(catalog[0]!.models.map(model => model.modelId), ['mock-model'])
    assert.equal(catalog[0]!.hasKey, true)
  })

  it('catalogue includes a DB row even when both env sources are empty', async () => {
    const storeMod = await import('../../server/utils/aiConfigStore')
    const globals = globalThis as unknown as Record<string, unknown>
    const runtime = globals.useRuntimeConfig
    const previousEnv = process.env.AI_LOCAL_CONNECTIONS
    globals.useRuntimeConfig = () => ({ aiLocalConnections: '' })
    delete process.env.AI_LOCAL_CONNECTIONS
    try {
      storeMod.__setTestHooks({ db: freshFakeDb() })
      await storeMod.aiConfigStore('u1').upsertConnection({
        connectionId: 'db-lab',
        providerKey: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9/v1',
        apiKeyCipher: '',
        enabled: true,
        models: [{ modelId: 'auto', enabled: true }]
      })
      const { fetchAICatalog } = await import('../../server/utils/aiGateway')
      const catalog = await fetchAICatalog({ context: { auth: { userId: 'u1' } } } as never)
      const app = catalog.find(connection => connection.connectionId === 'app:db-lab')
      assert.ok(app, 'expected the app-local catalogue row')
      assert.equal(app.source, 'app')
      assert.deepEqual(app.models.map(model => model.modelId), ['auto'])
      assert.equal(app.hasKey, true)
    } finally {
      globals.useRuntimeConfig = runtime
      if (previousEnv === undefined) delete process.env.AI_LOCAL_CONNECTIONS
      else process.env.AI_LOCAL_CONNECTIONS = previousEnv
      storeMod.__setTestHooks({})
    }
  })

  it('degrades to the env reader when the account store throws', async () => {
    const storeMod = await import('../../server/utils/aiConfigStore')
    storeMod.__setTestHooks({
      db: {
        collection() {
          throw new Error('mongo unreachable')
        }
      }
    })
    const globals = globalThis as unknown as Record<string, unknown>
    const runtime = globals.useRuntimeConfig
    const hubFetch = globals.$fetch
    const previousEnv = process.env.AI_LOCAL_CONNECTIONS
    globals.useRuntimeConfig = () => ({
      aiLocalConnections: '',
      hubAppSecret: 'test-secret',
      public: { hubUrl: 'http://hub.test', hubAppId: 'tm-tools_test' }
    })
    globals.$fetch = async () => {
      throw Object.assign(new Error('hub unavailable'), { statusCode: 503, data: { message: 'hub unavailable' } })
    }
    delete process.env.AI_LOCAL_CONNECTIONS
    try {
      const { fetchAICatalog } = await import('../../server/utils/aiGateway')
      await assert.rejects(
        () => fetchAICatalog({ context: { auth: { userId: 'u1' } } } as never),
        (err: { statusCode?: number, message?: string }) =>
          err.statusCode === 503 && String(err.message).includes('hub unavailable')
      )
    } finally {
      globals.useRuntimeConfig = runtime
      globals.$fetch = hubFetch
      if (previousEnv === undefined) delete process.env.AI_LOCAL_CONNECTIONS
      else process.env.AI_LOCAL_CONNECTIONS = previousEnv
      storeMod.__setTestHooks({})
    }
  })
})
