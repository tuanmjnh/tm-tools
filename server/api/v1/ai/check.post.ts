import { defineEventHandler, readBody, createError } from 'h3'
import { stripAppCatalogId } from '@tuanmjnh/tm-ai-client'
import { chatWithConnection } from '#server/utils/aiGateway'
import { parseUpstreamAiError } from '#shared/utils/aiError'

interface CheckModelBody {
  connectionId?: string
  model?: string
  modelKey?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CheckModelBody>(event).catch(() => ({} as CheckModelBody))
  let connectionId = String(body?.connectionId || '').trim()
  let model = String(body?.model || '').trim()

  if ((!connectionId || !model) && typeof body?.modelKey === 'string') {
    // Catalogue ids are `<connectionId>:<modelId>`; an app-local id carries
    // the `app:` namespace first. Splitting on the first colon keeps model ids
    // that contain one (`llama3.2:latest`) intact.
    const key = stripAppCatalogId(body.modelKey)
    const separator = key.indexOf(':')
    if (separator > 0) {
      connectionId = key.slice(0, separator)
      model = key.slice(separator + 1)
    }
  }

  if (!connectionId || !model) {
    throw createError({
      statusCode: 400,
      statusMessage: 'error.bad_request',
      message: 'connectionId and model are required'
    })
  }

  const start = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('AI model check timed out after 10s')
      ;(err as { statusCode?: number }).statusCode = 408
      reject(err)
    }, 10_000)
  })

  try {
    const result = await Promise.race([
      chatWithConnection({
        connectionId,
        model,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
        temperature: 0.1
      }, event),
      timeoutPromise
    ])
    if (timer) clearTimeout(timer)

    const latencyMs = Date.now() - start
    return {
      success: true,
      data: {
        ok: true,
        latencyMs,
        model: result.model || model,
        provider: result.provider
      }
    }
  } catch (err: unknown) {
    if (timer) clearTimeout(timer)
    const latencyMs = Date.now() - start
    const errorObj = err as { statusCode?: number, statusMessage?: string, message?: string, data?: { detail?: string } }
    const status = typeof errorObj.statusCode === 'number' ? errorObj.statusCode : 500
    const detail = errorObj.data?.detail || errorObj.message || errorObj.statusMessage || 'AI model check failed'
    const { cleanMessage, reasonCode } = parseUpstreamAiError(detail, status)

    return {
      success: true,
      data: {
        ok: false,
        latencyMs,
        status,
        reasonCode,
        error: cleanMessage,
        rawError: detail
      }
    }
  }
})
