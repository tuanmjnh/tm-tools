import { randomUUID } from 'node:crypto'
import type { ChatAttachment } from '#shared/types/chat'
import type { ConversationColor } from '#shared/utils/chat'
import type {
  AppendMessageInput,
  ChatRepository,
  CreateConversationInput,
  MessagePage,
  StoredConversation,
  StoredMessage,
  UpdateConversationInput
} from './types'

/**
 * Mongo-backed chat history.
 *
 * A hosted runtime has no writable disk and cannot load the native sqlite
 * binding, so the same contract the desktop store implements is served from
 * documents. Conversations and messages live in two collections; the message
 * count and last activity are derived on read, exactly like the SQL join, so
 * both backends answer identically.
 */

/**
 * The driver surface this repository needs. It deliberately avoids the cursor
 * chain (`sort`/`limit`) so the same shape works behind the async connection
 * proxy used in production, where a collection is only reachable after an
 * await; ordering and windowing happen in memory.
 */
export interface ChatCollectionLike {
  createIndex(spec: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
  insertOne(doc: Record<string, unknown>): Promise<unknown>
  findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>
  find(filter: Record<string, unknown>): { toArray(): Promise<Record<string, unknown>[]> }
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>
  deleteOne(filter: Record<string, unknown>): Promise<unknown>
  deleteMany(filter: Record<string, unknown>): Promise<unknown>
}

export interface ChatDatabaseLike {
  collection(name: string): ChatCollectionLike
}

interface ConversationDoc {
  _id: string
  userId: string
  appId: string | null
  title: string
  connectionId: string
  model: string
  archived: boolean
  color: ConversationColor
  createdAt: string
  updatedAt: string
}

interface MessageDoc {
  _id: string
  conversationId: string
  userId: string
  role: StoredMessage['role']
  content: string
  attachments: ChatAttachment[] | null
  model: string | null
  connectionId: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
  seq: number
}

function toConversation(doc: ConversationDoc, stats: { messageCount: number, lastMessageAt: string | null }): StoredConversation {
  return {
    id: doc._id,
    title: doc.title,
    model: doc.model,
    connectionId: doc.connectionId,
    messageCount: stats.messageCount,
    lastMessageAt: stats.lastMessageAt || doc.createdAt,
    createdAt: doc.createdAt,
    archived: Boolean(doc.archived),
    color: (doc.color || 'neutral') as ConversationColor
  }
}

function toMessage(doc: MessageDoc): StoredMessage {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    role: doc.role,
    content: doc.content,
    attachments: doc.attachments ?? undefined,
    model: doc.model,
    connectionId: doc.connectionId,
    inputTokens: doc.inputTokens,
    outputTokens: doc.outputTokens,
    createdAt: doc.createdAt
  }
}

