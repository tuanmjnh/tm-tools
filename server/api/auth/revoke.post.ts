import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const auth = await getAuthService()
  await auth.revokeAllTokens(event.context.auth.userId)
  return { success: true }
})
