import { getDatabase } from '../../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'ID is required' })

    const db = await getDatabase()
    const success = await db.markNotificationAsRead(id, auth.userId)

    return { success }
  } catch (error) {
    handleApiError(error)
  }
})
