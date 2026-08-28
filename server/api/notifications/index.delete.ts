import { getDatabase } from '../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const query = getQuery(event)
    const idParam = query.id as string
    if (!idParam) throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'ID parameters are required' })

    const ids = idParam.split(',')
    const db = await getDatabase()
    const deletedCount = await db.deleteNotifications(auth.userId, ids)

    return { success: true, deletedCount }
  } catch (error) {
    handleApiError(error)
  }
})
