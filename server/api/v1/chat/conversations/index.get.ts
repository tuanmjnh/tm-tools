import { getChatRepository } from '../../../../modules/chat/repository'
import { requireChatUser } from '../../../../utils/chatAuth'

export default defineEventHandler(async (event) => {
  const auth = requireChatUser(event)
  const conversations = await getChatRepository().listConversations(auth.userId)
  return { success: true, data: conversations }
})
