/**
 * Chat history store regressions: SQLite is the only persistence layer for
 * /chat, so ordering, windowing, per-user scoping and cascade deletes have to
 * hold without a running server.
 */
import assert from 'node:assert/strict'
import { ChatStore, CHAT_HISTORY_WINDOW, deriveTitle, TITLE_MAX_LENGTH } from '../../server/modules/chat/store'

const store = new ChatStore(':memory:')
const user = 'user-a'
const other = 'user-b'

function conversationFor(userId: string, title = 'Thread') {
  return store.createConversation({
    userId,
    title,
    connectionId: 'conn-1',
    model: 'model-1'
  })
}

// deriveTitle collapses whitespace, keeps short lines intact and truncates long ones.
assert.equal(deriveTitle('  hello   world  '), 'hello world')
assert.equal(deriveTitle('   '), 'Untitled chat')
const longTitle = deriveTitle('x'.repeat(TITLE_MAX_LENGTH + 20))
assert.equal(longTitle.length, TITLE_MAX_LENGTH)
assert.ok(longTitle.endsWith('…'))

const conversation = conversationFor(user)

// Messages written within the same millisecond must still read back in insert order.
const written = Array.from({ length: 5 }, (_, index) => store.appendMessage({
  conversationId: conversation.id,
  userId: user,
  role: index % 2 === 0 ? 'user' : 'assistant',
  content: `turn-${index}`
}))
const messages = store.listMessages(user, conversation.id)
assert.deepEqual(messages.map(m => m.content), ['turn-0', 'turn-1', 'turn-2', 'turn-3', 'turn-4'])
assert.deepEqual(messages.map(m => m.id), written.map(m => m.id))

// The window keeps the newest N rows and still returns them oldest-first.
const windowed = store.listMessages(user, conversation.id, 2)
assert.deepEqual(windowed.map(m => m.content), ['turn-3', 'turn-4'])

// A second user can never see the thread, even holding a valid conversation id.
assert.equal(store.listMessages(other, conversation.id).length, 0)
assert.equal(store.getConversation(other, conversation.id), null)
assert.equal(store.deleteConversation(other, conversation.id), false)
assert.equal(store.getConversation(user, conversation.id)?.messageCount, 5)

// Deleting a conversation cascades to its messages instead of orphaning them.
assert.equal(store.deleteConversation(user, conversation.id), true)
assert.equal(store.getConversation(user, conversation.id), null)
assert.equal(store.listMessages(user, conversation.id).length, 0)

// The list view reports the latest message time and count per thread.
const active = conversationFor(user, 'Active')
store.appendMessage({ conversationId: active.id, userId: user, role: 'user', content: 'first' })
store.appendMessage({ conversationId: active.id, userId: user, role: 'assistant', content: 'second' })
const listed = store.listConversations(user)
assert.equal(listed.length, 1)
assert.equal(listed[0]?.id, active.id)
assert.equal(listed[0]?.messageCount, 2)
assert.ok(listed[0]?.lastMessageAt)

// touchConversation follows the model of the final turn.
store.touchConversation(active.id, 'model-2', 'conn-2')
assert.equal(store.getConversation(user, active.id)?.model, 'model-2')
assert.equal(store.getConversation(user, active.id)?.connectionId, 'conn-2')

// Pagination returns the newest page oldest-first and walks backwards by cursor.
const paged = conversationFor(user, 'Paged')
const pagedMessages = Array.from({ length: 7 }, (_, index) => store.appendMessage({
  conversationId: paged.id,
  userId: user,
  role: index % 2 === 0 ? 'user' : 'assistant',
  content: `page-${index}`
}))

const newestPage = store.listMessagePage(user, paged.id, { limit: 3 })
assert.deepEqual(newestPage.messages.map(m => m.content), ['page-4', 'page-5', 'page-6'])
assert.equal(newestPage.hasMore, true)
assert.equal(newestPage.nextCursor, pagedMessages[4]?.id)

const middlePage = store.listMessagePage(user, paged.id, { limit: 3, before: newestPage.nextCursor ?? undefined })
assert.deepEqual(middlePage.messages.map(m => m.content), ['page-1', 'page-2', 'page-3'])
assert.equal(middlePage.hasMore, true)
assert.equal(middlePage.nextCursor, pagedMessages[1]?.id)

const oldestPage = store.listMessagePage(user, paged.id, { limit: 3, before: middlePage.nextCursor ?? undefined })
assert.deepEqual(oldestPage.messages.map(m => m.content), ['page-0'])
assert.equal(oldestPage.hasMore, false)
assert.equal(oldestPage.nextCursor, null)

// A stale cursor falls back to the newest page instead of returning nothing.
const staleCursor = store.listMessagePage(user, paged.id, { limit: 2, before: 'missing-id' })
assert.deepEqual(staleCursor.messages.map(m => m.content), ['page-5', 'page-6'])
assert.equal(staleCursor.hasMore, true)

// A page can never leak another user's thread.
const otherPage = store.listMessagePage(other, paged.id, { limit: 3 })
assert.deepEqual(otherPage.messages, [])
assert.equal(otherPage.hasMore, false)
assert.equal(otherPage.nextCursor, null)

// Attachments round-trip through the JSON column.
const withAttachments = store.appendMessage({
  conversationId: paged.id,
  userId: user,
  role: 'user',
  content: 'see attached',
  attachments: [
    { name: 'notes.txt', type: 'text/plain', size: 12, kind: 'text', content: 'hello world' },
    { name: 'photo.png', type: 'image/png', size: 2048, kind: 'image', url: 'https://cdn.example.com/photo.png' }
  ]
})
const reloaded = store.listMessages(user, paged.id).find(m => m.id === withAttachments.id)
assert.deepEqual(reloaded?.attachments, withAttachments.attachments)

// updateConversation patches title, archived and color within the owning user only.
const renamed = store.updateConversation(user, paged.id, { title: 'Renamed', color: 'success' })
assert.equal(renamed?.title, 'Renamed')
assert.equal(renamed?.color, 'success')
assert.equal(renamed?.archived, false)

const archived = store.updateConversation(user, paged.id, { archived: true })
assert.equal(archived?.archived, true)

assert.equal(store.updateConversation(other, paged.id, { title: 'Hijacked' }), null)
assert.equal(store.getConversation(user, paged.id)?.title, 'Renamed')

// Archived threads sort after active ones in the sidebar list.
const activeOrder = store.listConversations(user)
assert.equal(activeOrder[0]?.id, active.id)
assert.equal(activeOrder.at(-1)?.id, paged.id)
assert.equal(activeOrder.at(-1)?.archived, true)

assert.equal(CHAT_HISTORY_WINDOW > 0, true)

store.close()
console.log('chat_store.spec: all assertions passed')