export function createMongoChatStore(db: ChatDatabaseLike): ChatRepository {
  const conversations = db.collection('chat_conversations')
  const messages = db.collection('chat_messages')

  let indexesReady: Promise<unknown> | null = null
  function ensureIndexes(): Promise<unknown> {
    if (!indexesReady) {
      indexesReady = Promise.all([
        conversations.createIndex({ userId: 1, updatedAt: -1 }),
        messages.createIndex({ conversationId: 1, userId: 1, createdAt: 1, seq: 1 })
      ])
    }
    return indexesReady
  }

  async function statsFor(userId: string, conversationId: string): Promise<{ messageCount: number, lastMessageAt: string | null }> {
    const rows = await messages.find({ conversationId, userId }).toArray() as unknown as MessageDoc[]
    if (!rows.length) return { messageCount: 0, lastMessageAt: null }
    let latest = rows[0]!.createdAt
    for (const row of rows) {
      if (row.createdAt > latest) latest = row.createdAt
    }
    return { messageCount: rows.length, lastMessageAt: latest }
  }

  return {
    async listConversations(userId) {
      await ensureIndexes()
      const docs = await conversations.find({ userId }).toArray() as unknown as ConversationDoc[]
      const enriched = await Promise.all(docs.map(async (doc) => {
        const stats = await statsFor(userId, doc._id)
        return { doc, stats }
      }))
      enriched.sort((left, right) => {
        if (Boolean(left.doc.archived) !== Boolean(right.doc.archived)) {
          return left.doc.archived ? 1 : -1
        }
        const leftAt = left.stats.lastMessageAt || left.doc.createdAt
        const rightAt = right.stats.lastMessageAt || right.doc.createdAt
        return leftAt < rightAt ? 1 : leftAt > rightAt ? -1 : 0
      })
      return enriched.map(entry => toConversation(entry.doc, entry.stats))
    },

    async getConversation(userId, conversationId) {
      await ensureIndexes()
      const doc = await conversations.findOne({ _id: conversationId, userId }) as unknown as ConversationDoc | null
      if (!doc) return null
      return toConversation(doc, await statsFor(userId, conversationId))
    },

    async createConversation(input: CreateConversationInput) {
      await ensureIndexes()
      const now = new Date().toISOString()
      const doc: ConversationDoc = {
        _id: randomUUID(),
        userId: input.userId,
        appId: input.appId ?? null,
        title: input.title,
        connectionId: input.connectionId,
        model: input.model,
        archived: false,
        color: 'neutral',
        createdAt: now,
        updatedAt: now
      }
      await conversations.insertOne({ ...doc })
      return toConversation(doc, { messageCount: 0, lastMessageAt: null })
    },

    async appendMessage(input: AppendMessageInput) {
      await ensureIndexes()
      const existing = await messages.find({ conversationId: input.conversationId, userId: input.userId }).toArray() as unknown as MessageDoc[]
      const seq = existing.reduce((max, row) => Math.max(max, row.seq ?? 0), 0) + 1
      const now = new Date().toISOString()
      const doc: MessageDoc = {
        _id: randomUUID(),
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role,
        content: input.content,
        attachments: input.attachments?.length ? input.attachments : null,
        model: input.model ?? null,
        connectionId: input.connectionId ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        createdAt: now,
        seq
      }
      await messages.insertOne({ ...doc })
      return toMessage(doc)
    },

    async deleteMessage(userId, messageId) {
      await messages.deleteOne({ _id: messageId, userId })
    },

    async listMessages(userId, conversationId, limit) {
      await ensureIndexes()
      const docs = await messages.find({ conversationId, userId }).toArray() as unknown as MessageDoc[]
      const ordered = docs.sort((left, right) => {
        if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1
        return left.seq - right.seq
      })
      const windowed = limit ? ordered.slice(Math.max(ordered.length - limit, 0)) : ordered
      return windowed.map(toMessage)
    },

    async listMessagePage(userId, conversationId, options): Promise<MessagePage> {
      await ensureIndexes()
      const docs = await messages.find({ conversationId, userId }).toArray() as unknown as MessageDoc[]
      const ordered = docs.sort((left, right) => {
        if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1
        return left.seq - right.seq
      })

      let end = ordered.length
      if (options.before) {
        const index = ordered.findIndex(row => row._id === options.before)
        // A stale cursor (deleted or foreign id) falls back to the newest page.
        if (index >= 0) end = index
      }

      const start = Math.max(end - options.limit, 0)
      const slice = ordered.slice(start, end)
      const hasMore = start > 0
      const page = slice.map(toMessage)
      return {
        messages: page,
        hasMore,
        nextCursor: hasMore ? (page[0]?.id ?? null) : null
      }
    },

    async updateConversation(userId, conversationId, patch: UpdateConversationInput) {
      await ensureIndexes()
      const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (patch.title !== undefined) $set.title = patch.title
      if (patch.archived !== undefined) $set.archived = patch.archived
      if (patch.color !== undefined) $set.color = patch.color
      const result = await conversations.updateOne({ _id: conversationId, userId }, { $set }) as { modifiedCount?: number }
      if (!result.modifiedCount) {
        // updateOne reports 0 when the row matched but nothing changed, so the
        // ownership check has to look the document up before answering null.
        const existing = await conversations.findOne({ _id: conversationId, userId })
        if (!existing) return null
      }
      return this.getConversation(userId, conversationId)
    },

    async touchConversation(conversationId, model, connectionId) {
      await ensureIndexes()
      await conversations.updateOne(
        { _id: conversationId },
        { $set: { model, connectionId, updatedAt: new Date().toISOString() } }
      )
    },

    async deleteConversation(userId, conversationId) {
      await ensureIndexes()
      const result = await conversations.deleteOne({ _id: conversationId, userId }) as { deletedCount?: number }
      if (!result.deletedCount) return false
      await messages.deleteMany({ conversationId, userId })
      return true
    },

    async close() {
      // The shared Mongo pool is owned by the connection manager.
    }
  }
}
