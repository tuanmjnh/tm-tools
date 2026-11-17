import { aiConfigStore, storeOwnerId } from '#server/utils/aiConfigStore'
import { requireRootAuth } from '#server/utils/authz'

export default defineEventHandler(async (event) => {
  requireRootAuth(event)
  const connectionId = getRouterParam(event, 'connectionId')
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'error.badRequest', message: 'connectionId is required' })
  await aiConfigStore(storeOwnerId(event)).removeConnection(connectionId)
  return { success: true }
})
