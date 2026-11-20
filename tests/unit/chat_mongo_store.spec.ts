/**
 * Mongo chat repository contract: the hosted runtime has no writable disk and
 * cannot load the native sqlite binding, so /chat must behave identically on a
 * document store. Drives the repository through an in-memory collection fake
 * that implements exactly the driver surface the repository uses.
 */
import assert from 'node:assert/strict'
import { createMongoChatStore, type ChatCollectionLike, type ChatDatabaseLike } from '../../server/modules/chat/mongo'

type Doc = Record<string, unknown>

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const range = expected as { $lt?: unknown, $gt?: unknown }
      if ('$lt' in range) return (doc[key] as string) < (range.$lt as string)
      if ('$gt' in range) return (doc[key] as string) > (range.$gt as string)
    }
    return doc[key] === expected
  })
}

function makeDatabase(): ChatDatabaseLike {
  const data: Record<string, Doc[]> = { chat_conversations: [], chat_messages: [] }

  function collection(name: string): ChatCollectionLike {
    const rows = () => data[name] as Doc[]
    const api: ChatCollectionLike = {
      createIndex: async () => 'ok',
      insertOne: async (doc) => {
        rows().push({ ...doc })
        return { acknowledged: true }
      },
      findOne: async (filter) => {
        const found = rows().find(row => matches(row, filter))
        return found ? { ...found } : null
      },
      find: (filter) => {
        let result = rows().filter(row => matches(row, filter))
        const chain = {
          sort(spec: Record<string, unknown>) {
            const entries = Object.entries(spec)
            result = [...result].sort((left, right) => {
              for (const [field, direction] of entries) {
                const a = left[field] as string
                const b = right[field] as string
                if (a < b) return -1 * Number(direction)
                if (a > b) return 1 * Number(direction)
              }
              return 0
            })
            return chain
          },
          limit(count: number) {
            result = result.slice(0, count)
            return chain
          },
          toArray: async () => result.map(row => ({ ...row }))
        }
        return chain
      },
      updateOne: async (filter, update) => {
        const found = rows().find(row => matches(row, filter))
        if (!found) return { modifiedCount: 0 }
        Object.assign(found, update.$set ?? {})
        return { modifiedCount: 1 }
      },
      deleteOne: async (filter) => {
        const index = rows().findIndex(row => matches(row, filter))
        if (index < 0) return { deletedCount: 0 }
        rows().splice(index, 1)
        return { deletedCount: 1 }
      },
      deleteMany: async (filter) => {
        const before = rows().length
        data[name] = rows().filter(row => !matches(row, filter))
        return { deletedCount: before - data[name]!.length }
      }
    }
    return api
  }

  return { collection }
}

const store = createMongoChatStore(makeDatabase())
const user = 'user-a'
const other = 'user-b'

async function conversationFor(userId: string, title = 'Thread') {
  return store.createConversation({ userId, title, connectionId: 'conn-1', model: 'model-1' })
}

const conversation = await conversationFor(user)

