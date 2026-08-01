import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ refreshToken: string }>(event)
  const auth = await getAuthService()
  const result = await auth.refreshTokens(body.refreshToken)
  return { success: true, data: result }
})
