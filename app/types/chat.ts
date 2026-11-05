import type { ChatAttachment } from '#shared/types/chat'
import type { ConversationColor } from '#shared/utils/chat'

export interface AvailableModel {
  connectionId: string
  connectionName: string
  provider: string
  modelId: string
  displayName: string
  isPrimary?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: ChatAttachment[]
  createdAt: string | Date
  model?: string | null
  connectionId?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  usage?: {
    inputTokens?: number | null
    outputTokens?: number | null
  }
}

export interface ConversationItem {
  id: string
  title: string
  model: string
  connectionId: string
  messageCount: number
  lastMessageAt: string | Date
  createdAt: string | Date
  archived: boolean
  color: ConversationColor
}

export interface SendMessageResponse {
  conversationId: string
  title: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export interface ConversationMessagesPage {
  messages: ChatMessage[]
  hasMore: boolean
  nextCursor: string | null
}
