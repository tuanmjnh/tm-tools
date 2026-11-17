import { getRouterParam } from 'h3'
import { aiConfigStore, storeOwnerId } from '#server/utils/aiConfigStore'

export default defineEventHandler(async (event) => {
  const connectionId = getRouterParam(event, 'connectionId')
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'error.badRequest', message: 'connectionId is required' })
  await aiConfigStore(storeOwnerId(event)).removeConnection(connectionId)
  return { success: true }
})
