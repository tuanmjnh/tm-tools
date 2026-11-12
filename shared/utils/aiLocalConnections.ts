/**
 * Local AI connection configuration (Hybrid AI, mode = `local`).
 *
 * A local connection is a provider endpoint reachable from the machine that
 * runs tm-tools (Ollama, LM Studio, FreeLLMAPI, ...). The hub never holds its
 * key, and the hub relay never calls it: tm-tools executes the request itself.
 *
 * Configured explicitly through `AI_LOCAL_CONNECTIONS` (server runtime env) as
 * a JSON array. Nothing is inferred from the URL alone, so a hosted tm-tools
 * cannot silently start calling somebody's loopback address.
 */
export interface AILocalConnectionConfig {
  connectionId: string
  provider: string
  baseUrl: string
  /** Inline key, for env-file-only setups. Prefer `apiKeyEnv` on desktop. */
  apiKey?: string
  /** Config slot holding the key (`AI_API_KEY` / `AI_API_KEY_<SUFFIX>`), encrypted at rest. */
  apiKeyEnv?: string
  models?: Array<{ modelId: string, displayName?: string }>
}

export interface AILocalConfigParseResult {
  connections: AILocalConnectionConfig[]
  errors: string[]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Pure and strict: a malformed entry is reported, never partially accepted,
 * because a half-configured connection would fail later inside a chat call
 * where the reason is much harder to see.
 */
export function parseAILocalConnections(raw: unknown): AILocalConfigParseResult {
  const errors: string[] = []
  if (raw === undefined || raw === null || raw === '') return { connections: [], errors }

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { connections: [], errors }
    try {
      parsed = JSON.parse(text)
    } catch (err: unknown) {
      return { connections: [], errors: [`AI_LOCAL_CONNECTIONS is not valid JSON: ${(err as Error)?.message || 'parse error'}`] }
    }
  }

  if (!Array.isArray(parsed)) {
    return { connections: [], errors: ['AI_LOCAL_CONNECTIONS must be a JSON array'] }
  }

  const seen = new Set<string>()
  const connections: AILocalConnectionConfig[] = []

  parsed.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`entry ${index}: must be an object`)
      return
    }
    const record = entry as Record<string, unknown>
    const connectionId = asString(record.connectionId)
    const provider = asString(record.provider) || 'openai-compatible'
    const baseUrl = normalizeBaseUrl(asString(record.baseUrl))
    const apiKey = asString(record.apiKey) || undefined
    const apiKeyEnv = asString(record.apiKeyEnv) || undefined

    if (!connectionId) {
      errors.push(`entry ${index}: connectionId is required`)
      return
    }
    if (!baseUrl) {
      errors.push(`entry ${index}: baseUrl is required`)
      return
    }
    if (!isHttpUrl(baseUrl)) {
      errors.push(`entry ${index}: baseUrl must be an http(s) URL`)
      return
    }
    if (apiKeyEnv && !/^AI_API_KEY(_[A-Z0-9_]+)?$/.test(apiKeyEnv)) {
      errors.push(`entry ${index}: apiKeyEnv must be AI_API_KEY or AI_API_KEY_<SUFFIX>`)
      return
    }
    if (seen.has(connectionId)) {
      errors.push(`entry ${index}: duplicate connectionId "${connectionId}"`)
      return
    }

    const models = Array.isArray(record.models)
      ? record.models
          .map((model) => {
            if (typeof model === 'string') return { modelId: model.trim() }
            if (model && typeof model === 'object') {
              const item = model as { modelId?: unknown, id?: unknown, displayName?: unknown }
              return {
                modelId: asString(item.modelId) || asString(item.id),
                displayName: asString(item.displayName) || undefined
              }
            }
            return { modelId: '' }
          })
          .filter(model => model.modelId)
      : undefined

    seen.add(connectionId)
    connections.push({ connectionId, provider, baseUrl, apiKey, apiKeyEnv, models })
  })

  return { connections, errors }
}

/** Finds a configured local connection by id. */
export function findAILocalConnection(
  connections: AILocalConnectionConfig[],
  connectionId: string
): AILocalConnectionConfig | undefined {
  const id = asString(connectionId)
  if (!id) return undefined
  return connections.find(entry => entry.connectionId === id)
}
