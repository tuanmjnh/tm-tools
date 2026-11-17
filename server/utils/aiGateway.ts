import type { H3Event } from 'h3'
import {
  AIClientError,
  createAIClient,
  findAppConnection,
  mergeCatalog,
  parseAppConnections,
  providerDisplayName,
  toAppCatalogConnection,
  type AppAIConnection,
  type CatalogConnection
} from '@tuanmjnh/tm-ai-client'
import { configuredConnections, findConfiguredConnection } from './aiConfigStore'
import {
  fetchRelayCatalog,
  relayChat,
  type RelayChatResult,
  type RelayMessage
} from './aiRelay'

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

function readLocalRaw(event?: H3Event): string {
  // Nitro maps `NUXT_AI_LOCAL_CONNECTIONS`, while the desktop shell writes
  // `AI_LOCAL_CONNECTIONS` into the process env (same file as the hub secret).
  const runtime = useRuntimeConfig(event).aiLocalConnections
  return runtime || process.env.AI_LOCAL_CONNECTIONS || ''
}

function readLocalConfig(event?: H3Event) {
  const parsed = parseAppConnections(readLocalRaw(event))
  // Configuration errors are surfaced once per call, not silently dropped, so
  // an operator sees why a local connection is missing from the picker.
  if (parsed.errors.length) {
    console.warn('[ai-gateway] AI_LOCAL_CONNECTIONS:', parsed.errors.join('; '))
  }
  return parsed
}

export function localConnections(event?: H3Event): AppAIConnection[] {
  return readLocalConfig(event).connections
}

/**
 * The key never leaves the server. A connection either carries it inline (env
 * file) or names a config slot (`AI_API_KEY_<SUFFIX>`), which the desktop shell
 * keeps encrypted in the OS keychain and exposes through `process.env`.
 */
function resolveApiKey(entry: AppAIConnection): string | undefined {
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
      providerKey: entry.providerKey,
      providerName: providerDisplayName(entry.providerKey),
      baseUrl: entry.baseUrl,
      hasKey: Boolean(resolveApiKey(entry)),
      apiKeyEnv: entry.apiKeyEnv ?? null,
      models: entry.models.map(model => model.modelId)
    })),
    errors
  }
}

export function findLocalConnection(connectionId: string, event?: H3Event): AppAIConnection | undefined {
  return findAppConnection(localConnections(event), connectionId)
}

/** Resolves the key for a local connection; used by the gateway and by tests. */
export function resolveLocalApiKey(entry: AppAIConnection): string | undefined {
  return resolveApiKey(entry)
}

function localConnectionAsCatalog(entry: AppAIConnection): CatalogConnection {
  return toAppCatalogConnection(entry, {
    // Explicitly configured means usable. Local providers (Ollama, LM Studio)
    // are often keyless, and the pickers hide connections without a key.
    hasKey: Boolean(resolveApiKey(entry)) || !entry.apiKeyEnv
  })
}

/**
 * Catalogue = local connections + hub connections, de-duplicated at the model
 * level. App rows come first and keep their `app:` id namespace, so a local
 * connection never hides a hub row that happens to share an id.
 *
 * Local-only installations (no hub enrollment) still get a working picker, so
 * a hub failure is only rethrown when there is nothing local to fall back on.
 *
 * Database first: a signed-in user's per-account rows are the source of truth and env is the
 * bootstrap import; with no signed-in user (background work such as PDF extraction) the same env
 * fallback the gateway always used is returned. An unavailable account store degrades to that env
 * reader instead of failing the catalogue.
 */
export async function fetchAICatalog(event?: H3Event): Promise<CatalogConnection[]> {
  let entries: AppAIConnection[]
  try {
    entries = await configuredConnections(event, readLocalRaw(event))
  } catch (err) {
    console.warn('[ai-gateway] account AI config unavailable; using env:', (err as Error).message)
    entries = readLocalConfig(event).connections
  }
  const local = entries.map(localConnectionAsCatalog)

  let hub: CatalogConnection[] = []
  try {
    hub = await fetchRelayCatalog(event)
  } catch (err) {
    if (!local.length) throw err
    console.warn('[ai-gateway] hub catalogue unavailable; using local connections only')
  }

  return mergeCatalog(hub, local)
}

function localError(err: unknown, entry: AppAIConnection) {
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
 * existing callers only change their import. A catalogue id may carry the
 * `app:` namespace; the configured connection id never does. An unavailable
 * account store degrades to the env reader, so the relay stays reachable.
 */
export async function chatWithConnection(body: GatewayChatBody, event?: H3Event): Promise<RelayChatResult> {
  let entry: AppAIConnection | undefined
  try {
    entry = await findConfiguredConnection(body.connectionId, event, readLocalRaw(event))
  } catch (err) {
    console.warn('[ai-gateway] account AI config unavailable; using env:', (err as Error).message)
    entry = findLocalConnection(body.connectionId, event)
  }
  if (!entry) return relayChat(body, event)

  const messages = body.systemPrompt?.trim()
    ? [{ role: 'system' as const, content: body.systemPrompt.trim() }, ...body.messages]
    : body.messages

  const client = createAIClient({
    endpoint: {
      provider: entry.providerKey,
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
