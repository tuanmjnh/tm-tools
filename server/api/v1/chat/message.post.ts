import type { ChatAttachment } from '#shared/types/chat'
import { CHAT_ATTACHMENT_LIMIT, CHAT_ATTACHMENT_TEXT_LIMIT } from '#shared/utils/chat'
import { relayChat, type RelayMessage } from '../../../utils/aiRelay'
import { requireChatUser, requireChatWrite } from '../../../utils/chatAuth'
import { deriveTitle, getChatStore, CHAT_HISTORY_WINDOW } from '../../../modules/chat/store'

function badRequest(message: string) {
  return createError({ statusCode: 400, statusMessage: 'error.bad_request', message })
}

function parseAttachments(raw: unknown): ChatAttachment[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) throw badRequest('Attachments must be an array')
  if (raw.length === 0) return undefined
  if (raw.length > CHAT_ATTACHMENT_LIMIT) throw badRequest('Too many attachments')

  const attachments: ChatAttachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw badRequest('Invalid attachment')
    const record = item as Record<string, unknown>
    const name = String(record.name || '').trim()
    if (!name) throw badRequest('Attachment name is required')

    const kind = record.kind
    if (kind !== 'text' && kind !== 'image') throw badRequest('Invalid attachment kind')

    const content = typeof record.content === 'string' ? record.content : undefined
    const url = typeof record.url === 'string' ? record.url : undefined

    if (kind === 'text') {
      if (!content) throw badRequest('Attachment content is required')
      if (content.length > CHAT_ATTACHMENT_TEXT_LIMIT) throw badRequest('Attachment content is too large')
    } else {
      if (!url) throw badRequest('Attachment URL is required')
      let protocol: string
      try {
        protocol = new URL(url).protocol
      } catch {
        throw badRequest('Invalid attachment URL')
      }
      if (protocol !== 'https:') throw badRequest('Attachment URL must use HTTPS')
    }

    attachments.push({
      name: name.slice(0, 200),
      type: String(record.type || '').slice(0, 120),
      size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined,
      kind,
      content,
      url
    })
  }

  return attachments
}

function buildRelayContent(content: string, attachments?: ChatAttachment[]): string {
  if (!attachments?.length) return content
  const blocks = attachments.map((attachment) => {
    if (attachment.kind === 'text') {
      return `--- Attached file: ${attachment.name} ---\n${attachment.content || ''}`
    }
    return `--- Attached image: ${attachment.name}${attachment.url ? ` (${attachment.url})` : ''} ---`
  }).join('\n\n')
  return content ? `${content}\n\n${blocks}` : blocks
}

export default defineEventHandler(async (event) => {
  const auth = requireChatUser(event)
  requireChatWrite(auth)

  const body = await readBody<{
    conversationId?: unknown
    connectionId?: unknown
    model?: unknown
    message?: unknown
    systemPrompt?: unknown
    attachments?: unknown
  }>(event) || {}

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : ''
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : ''
  const attachments = parseAttachments(body.attachments)

  if (!message && !attachments?.length) {
    throw badRequest('Message cannot be empty')
  }
  if (!connectionId || !model) {
    throw badRequest('connectionId and model are required')
  }

  const store = getChatStore()
  const titleSeed = message || attachments?.[0]?.name || ''

  // The conversation is created before the provider call so a thread keeps its
  // own title, but any failure after that point must not leave an empty row
  // behind: the user never saw a stored turn.
  let conversation = conversationId ? store.getConversation(auth.userId, conversationId) : null
  const isNewConversation = !conversation
  if (!conversation) {
    conversation = store.createConversation({
      userId: auth.userId,
      appId: auth.appId,
      title: deriveTitle(titleSeed),
      connectionId,
      model
    })
  }

  try {
    const existing = store.listMessages(auth.userId, conversation.id, CHAT_HISTORY_WINDOW)
    const relayMessages: RelayMessage[] = existing
      .filter(entry => entry.role === 'user' || entry.role === 'assistant')
      .map(entry => ({
        role: entry.role as 'user' | 'assistant',
        content: buildRelayContent(entry.content, entry.attachments)
      }))
    relayMessages.push({ role: 'user', content: buildRelayContent(message, attachments) })

    const result = await relayChat({
      connectionId,
      model,
      messages: relayMessages,
      systemPrompt,
      temperature: 0.7,
      maxTokens: 2048
    })

    const userMessage = store.appendMessage({
      conversationId: conversation.id,
      userId: auth.userId,
      role: 'user',
      content: message,
      attachments,
      model,
      connectionId
    })
    const assistantMessage = store.appendMessage({
      conversationId: conversation.id,
      userId: auth.userId,
      role: 'assistant',
      content: result.content,
      model: result.model || model,
      connectionId,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens
    })
    store.touchConversation(conversation.id, result.model || model, connectionId)

    return {
      success: true,
      data: {
        conversationId: conversation.id,
        title: conversation.title,
        userMessage,
        assistantMessage
      }
    }
  } catch (err: unknown) {
    if (isNewConversation) {
      store.deleteConversation(auth.userId, conversation.id)
    }
    throw err
  }
})
