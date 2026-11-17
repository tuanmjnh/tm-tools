import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const page = 'app/pages/system/settings/ai-local.vue'
const nav = 'app/composables/useSettingsNav.ts'
const guard = 'app/middleware/auth.global.ts'
const endpoint = 'server/api/v1/ai/local-connections.get.ts'

describe('local AI settings surface', () => {
  it('edits per-account connections through the app API, not the desktop vault', () => {
    const source = read(page)
    assert.match(source, /'\/api\/v1\/ai\/connections'/)
    assert.match(source, /method: 'PUT'/)
    assert.equal(/electronAPI/.test(source), false)
    assert.equal(/parseAppConnections/.test(source), false)
    assert.match(source, /AIConnectionsEditor/)
    // The key goes to the server once and is cleared from the form.
    assert.match(source, /apiKey: row\.apiKey\.trim\(\) \|\| undefined/)
    assert.match(source, /row\.apiKey = ''/)
  })

  it('sends stored model objects so enabled and primary survive a save', () => {
    const source = read(page)
    assert.match(source, /function modelsForSave/)
    assert.match(source, /previous\.get\(id\)/)
    assert.match(source, /isPrimary: true/)
  })

  it('offers per-row test, save and remove, plus a models refresh', () => {
    const source = read(page)
    assert.match(source, /\/test`/)
    assert.match(source, /\/models\/refresh`/)
    assert.match(source, /testRow/)
    assert.match(source, /@test="testRow"/)
    assert.match(source, /@save="saveAll"/)
    assert.match(source, /@remove="requestRemove"/)
  })

  it('is not desktop-gated and drops the env-only card', () => {
    const source = read(page)
    assert.equal(/disabled="!desktop"/.test(source), false)
    assert.equal(/settings\.aiLocal\.webTitle/.test(source), false)
    assert.match(source, /method: 'DELETE'/)
    assert.match(source, /encodeURIComponent/)
  })

  it('is root-only in the settings nav and the route guard', () => {
    assert.match(read(nav), /\/system\/settings\/ai-local/)
    assert.match(read(guard), /'\/system\/settings\/ai-local'/)
  })

  it('exposes the account rows and the env view without keys', () => {
    const source = read(endpoint)
    assert.match(source, /describeLocalConnections/)
    assert.match(source, /safeConnection/)
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
    const { parseAppConnections } = await import('@tuanmjnh/tm-ai-client')
    const result = parseAppConnections([
      { connectionId: 'x', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: 'RANDOM_VAR' }
    ])
    assert.equal(result.connections.length, 0)
    assert.match(result.errors[0]!, /apiKeyEnv/)
  })
})
