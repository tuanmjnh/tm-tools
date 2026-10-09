// =============================================================================
//  TM TOOLS - AI GATEWAY (main process).
//
//  One abstraction over OpenAI-compatible chat APIs plus audio transcription,
//  zero dependencies (raw fetch). Port of the tm-trading/ai/gateway.mjs
//  pattern, adapted for Electron: API keys never touch the renderer, calls
//  go through IPC, and every call is audit-logged.
//
//  Families (selected by provider name):
//   - openai    : POST {base}/chat/completions (OpenAI, OpenRouter, Groq,
//                 Ollama, 9Router/OmniRoute, Gemini OpenAI endpoint, custom)
//   - anthropic : POST {base}/v1/messages
//
//  Transcription uses the OpenAI-compatible audio endpoint:
//   - POST {base}/audio/transcriptions (Groq Whisper, OpenAI Whisper)
//
//  Task routing (docs section 66): callers pass task: transcribe | triage |
//  plan and the gateway resolves per-task model overrides from env
//  (AI_MODEL_TRANSCRIBE / AI_MODEL_TRIAGE / AI_MODEL_PLAN, else AI_MODEL).
//
//  Env: AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_MAX_TOKENS,
//       AI_TIMEOUT_MS, AI_RPM, AI_TEMPERATURE, AI_LOG_DIR
//  Per-call overrides (e.g. from TM Hub app configs) win over env.
//
//  Stable error codes (AIGatewayError.code):
//   ai.no-key | ai.rate-limited | ai.timeout | ai.network | ai.http-error |
//   ai.api-error | ai.bad-shape | ai.no-file
// =============================================================================

const fs = require('node:fs')
const path = require('node:path')

/** Gateway error with a stable machine-readable `code`. */
class AIGatewayError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'AIGatewayError'
    this.code = code
    Object.assign(this, extra || {})
  }
}

/** Build config from env (pure — tests pass their own env object). */
function aiConfig(env) {
  const source = env || process.env
  // Numeric env vars must be guarded: a typo such as AI_TIMEOUT_MS=abc would
  // otherwise yield NaN and every call would abort as ai.timeout.
  const num = (raw, fallback) => {
    const n = Number(raw)
    return raw === undefined || raw === '' || !Number.isFinite(n) ? fallback : n
  }
  const provider = String(source.AI_PROVIDER || 'openai').toLowerCase()
  return Object.freeze({
    provider,
    apiKey: String(source.AI_API_KEY || '').trim(),
    baseUrl: String(source.AI_BASE_URL || defaultBaseUrl(provider)).replace(/\/+$/, ''),
    model: String(source.AI_MODEL || defaultModel(provider)).trim(),
    maxTokens: num(source.AI_MAX_TOKENS, 1024),
    timeoutMs: num(source.AI_TIMEOUT_MS, 60000),
    rpm: num(source.AI_RPM, 30),
    temperature: num(source.AI_TEMPERATURE, 0.3),
    logDir: String(source.AI_LOG_DIR || '').trim()
  })
}

function defaultBaseUrl(provider) {
  if (provider === 'anthropic') return 'https://api.anthropic.com'
  if (provider === 'ollama') return 'http://localhost:11434/v1'
  return 'https://api.openai.com/v1'
}

function defaultModel(provider) {
  if (provider === 'anthropic') return 'claude-haiku-4-5'
  return 'gpt-4o-mini'
}

/** Resolve the model for a task: per-task env override wins, else default. */
function resolveTaskModel(task, cfg, env) {
  const source = env || process.env
  const key = `AI_MODEL_${String(task || '').toUpperCase()}`
  const override = String((source && source[key]) || '').trim()
  if (override) return override
  return cfg.model
}

/** Sliding-window rate limiter (rpm calls per 60s). */
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = Math.max(1, Number(limit) || 1)
    this.windowMs = Math.max(1, Number(windowMs) || 60000)
    this.stamps = []
  }

  attempt(now) {
    const at = now === undefined ? Date.now() : now
    const cut = at - this.windowMs
    this.stamps = this.stamps.filter(t => t > cut)
    if (this.stamps.length >= this.limit) {
      const waitMs = Math.max(1, this.stamps[0] + this.windowMs - at)
      return { ok: false, retryAfterMs: waitMs }
    }
    this.stamps.push(at)
    return { ok: true, retryAfterMs: 0 }
  }
}

