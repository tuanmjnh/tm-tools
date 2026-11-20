import { detectRuntime } from '#server/modules/document/runtime'
import { getSharedConnection } from '#server/modules/database/shared'
import { getChatStore } from './store'
import { createMongoChatStore, type ChatCollectionLike, type ChatDatabaseLike } from './mongo'
import type { ChatRepository } from './types'

export { CHAT_HISTORY_WINDOW, deriveTitle, TITLE_MAX_LENGTH } from './types'
export type {
  AppendMessageInput,
  ChatRepository,
  ChatRole,
  CreateConversationInput,
  MessagePage,
  StoredConversation,
  StoredMessage,
  UpdateConversationInput
} from './types'

/**
 * Picks the chat persistence backend for this runtime.
 *
 * - Desktop/local keeps SQLite: the history has to survive offline and the
 *   native binding ships with the app.
 * - A hosted runtime (Vercel/Lambda) has no writable disk and cannot load the
 *   native module, so the same contract is served from MongoDB.
 *
 * Routes only ever see `ChatRepository`, so switching backends changes nothing
 * above this layer.
 */

// getSharedConnection is async; the Mongo repository is built synchronously on
// top of a proxy that awaits the shared pool per call.
const sharedDbProxy: ChatDatabaseLike = {
  collection(name: string): ChatCollectionLike {
    const live = async () => (await getSharedConnection()).db.collection(name) as unknown as {
      createIndex(spec: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
      insertOne(doc: Record<string, unknown>): Promise<unknown>
      findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>
      find(filter: Record<string, unknown>): { toArray(): Promise<Record<string, unknown>[]> }
      updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>
      deleteOne(filter: Record<string, unknown>): Promise<unknown>
      deleteMany(filter: Record<string, unknown>): Promise<unknown>
    }
    return {
      createIndex: (spec, options) => live().then(collection => collection.createIndex(spec, options)),
      insertOne: doc => live().then(collection => collection.insertOne(doc)),
      findOne: filter => live().then(collection => collection.findOne(filter)),
      find: filter => ({ toArray: async () => (await live()).find(filter).toArray() }),
      updateOne: (filter, update) => live().then(collection => collection.updateOne(filter, update)),
      deleteOne: filter => live().then(collection => collection.deleteOne(filter)),
      deleteMany: filter => live().then(collection => collection.deleteMany(filter))
    }
  }
}

let repository: ChatRepository | null = null

/** True when this runtime must serve chat from MongoDB. */
export function chatUsesMongo(): boolean {
  return detectRuntime() === 'vercel'
}

/**
 * The default SQLite store is synchronous (it backs the desktop app and has its
 * own sync spec); this adapter lifts it onto the async repository contract so
 * routes never branch on the backend.
 */
function sqliteRepository(): ChatRepository {
  const store = getChatStore()
  return {
    listConversations: async userId => store.listConversations(userId),
    getConversation: async (userId, conversationId) => store.getConversation(userId, conversationId),
    createConversation: async input => store.createConversation(input),
    appendMessage: async input => store.appendMessage(input),
    deleteMessage: async (userId, messageId) => store.deleteMessage(userId, messageId),
    listMessages: async (userId, conversationId, limit) => store.listMessages(userId, conversationId, limit),
    listMessagePage: async (userId, conversationId, options) => store.listMessagePage(userId, conversationId, options),
    updateConversation: async (userId, conversationId, patch) => store.updateConversation(userId, conversationId, patch),
    touchConversation: async (conversationId, model, connectionId) => store.touchConversation(conversationId, model, connectionId),
    deleteConversation: async (userId, conversationId) => store.deleteConversation(userId, conversationId),
    close: async () => store.close()
  }
}

export function getChatRepository(): ChatRepository {
  if (repository) return repository
  const next: ChatRepository = chatUsesMongo() ? createMongoChatStore(sharedDbProxy) : sqliteRepository()
  repository = next
  return next
}

/** Test seam: swap the repository without touching the runtime probes. */
export function __setChatRepository(next: ChatRepository | null): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('repository override is not available')
  repository = next
}
