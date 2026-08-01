import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const authData = event.context.auth
  if (!authData) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const auth = await getAuthService()
  const user = await auth.getCurrentUser(authData.userId)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return { success: true, data: user }
})
