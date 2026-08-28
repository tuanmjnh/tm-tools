import { getDatabase } from '../../modules/database'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  try {
    const body = await readBody(event)
    const { deviceType, ...subscriptionData } = body

    const finalSubscription = body.subscription || subscriptionData

    const db = await getDatabase()
    await db.addPushSubscription(auth.userId, finalSubscription, deviceType)

    return { success: true, message: 'Successfully subscribed to push notifications' }
  } catch (error) {
    handleApiError(error)
  }
})
