import { getDatabase } from '../../../modules/database/index'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const body = await readBody(event)
  if (!body.sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'error.sessionIdRequired', message: 'sessionId is required' })
  }

  const db = await getDatabase()
  await db.revokeSession(auth.userId, body.sessionId)

  return { success: true }
})
