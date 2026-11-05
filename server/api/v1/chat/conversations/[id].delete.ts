import { getChatStore } from '../../../../modules/chat/store'
import { requireChatUser } from '../../../../utils/chatAuth'

export default defineEventHandler(async (event) => {
  const auth = requireChatUser(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'error.missingId', message: 'Conversation id is required' })

  const deleted = getChatStore().deleteConversation(auth.userId, id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'error.notFound', message: 'Conversation not found' })
  }

  return { success: true }
})
