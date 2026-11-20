import type { ChatAttachment } from '#shared/types/chat'
import type { ConversationColor } from '#shared/utils/chat'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface StoredMessage {
  id: string
  conversationId: string
  role: ChatRole
  content: string
  attachments?: ChatAttachment[]
  model: string | null
  connectionId: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

export interface StoredConversation {
  id: string
  title: string
  model: string
  connectionId: string
  messageCount: number
  lastMessageAt: string
  createdAt: string
  archived: boolean
  color: ConversationColor
}

export interface CreateConversationInput {
  userId: string
  appId?: string
  title: string
  connectionId: string
  model: string
}

export interface AppendMessageInput {
  conversationId: string
  userId: string
  role: ChatRole
  content: string
  attachments?: ChatAttachment[]
  model?: string
  connectionId?: string
  inputTokens?: number
  outputTokens?: number
}

export interface UpdateConversationInput {
  title?: string
  archived?: boolean
  color?: ConversationColor
}

export interface MessagePage {
  messages: StoredMessage[]
  hasMore: boolean
  nextCursor: string | null
}

/**
 * Persistence contract for /chat. Both backends implement it so the routes stay
 * backend-agnostic; Mongo is required on a hosted runtime (no native modules and
 * no writable disk), SQLite backs the desktop app where history must survive
 * offline.
 *
 * Every method is scoped by userId, so one account can never read or delete
 * another account's history even when it knows a conversation id.
 */
export interface ChatRepository {
  listConversations(userId: string): Promise<StoredConversation[]>
  getConversation(userId: string, conversationId: string): Promise<StoredConversation | null>
  createConversation(input: CreateConversationInput): Promise<StoredConversation>
  appendMessage(input: AppendMessageInput): Promise<StoredMessage>
  deleteMessage(userId: string, messageId: string): Promise<void>
  listMessages(userId: string, conversationId: string, limit?: number): Promise<StoredMessage[]>
  listMessagePage(userId: string, conversationId: string, options: { limit: number, before?: string }): Promise<MessagePage>
  updateConversation(userId: string, conversationId: string, patch: UpdateConversationInput): Promise<StoredConversation | null>
  touchConversation(conversationId: string, model: string, connectionId: string): Promise<void>
  deleteConversation(userId: string, conversationId: string): Promise<boolean>
  close(): Promise<void>
}

export const TITLE_MAX_LENGTH = 60

export function deriveTitle(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= TITLE_MAX_LENGTH) return line || 'Untitled chat'
  return `${line.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
}

export const CHAT_HISTORY_WINDOW = 40
