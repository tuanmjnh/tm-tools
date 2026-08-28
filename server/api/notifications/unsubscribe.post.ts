import { getDatabase } from '../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const body = await readBody(event)
    const { endpoint, fcmToken } = body
    const identifier = endpoint || fcmToken

    if (!identifier) throw createError({ statusCode: 400, statusMessage: 'error.bad_request', message: 'Endpoint or FCM Token is required' })

    const db = await getDatabase()
    await db.removePushSubscription(auth.userId, identifier)

    return { success: true, message: 'Successfully unsubscribed from push notifications' }
  } catch (error) {
    handleApiError(error)
  }
})
