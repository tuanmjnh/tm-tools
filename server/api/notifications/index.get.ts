import { getDatabase } from '../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const query = getQuery(event)
    const limit = query.limit ? parseInt(query.limit as string, 10) : 20
    const unreadOnly = query.unreadOnly === 'true'

    const db = await getDatabase()
    const list = await db.getUserNotifications(auth.userId, { limit, unreadOnly })
    return list
  } catch (error) {
    handleApiError(error)
  }
})
