import { verifyAccessToken } from '../utils/jwt'

const publicRoutes = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/health',
  '/api/system/network'
]

export default defineEventHandler(async (event) => {
  const path = event.path

  if (!path.startsWith('/api/')) return
  if (publicRoutes.includes(path)) return

  let token: string | null = null

  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  if (!token) {
    token = getCookie(event, 'accessToken') || null
  }

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'error.tokenMissing', message: 'Missing authorization token' })
  }
  const payload = await verifyAccessToken(token)

  if (!payload) {
    throw createError({ statusCode: 401, statusMessage: 'error.invalidToken', message: 'Invalid or expired token' })
  }

  event.context.auth = payload
})
