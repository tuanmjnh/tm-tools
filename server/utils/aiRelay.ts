import type { H3Event } from 'h3'
import { config } from '#server/config'

export interface RelayAttachment {
  mimeType: string
  /** base64 without the `data:` prefix. */
  data: string
}

export interface RelayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: RelayAttachment[]
}

export interface RelayCatalogModel {
  modelId: string
  displayName: string
}

export interface RelayCatalogConnection {
  connectionId: string
  provider: string
  name: string
  adapterType: string
  hasKey: boolean
  model: string | null
  models: RelayCatalogModel[]
}

export interface RelayChatResult {
  ok: boolean
  content: string
  provider: string
  model: string
  usage: { inputTokens?: number, outputTokens?: number } | null
}

interface RelayErrorBody {
  message?: string
  statusMessage?: string
  data?: { detail?: string } | null
}

export class RelayNotConfiguredError extends Error {
  constructor() {
    super('AI relay is not configured on this server (NUXT_HUB_APP_SECRET missing)')
    this.name = 'RelayNotConfiguredError'
  }
}

/**
 * `event` is optional on purpose: background work (a PDF extraction job) keeps
 * running after the request that started it, and Nitro can still resolve the
 * runtime config without a live event.
 */
function relayTarget(event?: H3Event): { url: string, headers: Record<string, string> } {
  const runtime = useRuntimeConfig(event)
  // `config.hub` reads process.env on every call, so a secret saved in the
  // desktop settings applies without a restart. The runtime config snapshot
  // only carries whatever the process started with.
  const hubUrl = String(config.hub.url || runtime.public.hubUrl || '').replace(/\/+$/, '')
  const hubAppId = String(config.hub.appId || runtime.public.hubAppId || '')
  const hubAppSecret = String(config.hub.appSecret || runtime.hubAppSecret || '')
  if (!hubUrl || !hubAppId || !hubAppSecret) throw new RelayNotConfiguredError()

  return {
    url: `${hubUrl}/api/v1/apps/${hubAppId}/ai/relay`,
    headers: { 'X-App-Id': hubAppId, 'X-App-Secret': hubAppSecret }
  }
}

/**
 * Hub relay answers provider failures with a stable code in `message` and the
 * upstream reason in `data.detail`. Forwarding only the code would hide which
 * provider call actually failed, so both survive the trip to the renderer.
 */
export function relayUpstreamError(
  err: unknown,
  fallback: string
): { statusCode: number, statusMessage: string, message: string, data: { detail: string } } {
  const body = (err as { data?: RelayErrorBody })?.data ?? {}
  const upstream = (err as { statusCode?: number })?.statusCode
  const detail = String(body.data?.detail ?? '').trim()
  const code = String(body.message ?? '').trim()
  const status = typeof upstream === 'number' && upstream >= 400 ? upstream : 502

  // A 401/403 here is TM Hub refusing this app's own credentials, not the
  // signed-in user. Forwarding that status would make the client wrapper treat
  // it as an expired session — refresh the token, replay, then sign the user
  // out — so report it as an upstream failure the admin has to fix instead.
  if (status === 401 || status === 403) {
    return {
      statusCode: 502,
      statusMessage: 'error.aiRelayUnauthorized',
      message: 'error.aiRelayUnauthorized',
      data: { detail: detail || code || fallback }
    }
  }

  return {
    statusCode: status,
    statusMessage: body.statusMessage || code || 'error.aiFailed',
    message: code || fallback,
    data: { detail: detail || code || fallback }
  }
}

/** Turns a missing relay configuration into an admin-facing code, not a 500. */
function relayTargetOrThrow(event?: H3Event): { url: string, headers: Record<string, string> } {
  try {
    return relayTarget(event)
  } catch (err: unknown) {
    if (err instanceof RelayNotConfiguredError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'error.aiRelayNotConfigured',
        message: err.message
      })
    }
    throw err
  }
}

export async function fetchRelayCatalog(event?: H3Event): Promise<RelayCatalogConnection[]> {
  const target = relayTargetOrThrow(event)
  try {
    const res = await $fetch<{
      success: boolean
      data: { connections?: RelayCatalogConnection[] }
    }>(`${target.url}/catalog`, { headers: target.headers })
    return res?.data?.connections ?? []
  } catch (err: unknown) {
    throw createError(relayUpstreamError(err, 'AI relay catalogue upstream failed'))
  }
}

export async function relayChat(body: {
  connectionId: string
  model: string
  messages: RelayMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}, event?: H3Event): Promise<RelayChatResult> {
  const target = relayTargetOrThrow(event)
  const messages: RelayMessage[] = body.systemPrompt?.trim()
    ? [{ role: 'system', content: body.systemPrompt.trim() }, ...body.messages]
    : body.messages

  try {
    const res = await $fetch<{ success: boolean, data: RelayChatResult }>(`${target.url}/chat`, {
      method: 'POST',
      headers: target.headers,
      body: {
        connectionId: body.connectionId,
        model: body.model,
        messages,
        maxTokens: body.maxTokens,
        temperature: body.temperature
      }
    })
    if (!res?.data?.content) throw new Error('AI relay returned an empty response')
    return res.data
  } catch (err: unknown) {
    throw createError(relayUpstreamError(err, 'AI relay upstream failed'))
  }
}
