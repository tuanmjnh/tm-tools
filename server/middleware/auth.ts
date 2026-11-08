import { verifyAccessToken } from '../utils/jwt'

const publicRoutes = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/health',
  '/api/system/network',
  // Deployment health: names the runtime and whether a provider is configured,
  // never a credential. A monitor cannot hold a user session.
  '/api/v1/documents/health',
  // Retention cron: proves itself with its own bearer token inside the handler
  // because a scheduler has no user session.
  '/api/v1/documents/maintenance/cleanup'
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

  // Security constraint: Token must match tm-tools appId (except root / cross-app)
  const currentAppId = process.env.NUXT_PUBLIC_HUB_APP_ID || 'tm-tools'
  const rawPayload = payload as unknown as Record<string, unknown>
  const capabilities = Array.isArray(rawPayload.capabilities) ? rawPayload.capabilities as string[] : []
  const isRootOrCrossApp = payload.role === 'root'
    || (payload.permissions || []).includes('*')
    || (payload.permissions || []).includes('platform.crossapp.read')
    || (payload.permissions || []).includes('platform.crossapp.write')
    || capabilities.includes('*')
    || capabilities.includes('platform.crossapp.read')

  if (payload.appId && payload.appId !== currentAppId && !isRootOrCrossApp) {
    throw createError({ statusCode: 403, statusMessage: 'error.forbidden', message: 'Token not issued for this application' })
  }

  event.context.auth = payload
  // Server-only: Hub Storage checks the Storage grant against the caller's own
  // token, so the raw bearer has to survive past verification. It is never
  // copied into a response, a log line or the page payload.
  event.context.authToken = token
})
