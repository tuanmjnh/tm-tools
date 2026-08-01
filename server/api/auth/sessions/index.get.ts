import { getDatabase } from '../../../modules/database/index'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const db = await getDatabase()
  const sessions = await db.getUserSessions(auth.userId)

  const refreshTokenCookie = getCookie(event, 'refreshToken')
  let currentSessionId: string | null = null
  if (refreshTokenCookie) {
    const stored = await db.findRefreshToken(refreshTokenCookie)
    if (stored) currentSessionId = stored.id
  }

  const data = sessions.map(s => ({ ...s, isCurrent: s.id === currentSessionId }))
  return { success: true, data }
})