/** Canonical {role, content} messages -> provider request. */
function buildChatRequest(cfg, input) {
  const messages = (input.messages || []).map(m => ({
    role: m.role,
    content: String(m.content ?? '')
  }))
  if (cfg.provider === 'anthropic') {
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: input.model || cfg.model,
        max_tokens: input.maxTokens || cfg.maxTokens,
        temperature: input.temperature !== undefined ? input.temperature : cfg.temperature,
        messages
      }
    }
  }
  const body = {
    model: input.model || cfg.model,
    max_tokens: input.maxTokens || cfg.maxTokens,
    temperature: input.temperature !== undefined ? input.temperature : cfg.temperature,
    messages
  }
  if (input.jsonMode) body.response_format = { type: 'json_object' }
  const headers = { 'content-type': 'application/json' }
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`
  return { url: `${cfg.baseUrl}/chat/completions`, headers, body }
}

/** Provider response JSON -> { content, usage }. Throws AIGatewayError. */
function parseChatResponse(provider, json) {
  if (provider === 'anthropic') {
    const text = json && Array.isArray(json.content)
      ? json.content.filter(b => b && b.type === 'text').map(b => b.text).join('')
      : ''
    if (!text) throw new AIGatewayError('ai.bad-shape', 'Anthropic response has no text content')
    return { content: text, usage: json.usage || null }
  }
  const message = json && json.choices && json.choices[0] && json.choices[0].message
  const content = message && typeof message.content === 'string' ? message.content : ''
  if (!content) throw new AIGatewayError('ai.bad-shape', 'Chat response has no message content')
  return { content, usage: json.usage || null }
}

function excerpt(value, length) {
  const text = String(value ?? '')
  const max = length || 1200
  return text.length > max ? `${text.slice(0, max)}…[+${text.length - max} chars]` : text
}

function appendAudit(logDir, entry) {
  if (!logDir) return
  try {
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'ai.ndjson'), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // audit must never break the call
  }
}

async function postJson(url, headers, body, timeoutMs, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const fetchFn = fetchImpl || fetch
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, json, text }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new AIGatewayError('ai.timeout', `Request timed out after ${timeoutMs}ms`)
    }
    throw new AIGatewayError('ai.network', String((err && err.message) || err))
  } finally {
    clearTimeout(timer)
  }
}

const limiters = new Map()

function limiterFor(key, rpm) {
  const id = `${key}:${rpm}`
  if (!limiters.has(id)) limiters.set(id, new RateLimiter(rpm))
  return limiters.get(id)
}

/**
 * Chat completion. `args`: { provider?, apiKey?, baseUrl?, model?,
 * messages, maxTokens?, temperature?, jsonMode?, task? }.
 * Per-call fields win over env. `opts`: { fetchImpl?, logDir? }.
 */
async function complete(args, opts) {
  const input = args || {}
  const options = opts || {}
  const envCfg = aiConfig()
  const cfg = {
    ...envCfg,
    provider: String(input.provider || envCfg.provider).toLowerCase(),
    apiKey: input.apiKey !== undefined ? String(input.apiKey) : envCfg.apiKey,
    baseUrl: (input.baseUrl !== undefined ? String(input.baseUrl) : envCfg.baseUrl).replace(/\/+$/, ''),
    model: input.model || (input.task ? resolveTaskModel(input.task, envCfg) : envCfg.model)
  }
  if (!input.messages || input.messages.length === 0) {
    throw new AIGatewayError('ai.bad-shape', 'messages must be a non-empty array')
  }
  if (cfg.provider !== 'ollama' && !cfg.apiKey) {
    throw new AIGatewayError('ai.no-key', `Missing API key for provider "${cfg.provider}"`)
  }
  const limiter = limiterFor(cfg.model, envCfg.rpm)
  const gate = limiter.attempt()
  if (!gate.ok) {
    throw new AIGatewayError('ai.rate-limited', `Rate limited, retry after ${gate.retryAfterMs}ms`, { retryAfterMs: gate.retryAfterMs })
  }
  const startedAt = Date.now()
  const request = buildChatRequest(cfg, {
    messages: input.messages,
    model: cfg.model,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    jsonMode: input.jsonMode
  })
  const { status, json, text } = await postJson(request.url, request.headers, request.body, envCfg.timeoutMs, options.fetchImpl)
  if (status === 429) {
    throw new AIGatewayError('ai.rate-limited', 'Provider rate limit (429)')
  }
  if (status < 200 || status >= 300) {
    const message = (json && (json.error?.message || json.message)) || text || `HTTP ${status}`
    throw new AIGatewayError('ai.http-error', String(message).slice(0, 500), { status })
  }
  let parsed
  try {
    parsed = parseChatResponse(cfg.provider, json)
  } catch (err) {
    throw new AIGatewayError('ai.api-error', err.message)
  }
  appendAudit(options.logDir !== undefined ? options.logDir : envCfg.logDir || null, {
    at: new Date(startedAt).toISOString(),
    task: input.task || null,
    provider: cfg.provider,
    model: cfg.model,
    prompt: excerpt(input.messages.map(m => m.content).join('\n')),
    response: excerpt(parsed.content),
    usage: parsed.usage,
    latencyMs: Date.now() - startedAt,
    ok: true
  })
  return { content: parsed.content, usage: parsed.usage, model: cfg.model, latencyMs: Date.now() - startedAt }
}

/**
 * Audio transcription via the OpenAI-compatible endpoint.
 * `args`: { filePath, ...config overrides, model?, language?,
 * format?: 'text' | 'verbose_json' }. Verbose mode also returns
 * timestamped segments for speech-aware scoring (docs section 40).
 */
async function transcribe(args, opts) {
  const input = args || {}
  const options = opts || {}
  const envCfg = aiConfig()
  const cfg = {
    ...envCfg,
    provider: String(input.provider || envCfg.provider).toLowerCase(),
    apiKey: input.apiKey !== undefined ? String(input.apiKey) : envCfg.apiKey,
    baseUrl: (input.baseUrl !== undefined ? String(input.baseUrl) : envCfg.baseUrl).replace(/\/+$/, ''),
    model: input.model || (input.task === 'transcribe' ? resolveTaskModel('transcribe', envCfg) : envCfg.model)
  }
  if (typeof input.filePath !== 'string' || !input.filePath) {
    throw new AIGatewayError('ai.no-file', 'filePath must be a non-empty string')
  }
  let buffer
  try {
    buffer = fs.readFileSync(input.filePath)
  } catch {
    throw new AIGatewayError('ai.no-file', `Cannot read file: ${input.filePath}`)
  }
  if (!cfg.apiKey) {
    throw new AIGatewayError('ai.no-key', `Missing API key for provider "${cfg.provider}"`)
  }
  const form = new FormData()
  form.append('model', cfg.model)
  form.append('file', new Blob([buffer]), path.basename(input.filePath))
  if (input.language) form.append('language', String(input.language))
  const verbose = input.format === 'verbose_json'
  if (verbose) form.append('response_format', 'verbose_json')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(envCfg.timeoutMs, 5 * 60 * 1000))
  try {
    const fetchFn = options.fetchImpl || fetch
    const res = await fetchFn(`${cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: controller.signal
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (res.status === 429) throw new AIGatewayError('ai.rate-limited', 'Provider rate limit (429)')
    if (res.status < 200 || res.status >= 300) {
      throw new AIGatewayError('ai.http-error', String((json && json.error?.message) || text || `HTTP ${res.status}`).slice(0, 500), { status: res.status })
    }
    const transcript = json && typeof json.text === 'string' ? json.text : ''
    if (!transcript) throw new AIGatewayError('ai.bad-shape', 'Transcription response has no text')
    const result = { text: transcript }
    if (verbose && json && Array.isArray(json.segments)) {
      result.segments = json.segments
        .filter(segment => segment && Number.isFinite(segment.start) && Number.isFinite(segment.end))
        .map(segment => ({ start: segment.start, end: segment.end, text: String(segment.text || '') }))
    }
    return result
  } catch (err) {
    if (err instanceof AIGatewayError) throw err
    if (err && err.name === 'AbortError') throw new AIGatewayError('ai.timeout', 'Transcription timed out')
    throw new AIGatewayError('ai.network', String((err && err.message) || err))
  } finally {
    clearTimeout(timer)
  }
}

let auditDir = null

function maskedStatus() {
  const cfg = aiConfig()
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasKey: cfg.apiKey.length > 0,
    rpm: cfg.rpm,
    timeoutMs: cfg.timeoutMs
  }
}

/** Register IPC handlers. Requires Electron (called from main process only). */
function registerAiGateway() {
  const { app, ipcMain } = require('electron')
  try {
    auditDir = path.join(app.getPath('userData'), 'logs')
  } catch {
    auditDir = null
  }
  ipcMain.handle('tools:ai-gateway:complete', async (_event, args) => {
    try {
      const result = await complete(args, { logDir: auditDir })
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, code: err.code || 'ai.network', error: err.message }
    }
  })
  ipcMain.handle('tools:ai-gateway:transcribe', async (_event, args) => {
    try {
      const result = await transcribe(args, {})
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, code: err.code || 'ai.network', error: err.message }
    }
  })
  ipcMain.handle('tools:ai-gateway:getStatus', () => maskedStatus())
}

module.exports = {
  AIGatewayError,
  aiConfig,
  RateLimiter,
  resolveTaskModel,
  buildChatRequest,
  parseChatResponse,
  complete,
  transcribe,
  maskedStatus,
  registerAiGateway
}
