import { defineEventHandler, readBody, createError } from 'h3'
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
    const [conn, ...rest] = body.modelKey.split(':')
    if (conn && rest.length > 0) {
      connectionId = conn
      model = rest.join(':')
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
