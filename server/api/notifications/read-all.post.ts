import { getDatabase } from '../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const db = await getDatabase()
    const count = await db.markAllNotificationsAsRead(auth.userId)
    return { success: true, markedCount: count }
  } catch (error) {
    handleApiError(error)
  }
})
