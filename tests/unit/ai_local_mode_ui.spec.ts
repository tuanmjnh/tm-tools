import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const page = 'app/pages/system/settings/ai-local.vue'
const card = 'app/components/aiProviders/LocalConnectionCard.vue'
const nav = 'app/composables/useSettingsNav.ts'
const guard = 'app/middleware/auth.global.ts'
const endpoint = 'server/api/v1/ai/local-connections.get.ts'
const gateway = 'server/utils/aiGateway.ts'

describe('local AI settings surface', () => {
  it('edits local connections through the desktop vault, not the Hub', () => {
    const source = read(page)
    assert.match(source, /AI_LOCAL_CONNECTIONS/)
    assert.match(source, /electronAPI!\.setConfig/)
    assert.match(source, /parseAILocalConnections/)
    assert.match(read(card), /BasePasswordInput/)
    // The key is written to a slot, never into the JSON array.
    assert.equal(/apiKey: row\.apiKey/.test(source), false)
    assert.match(source, /values\[slot\] = key/)
  })

  it('offers a per-row test against the AI check endpoint', () => {
    const source = read(page)
    assert.match(source, /\/api\/v1\/ai\/check/)
    assert.match(source, /testRow/)
    assert.match(read(card), /@click="emit\('test'\)"/)
  })

  it('shows the server-side env names on a web build', () => {
    const source = read(page)
    assert.match(source, /settings\.aiLocal\.webTitle/)
    assert.match(source, /settings\.aiLocal\.envHint/)
  })

  it('is root-only in the settings nav and the route guard', () => {
    assert.match(read(nav), /\/system\/settings\/ai-local/)
    assert.match(read(guard), /'\/system\/settings\/ai-local'/)
  })

  it('exposes the server view without keys', () => {
    const source = read(endpoint)
    assert.match(source, /describeLocalConnections/)
    assert.equal(/apiKey:/.test(source), false)
  })
})

describe('gateway key slots', () => {
  it('resolves a key from the named config slot', async () => {
    const globals = globalThis as unknown as Record<string, unknown>
    globals.useRuntimeConfig = () => ({ aiLocalConnections: '' })
    process.env.AI_LOCAL_CONNECTIONS = JSON.stringify([
      {
        connectionId: 'slot-local',
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:4599/v1',
        apiKeyEnv: 'AI_API_KEY_FREELLM',
        models: ['mock-model']
      }
    ])
    process.env.AI_API_KEY_FREELLM = 'sk-from-slot'
    try {
      const { describeLocalConnections, resolveLocalApiKey, localConnections } = await import('../../server/utils/aiGateway')
      const entry = localConnections()[0]
      assert.equal(resolveLocalApiKey(entry!), 'sk-from-slot')

      const described = describeLocalConnections()
      assert.equal(described.connections[0]!.hasKey, true)
      assert.equal(described.connections[0]!.apiKeyEnv, 'AI_API_KEY_FREELLM')
      assert.equal(JSON.stringify(described).includes('sk-from-slot'), false)
    } finally {
      delete process.env.AI_LOCAL_CONNECTIONS
      delete process.env.AI_API_KEY_FREELLM
    }
  })

  it('reports no key when the slot is empty, so the picker hides it', async () => {
    const globals = globalThis as unknown as Record<string, unknown>
    globals.useRuntimeConfig = () => ({ aiLocalConnections: '' })
    process.env.AI_LOCAL_CONNECTIONS = JSON.stringify([
      {
        connectionId: 'slot-empty',
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:4599/v1',
        apiKeyEnv: 'AI_API_KEY_MISSING',
        models: ['mock-model']
      }
    ])
    try {
      const { describeLocalConnections } = await import('../../server/utils/aiGateway')
      assert.equal(describeLocalConnections().connections[0]!.hasKey, false)
    } finally {
      delete process.env.AI_LOCAL_CONNECTIONS
    }
  })

  it('rejects a slot name that is not a secret slot', async () => {
    const { parseAILocalConnections } = await import('../../shared/utils/aiLocalConnections')
    const result = parseAILocalConnections([
      { connectionId: 'x', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: 'RANDOM_VAR' }
    ])
    assert.equal(result.connections.length, 0)
    assert.match(result.errors[0]!, /apiKeyEnv/)
  })
})
