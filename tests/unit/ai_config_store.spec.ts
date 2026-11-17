import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'

let failures = 0
function check(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve().then(fn).then(
    () => console.log(`PASS ${name}`),
    (err) => {
      failures++
      console.log(`FAILED ${name}: ${(err as Error).message}`)
    }
  )
}

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
;(globalThis as Record<string, unknown>).__fakeMongo = {
  collection(name: string) {
    if (!collections.has(name)) collections.set(name, new MemoryCollection())
    return collections.get(name)
  }
}
;(globalThis as Record<string, unknown>).__env = {
  AI_LOCAL_CONNECTIONS: JSON.stringify([{ connectionId: 'legacy', providerKey: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', models: ['llama3.2'], apiKey: 'legacy-key' }]),
  AI_API_KEY_SLOT_FILLED: 'sk-from-slot'
}

await import('../../server/utils/aiConfigStore') // imported after the fakes so the module-level client factory sees them
const mod = await import('../../server/utils/aiConfigStore')

mod.__setTestHooks({
  db: (globalThis as Record<string, unknown>).__fakeMongo as { collection(name: string): unknown },
  secret: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  env: (globalThis as Record<string, unknown>).__env as Record<string, string | undefined>
})

await check('safeConnection never leaks the cipher', () => {
  const safe = mod.safeConnection({
    ownerId: 'u1', connectionId: 'lab', providerKey: 'ollama', baseUrl: 'http://x', apiKeyCipher: 'v1.a.b',
    enabled: true, models: [{ modelId: 'llama3.2', enabled: true, isPrimary: true }]
  })
  assert.equal(JSON.stringify(safe).includes('v1.a.b'), false)
  assert.equal(safe.hasKey, true)
  assert.equal(safe.models[0].modelId, 'llama3.2')
})

await check('hasKey matches the gateway for sealed, keyless and env-backed rows', () => {
  const base = {
    ownerId: 'u1',
    connectionId: 'slot',
    providerKey: 'openai-compatible',
    baseUrl: 'http://x',
    apiKeyCipher: '',
    enabled: true,
    models: []
  }
  // A sealed key is a key.
  assert.equal(mod.safeConnection({ ...base, apiKeyEnv: null, apiKeyCipher: 'v1.a.b' }).hasKey, true)
  // Keyless local providers (Ollama) are usable without a key or a slot.
  assert.equal(mod.safeConnection({ ...base }).hasKey, true)
  // A named slot counts only while it holds a value.
  assert.equal(mod.safeConnection({ ...base, apiKeyEnv: 'AI_API_KEY_SLOT_FILLED' }).hasKey, true)
  assert.equal(mod.safeConnection({ ...base, apiKeyEnv: 'AI_API_KEY_SLOT_EMPTY' }).hasKey, false)
})

await check('env import seals the inline key once per account', async () => {
  const store = mod.aiConfigStore('u1')
  const count = await mod.importEnvConnections('u1')
  assert.equal(count, 1)
  const rows = await store.listConnections()
  assert.equal(rows.length, 1)
  assert.match(rows[0].apiKeyCipher, /^v1\./)
  assert.equal(rows[0].apiKeyCipher.includes('legacy-key'), false)
  assert.equal(await mod.importEnvConnections('u1'), 0)
})

await check('decryption resolves the inline key for server calls', async () => {
  const entries = await mod.configuredConnections({ context: { auth: { userId: 'u1' } } } as unknown as Parameters<typeof mod.configuredConnections>[0])
  assert.equal(entries[0].apiKey, 'legacy-key')
  assert.deepEqual(entries[0].models.map(m => m.modelId), ['llama3.2'])
})

await check('GET payload contract carries no ciphertext', async () => {
  const rows = (await mod.aiConfigStore('u1').listConnections()).map(mod.safeConnection)
  const json = JSON.stringify(rows)
  assert.equal(json.includes('apiKeyCipher'), false)
  assert.equal(json.includes('v1.'), false)
  assert.equal(json.includes('legacy-key'), false)
})

await check('a second owner can neither list nor delete another owner\'s rows', async () => {
  const other = mod.aiConfigStore('u2')
  await other.upsertConnection({
    connectionId: 'u2-lab',
    providerKey: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:9/v1',
    apiKeyCipher: '',
    enabled: true,
    models: [{ modelId: 'price-text-b', enabled: true }]
  })

  const own = await other.listConnections()
  assert.deepEqual(own.map(row => row.connectionId), ['u2-lab'])

  const firstOwner = mod.aiConfigStore('u1')
  const leaked = (await firstOwner.listConnections()).filter(row => row.connectionId === 'u2-lab')
  assert.deepEqual(leaked, [])

  // A delete scoped to the wrong owner must not remove the other owner's row.
  await firstOwner.removeConnection('u2-lab')
  assert.deepEqual((await other.listConnections()).map(row => row.connectionId), ['u2-lab'])
})

if (failures) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('ai_config_store: all checks passed')