// Insert order is preserved even when two turns land in the same millisecond.
const written = []
for (let index = 0; index < 5; index++) {
  written.push(await store.appendMessage({
    conversationId: conversation.id,
    userId: user,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${index}`
  }))
}
const messages = await store.listMessages(user, conversation.id)
assert.deepEqual(messages.map(m => m.content), ['turn-0', 'turn-1', 'turn-2', 'turn-3', 'turn-4'])
assert.deepEqual(messages.map(m => m.id), written.map(m => m.id))

const windowed = await store.listMessages(user, conversation.id, 2)
assert.deepEqual(windowed.map(m => m.content), ['turn-3', 'turn-4'])

// Scoping: another account cannot read, mutate or delete this thread.
assert.deepEqual(await store.listMessages(other, conversation.id), [])
assert.equal(await store.getConversation(other, conversation.id), null)
assert.equal(await store.deleteConversation(other, conversation.id), false)
assert.equal((await store.getConversation(user, conversation.id))?.messageCount, 5)

// Deleting a conversation cascades to its messages.
assert.equal(await store.deleteConversation(user, conversation.id), true)
assert.equal(await store.getConversation(user, conversation.id), null)
assert.deepEqual(await store.listMessages(user, conversation.id), [])

// The list view reports the newest activity and the message count.
const active = await conversationFor(user, 'Active')
await store.appendMessage({ conversationId: active.id, userId: user, role: 'user', content: 'first' })
await store.appendMessage({ conversationId: active.id, userId: user, role: 'assistant', content: 'second' })
const listed = await store.listConversations(user)
assert.equal(listed.length, 1)
assert.equal(listed[0]?.id, active.id)
assert.equal(listed[0]?.messageCount, 2)
assert.ok(listed[0]?.lastMessageAt)

await store.touchConversation(active.id, 'model-2', 'conn-2')
assert.equal((await store.getConversation(user, active.id))?.model, 'model-2')
assert.equal((await store.getConversation(user, active.id))?.connectionId, 'conn-2')

// Pagination walks backwards by cursor and keeps pages oldest-first.
const paged = await conversationFor(user, 'Paged')
const pagedMessages = []
for (let index = 0; index < 7; index++) {
  pagedMessages.push(await store.appendMessage({
    conversationId: paged.id,
    userId: user,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `page-${index}`
  }))
}

const newestPage = await store.listMessagePage(user, paged.id, { limit: 3 })
assert.deepEqual(newestPage.messages.map(m => m.content), ['page-4', 'page-5', 'page-6'])
assert.equal(newestPage.hasMore, true)
assert.equal(newestPage.nextCursor, pagedMessages[4]?.id)

const middlePage = await store.listMessagePage(user, paged.id, { limit: 3, before: newestPage.nextCursor ?? undefined })
assert.deepEqual(middlePage.messages.map(m => m.content), ['page-1', 'page-2', 'page-3'])
assert.equal(middlePage.hasMore, true)
assert.equal(middlePage.nextCursor, pagedMessages[1]?.id)

const oldestPage = await store.listMessagePage(user, paged.id, { limit: 3, before: middlePage.nextCursor ?? undefined })
assert.deepEqual(oldestPage.messages.map(m => m.content), ['page-0'])
assert.equal(oldestPage.hasMore, false)
assert.equal(oldestPage.nextCursor, null)

// A stale cursor falls back to the newest page instead of returning nothing.
const staleCursor = await store.listMessagePage(user, paged.id, { limit: 2, before: 'missing-id' })
assert.deepEqual(staleCursor.messages.map(m => m.content), ['page-5', 'page-6'])
assert.equal(staleCursor.hasMore, true)

const otherPage = await store.listMessagePage(other, paged.id, { limit: 3 })
assert.deepEqual(otherPage.messages, [])
assert.equal(otherPage.nextCursor, null)

// Attachments survive the document round-trip without JSON encoding.
const withAttachments = await store.appendMessage({
  conversationId: paged.id,
  userId: user,
  role: 'user',
  content: 'see attached',
  attachments: [
    { name: 'notes.txt', type: 'text/plain', size: 12, kind: 'text', content: 'hello world' },
    { name: 'photo.png', type: 'image/png', size: 2048, kind: 'image', url: 'https://cdn.example.com/photo.png' }
  ]
})
const reloaded = (await store.listMessages(user, paged.id)).find(m => m.id === withAttachments.id)
assert.deepEqual(reloaded?.attachments, withAttachments.attachments)

// Patch is owner-scoped and archived threads sort after active ones.
const renamed = await store.updateConversation(user, paged.id, { title: 'Renamed', color: 'success' })
assert.equal(renamed?.title, 'Renamed')
assert.equal(renamed?.color, 'success')
assert.equal(renamed?.archived, false)

const archived = await store.updateConversation(user, paged.id, { archived: true })
assert.equal(archived?.archived, true)
assert.equal(await store.updateConversation(other, paged.id, { title: 'Hijacked' }), null)
assert.equal((await store.getConversation(user, paged.id))?.title, 'Renamed')

const ordered = await store.listConversations(user)
assert.equal(ordered[0]?.id, active.id)
assert.equal(ordered.at(-1)?.id, paged.id)
assert.equal(ordered.at(-1)?.archived, true)

// Deleting one message keeps the conversation count consistent.
const beforeDelete = (await store.getConversation(user, paged.id))?.messageCount ?? 0
await store.deleteMessage(user, withAttachments.id)
assert.equal((await store.getConversation(user, paged.id))?.messageCount, beforeDelete - 1)
assert.equal((await store.listMessages(user, paged.id)).some(m => m.id === withAttachments.id), false)

console.log('chat_mongo_store.spec: all assertions passed')
