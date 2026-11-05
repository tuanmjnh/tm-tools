import { getChatStore } from '../../../../modules/chat/store'
import { requireChatUser } from '../../../../utils/chatAuth'

export default defineEventHandler(async (event) => {
  const auth = requireChatUser(event)
  const conversations = getChatStore().listConversations(auth.userId)
  return { success: true, data: conversations }
})
