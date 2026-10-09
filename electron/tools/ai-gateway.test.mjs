// AI gateway unit tests — plain Node, no network, no Electron.
// Run: node --test electron/tools/ai-gateway.test.mjs
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const gw = require('./ai-gateway.cjs')

describe('aiConfig', () => {
  it('freezes guarded defaults', () => {
    const cfg = gw.aiConfig({})
    assert.equal(cfg.provider, 'openai')
    assert.equal(cfg.baseUrl, 'https://api.openai.com/v1')
    assert.equal(cfg.maxTokens, 1024)
    assert.equal(cfg.timeoutMs, 60000)
    assert.equal(cfg.rpm, 30)
    assert.ok(Object.isFrozen(cfg))
  })

  it('rejects NaN numeric env (tm-trading failure class)', () => {
    const cfg = gw.aiConfig({ AI_TIMEOUT_MS: 'abc', AI_MAX_TOKENS: '', AI_RPM: 'xyz' })
    assert.equal(cfg.timeoutMs, 60000)
    assert.equal(cfg.maxTokens, 1024)
    assert.equal(cfg.rpm, 30)
  })

  it('selects family defaults', () => {
    assert.equal(gw.aiConfig({ AI_PROVIDER: 'anthropic' }).baseUrl, 'https://api.anthropic.com')
    assert.equal(gw.aiConfig({ AI_PROVIDER: 'ollama' }).baseUrl, 'http://localhost:11434/v1')
  })

  it('resolves per-task model overrides', () => {
    const cfg = gw.aiConfig({ AI_MODEL: 'base', AI_MODEL_TRANSCRIBE: 'whisper-x' })
    assert.equal(gw.resolveTaskModel('transcribe', cfg, { AI_MODEL: 'base', AI_MODEL_TRANSCRIBE: 'whisper-x' }), 'whisper-x')
    assert.equal(gw.resolveTaskModel('plan', cfg, { AI_MODEL: 'base' }), 'base')
  })
})

describe('RateLimiter', () => {
  it('allows rpm calls then rejects with wait time', () => {
    const limiter = new gw.RateLimiter(2, 60000)
    assert.equal(limiter.attempt(0).ok, true)
    assert.equal(limiter.attempt(1).ok, true)
    const rejected = limiter.attempt(2)
    assert.equal(rejected.ok, false)
    assert.ok(rejected.retryAfterMs > 0)
    assert.equal(limiter.attempt(60001).ok, true)
  })
})

describe('buildChatRequest', () => {
  it('builds OpenAI-compatible requests with json mode', () => {
    const req = gw.buildChatRequest(
      { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1' },
      { messages: [{ role: 'user', content: 'hi' }], model: 'm', jsonMode: true }
    )
    assert.equal(req.url, 'https://x/v1/chat/completions')
    assert.equal(req.headers.authorization, 'Bearer k')
    assert.deepEqual(req.body.response_format, { type: 'json_object' })
  })

  it('omits auth header without key (ollama local)', () => {
    const req = gw.buildChatRequest(
      { provider: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434/v1' },
      { messages: [{ role: 'user', content: 'hi' }] }
    )
    assert.equal(req.headers.authorization, undefined)
  })

  it('builds Anthropic requests', () => {
    const req = gw.buildChatRequest(
      { provider: 'anthropic', apiKey: 'k', baseUrl: 'https://api.anthropic.com' },
      { messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }
    )
    assert.equal(req.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(req.headers['x-api-key'], 'k')
    assert.equal(req.body.max_tokens, 10)
  })
})

describe('parseChatResponse', () => {
  it('parses OpenAI choices', () => {
    const out = gw.parseChatResponse('openai', { choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 5 } })
    assert.equal(out.content, 'hello')
    assert.deepEqual(out.usage, { total_tokens: 5 })
  })

  it('parses Anthropic blocks', () => {
    const out = gw.parseChatResponse('anthropic', { content: [{ type: 'text', text: 'hi' }] })
    assert.equal(out.content, 'hi')
  })

  it('throws ai.bad-shape on empty content', () => {
    assert.throws(() => gw.parseChatResponse('openai', { choices: [] }), err => err.code === 'ai.bad-shape')
  })
})

describe('complete', () => {
  function stubFetch(json, status) {
    return async () => ({
      status: status || 200,
      text: async () => JSON.stringify(json)
    })
  }

  it('returns content with mocked fetch', async () => {
    const out = await gw.complete(
      { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      { fetchImpl: stubFetch({ choices: [{ message: { content: 'yo' } }] }), logDir: null }
    )
    assert.equal(out.content, 'yo')
    assert.equal(out.model, 'm')
  })

  it('fails ai.no-key without credentials', async () => {
    await assert.rejects(
      gw.complete({ messages: [{ role: 'user', content: 'hi' }] }, { fetchImpl: stubFetch({}), logDir: null }),
      err => err.code === 'ai.no-key'
    )
  })

  it('maps 429 to ai.rate-limited', async () => {
    await assert.rejects(
      gw.complete(
        { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', messages: [{ role: 'user', content: 'hi' }] },
        { fetchImpl: stubFetch({}, 429), logDir: null }
      ),
      err => err.code === 'ai.rate-limited'
    )
  })

  it('maps timeouts to ai.timeout', async () => {
    const hanging = () => new Promise((resolve, reject) => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      setTimeout(() => reject(err), 5)
    })
    await assert.rejects(
      gw.complete(
        { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', messages: [{ role: 'user', content: 'hi' }] },
        { fetchImpl: hanging, logDir: null }
      ),
      err => err.code === 'ai.timeout'
    )
  }, { timeout: 10000 })
})

describe('transcribe', () => {
  function fixtureFile() {
    const dir = mkdtempSync(join(tmpdir(), 'tmcut-ai-'))
    const file = join(dir, 'sample.mp3')
    writeFileSync(file, Buffer.from([0x49, 0x44, 0x33]))
    return { dir, file }
  }

  it('returns text with mocked fetch', async () => {
    const { dir, file } = fixtureFile()
    try {
      const out = await gw.transcribe(
        { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', model: 'whisper-1', filePath: file },
        {
          fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify({ text: 'hello world' }) })
        }
      )
      assert.equal(out.text, 'hello world')
      assert.equal(out.segments, undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parses verbose_json segments when requested', async () => {
    const { dir, file } = fixtureFile()
    try {
      const out = await gw.transcribe(
        { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', filePath: file, format: 'verbose_json' },
        {
          fetchImpl: async () => ({
            status: 200,
            text: async () => JSON.stringify({
              text: 'hi there',
              segments: [
                { start: 0, end: 1.5, text: 'hi' },
                { start: 1.5, end: 3, text: 'there' },
                { start: 'x', end: 4 }
              ]
            })
          })
        }
      )
      assert.equal(out.segments.length, 2)
      assert.deepEqual(out.segments[0], { start: 0, end: 1.5, text: 'hi' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails ai.no-file for unreadable paths', async () => {
    await assert.rejects(
      gw.transcribe({ filePath: join(tmpdir(), 'tmcut-missing-file.mp3') }, {}),
      err => err.code === 'ai.no-file'
    )
  })
})
