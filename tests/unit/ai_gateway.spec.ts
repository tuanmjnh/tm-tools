import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

/**
 * The mock provider is started by this spec on an ephemeral loopback port, so
 * the check is self-contained and never depends on an external service.
 * Nitro globals are stubbed because this spec imports a server module outside
 * a Nuxt runtime.
 */
let server: Server | null = null
let baseUrl = ''

function stubNitro() {
  const globals = globalThis as unknown as Record<string, unknown>
  globals.useRuntimeConfig = () => ({
    aiLocalConnections: JSON.stringify([
      {
        connectionId: 'local-test',
        provider: 'openai-compatible',
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
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const payload = JSON.parse(body || '{}')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          choices: [{ message: { content: `pong:${payload.model}` } }]
        }))
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('mock provider did not bind')
    baseUrl = `http://127.0.0.1:${address.port}/v1`
    stubNitro()
  })

  after(async () => {
    await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve())
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
    assert.equal(result.provider, 'openai-compatible')
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
    assert.equal(catalog[0]!.connectionId, 'local-test')
    assert.deepEqual(catalog[0]!.models.map(model => model.modelId), ['mock-model'])
    assert.equal(catalog[0]!.hasKey, true)
  })
})
