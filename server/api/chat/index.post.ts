import { config } from '../../config/index'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface GeminiContent {
  role?: 'user' | 'model'
  parts: Array<{ text: string }>
}

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const hasWrite = auth.role === 'root' || auth.permissions?.includes('chat:write')
  if (!hasWrite) throw createError({ statusCode: 403, statusMessage: 'You do not have permission to use the chat' })

  const body = await readBody<{ messages?: ChatMessage[] }>(event)
  const messages = (body?.messages || []).filter(
    m => m && typeof m.content === 'string' && m.content.trim().length > 0
  )

  if (messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  const provider = (config.ai.provider || 'gemini').toLowerCase()
  const apiKey = config.ai.apiKey
  if (!apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'AI API key is not configured' })
  }

  try {
    if (provider === 'gemini') {
      return await handleGemini(messages, apiKey)
    }

    return await handleOpenAICompatible(provider, messages, apiKey)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw createError({ statusCode: 502, statusMessage: `AI request failed: ${message}` })
  }
})

async function handleGemini(messages: ChatMessage[], apiKey: string) {
  const model = config.ai.model || 'gemini-2.0-flash'

  const contents: GeminiContent[] = messages.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user'
    return {
      role,
      parts: [{ text: m.content }]
    }
  })

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini API ${res.status}: ${text}`)
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  }

  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  if (!text) throw new Error('Gemini returned an empty response')

  return {
    success: true,
    data: {
      provider: 'gemini',
      model,
      message: { role: 'assistant', content: text }
    }
  }
}

async function handleOpenAICompatible(provider: string, messages: ChatMessage[], apiKey: string) {
  const baseUrl = config.ai.baseUrl
  if (!baseUrl) {
    throw new Error(`${provider} requires a base URL. Configure it in Settings > Connections`)
  }

  const model = config.ai.model
  if (!model) {
    throw new Error(`${provider} requires a model name. Configure it in Settings > Connections`)
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${provider} API ${res.status}: ${text}`)
  }

  const data = await res.json() as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  const text = data.choices?.[0]?.message?.content || ''
  if (!text) throw new Error(`${provider} returned an empty response`)

  return {
    success: true,
    data: {
      provider,
      model,
      message: { role: 'assistant', content: text }
    }
  }
}
