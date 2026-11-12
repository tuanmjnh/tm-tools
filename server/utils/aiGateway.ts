import type { H3Event } from 'h3'
import { AIClientError, createAIClient } from '@tuanmjnh/tm-ai-client'
import {
  fetchRelayCatalog,
  relayChat,
  type RelayCatalogConnection,
  type RelayChatResult,
  type RelayMessage
} from './aiRelay'
import {
  findAILocalConnection,
  parseAILocalConnections,
  type AILocalConnectionConfig
} from '#shared/utils/aiLocalConnections'

/**
 * AI gateway: one call site for chat + catalogue, two execution modes.
 *
 * - `hub`   (default): the request goes through the TM Hub relay, which owns
 *   the credential and the provider allow-list.
 * - `local`: the connection is explicitly configured for this machine
 *   (`AI_LOCAL_CONNECTIONS`), so tm-tools calls the provider itself with
 *   `@tuanmjnh/tm-ai-client`. The hub never sees the key and never proxies it.
 *
 * `event` stays optional because background work (PDF extraction) keeps
 * running after the request that started it.
 */
export interface GatewayChatBody {
  connectionId: string
  model: string
  messages: RelayMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

function readLocalConfig(event?: H3Event) {
  // Nitro maps `NUXT_AI_LOCAL_CONNECTIONS`, while the desktop shell writes
  // `AI_LOCAL_CONNECTIONS` into the process env (same file as the hub secret).
  const runtime = useRuntimeConfig(event).aiLocalConnections
  const raw = runtime || process.env.AI_LOCAL_CONNECTIONS || ''
  const parsed = parseAILocalConnections(raw)
  // Configuration errors are surfaced once per call, not silently dropped, so
  // an operator sees why a local connection is missing from the picker.
  if (parsed.errors.length) {
    console.warn('[ai-gateway] AI_LOCAL_CONNECTIONS:', parsed.errors.join('; '))
  }
  return parsed
}

export function localConnections(event?: H3Event): AILocalConnectionConfig[] {
  return readLocalConfig(event).connections
}

/**
 * The key never leaves the server. A connection either carries it inline (env
 * file) or names a config slot (`AI_API_KEY_<SUFFIX>`), which the desktop shell
 * keeps encrypted in the OS keychain and exposes through `process.env`.
 */
function resolveApiKey(entry: AILocalConnectionConfig): string | undefined {
  if (entry.apiKey) return entry.apiKey
  if (entry.apiKeyEnv) return String(process.env[entry.apiKeyEnv] || '').trim() || undefined
  return undefined
}

/** Exposed for the settings surface: mode + whether a key is present (never the key). */
export function describeLocalConnections(event?: H3Event) {
  const { connections, errors } = readLocalConfig(event)
  return {
    connections: connections.map(entry => ({
      connectionId: entry.connectionId,
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      hasKey: Boolean(resolveApiKey(entry)),
      apiKeyEnv: entry.apiKeyEnv ?? null,
      models: (entry.models || []).map(model => model.modelId)
    })),
    errors
  }
}

export function findLocalConnection(connectionId: string, event?: H3Event): AILocalConnectionConfig | undefined {
  return findAILocalConnection(localConnections(event), connectionId)
}

/** Resolves the key for a local connection; used by the gateway and by tests. */
export function resolveLocalApiKey(entry: AILocalConnectionConfig): string | undefined {
  return resolveApiKey(entry)
}

function localConnectionAsCatalog(entry: AILocalConnectionConfig): RelayCatalogConnection {
  const models = (entry.models || []).map(model => ({
    modelId: model.modelId,
    displayName: model.displayName || model.modelId
  }))
  return {
    connectionId: entry.connectionId,
    provider: entry.provider,
    name: `${entry.provider} (local)`,
    adapterType: entry.provider,
    // Explicitly configured means usable. Local providers (Ollama, LM Studio)
    // are often keyless, and the pickers hide connections without a key.
    hasKey: Boolean(resolveApiKey(entry)) || !entry.apiKeyEnv,
    model: models[0]?.modelId ?? null,
    models
  }
}

/**
 * Catalogue = hub connections + explicitly configured local connections.
 *
 * Local-only installations (no hub enrollment) still get a working picker, so
 * a hub failure is only rethrown when there is nothing local to fall back on.
 */
export async function fetchAICatalog(event?: H3Event): Promise<RelayCatalogConnection[]> {
  const local = localConnections(event).map(localConnectionAsCatalog)

  let hub: RelayCatalogConnection[] = []
  try {
    hub = await fetchRelayCatalog(event)
  } catch (err) {
    if (!local.length) throw err
    console.warn('[ai-gateway] hub catalogue unavailable; using local connections only')
  }

  const localIds = new Set(local.map(entry => entry.connectionId))
  return [...local, ...hub.filter(entry => !localIds.has(entry.connectionId))]
}

function localError(err: unknown, entry: AILocalConnectionConfig) {
  if (err instanceof AIClientError) {
    const detail = err.message || err.code
    switch (err.code) {
      case 'ai.rate-limited':
        return createError({ statusCode: 429, statusMessage: 'error.aiRateLimited', message: detail })
      case 'ai.timeout':
        return createError({ statusCode: 408, statusMessage: 'error.aiTimeout', message: detail })
      case 'ai.no-key':
        return createError({
          statusCode: 503,
          statusMessage: 'error.aiLocalKeyMissing',
          message: `Local connection "${entry.connectionId}" needs an apiKey`
        })
      case 'ai.aborted':
        return createError({ statusCode: 499, statusMessage: 'error.aiAborted', message: detail })
      default:
        return createError({
          statusCode: err.status && err.status >= 400 ? err.status : 502,
          statusMessage: 'error.aiLocalUpstreamFailed',
          message: detail,
          data: { detail }
        })
    }
  }
  return createError({
    statusCode: 502,
    statusMessage: 'error.aiLocalUpstreamFailed',
    message: String((err as Error)?.message || err),
    data: { detail: String((err as Error)?.message || err) }
  })
}

/**
 * Chat through the mode that owns the connection. Signature is the relay's, so
 * existing callers only change their import.
 */
export async function chatWithConnection(body: GatewayChatBody, event?: H3Event): Promise<RelayChatResult> {
  const entry = findLocalConnection(body.connectionId, event)
  if (!entry) return relayChat(body, event)

  const messages = body.systemPrompt?.trim()
    ? [{ role: 'system' as const, content: body.systemPrompt.trim() }, ...body.messages]
    : body.messages

  const client = createAIClient({
    endpoint: {
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      apiKey: resolveApiKey(entry),
      mode: 'local'
    },
    // The server is the machine that hosts the connection; configuration is
    // explicit, so no extra mode policy is needed here.
    assertModeAllowed: () => {}
  })

  try {
    const result = await client.chat({
      model: body.model,
      messages: messages.map(message => ({
        role: message.role,
        // Attachments are relay-only: the hub renders them for the provider.
        // A local provider call receives the same text the relay would build.
        content: message.attachments?.length
          ? `${message.content}\n\n${message.attachments
              .map(attachment => attachment.mimeType.startsWith('image/')
                ? `--- Attached image (${attachment.mimeType}) ---`
                : `--- Attached file (${attachment.mimeType}) ---\n${attachment.data}`)
              .join('\n\n')}`
          : message.content
      })),
      maxTokens: body.maxTokens,
      temperature: body.temperature
    })

    return {
      ok: true,
      content: result.content,
      provider: result.provider,
      model: result.model,
      usage: result.usage
        ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
        : null
    }
  } catch (err) {
    throw localError(err, entry)
  }
}
