import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const authData = event.context.auth
  if (!authData) {
    throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })
  }

  const auth = await getAuthService()
  const user = await auth.getCurrentUser(authData.userId)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'error.userNotFound', message: 'User not found' })
  }

  return { success: true, data: user }
})
