import { getChatStore, type UpdateConversationInput } from '../../../../modules/chat/store'
import { requireChatUser, requireChatWrite } from '../../../../utils/chatAuth'
import { isConversationColor } from '#shared/utils/chat'

const TITLE_MAX_LENGTH = 200

export default defineEventHandler(async (event) => {
  const auth = requireChatUser(event)
  requireChatWrite(auth)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'error.missingId', message: 'Conversation id is required' })

  const body = await readBody<{
    title?: unknown
    archived?: unknown
    color?: unknown
  }>(event) || {}

  const patch: UpdateConversationInput = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title || title.length > TITLE_MAX_LENGTH) {
      throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'Invalid conversation title' })
    }
    patch.title = title
  }

  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'Invalid archived flag' })
    }
    patch.archived = body.archived
  }

  if (body.color !== undefined) {
    if (!isConversationColor(body.color)) {
      throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'Invalid conversation color' })
    }
    patch.color = body.color
  }

  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'No conversation fields to update' })
  }

  const conversation = getChatStore().updateConversation(auth.userId, id, patch)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'error.notFound', message: 'Conversation not found' })
  }

  return { success: true, data: conversation }
})
