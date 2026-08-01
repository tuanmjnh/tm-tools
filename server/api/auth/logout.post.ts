import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ refreshToken: string }>(event)
  const auth = await getAuthService()
  await auth.logout(body.refreshToken)
  deleteCookie(event, 'accessToken', { path: '/' })
  deleteCookie(event, 'refreshToken', { path: '/' })
  return { success: true }
})
