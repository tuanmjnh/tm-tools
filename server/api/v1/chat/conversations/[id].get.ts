import { getChatStore } from '../../../../modules/chat/store'
import { requireChatUser } from '../../../../utils/chatAuth'

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

function parseLimit(raw: unknown): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(Math.trunc(value), 1), MAX_PAGE_SIZE)
}

export default defineEventHandler(async (event) => {
  const auth = requireChatUser(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'error.missingId', message: 'Conversation id is required' })

  const store = getChatStore()
  const conversation = store.getConversation(auth.userId, id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'error.notFound', message: 'Conversation not found' })
  }

  const query = getQuery(event)
  const page = store.listMessagePage(auth.userId, id, {
    limit: parseLimit(query.limit),
    before: typeof query.before === 'string' && query.before ? query.before : undefined
  })

  return {
    success: true,
    data: {
      ...conversation,
      messages: page.messages,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
    }
  }
})
