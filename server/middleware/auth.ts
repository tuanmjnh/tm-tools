import { config } from '../config/index'
import { hasAccessTokenVerificationMaterial, inspectHubSigningKeys, verifyAccessToken } from '../utils/jwt'
import { isRootClaims } from '../utils/authz'

const publicRoutes = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/health',
  '/api/system/network',
  // Connection STATUS only: runtime plus one configured boolean. The full
  // diagnostics moved behind a root session (`/api/system/connection`), so
  // this surface must never carry an identifier or a credential.
  '/api/system/connection/status',
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

  // A fresh desktop install has no verification material yet. Verifying
  // against nothing would report every token as invalid and hide the real
  // cause, so the missing configuration is named instead. RS256 public keys
  // are enough on their own; the legacy shared secret is the fallback.
  if (!hasAccessTokenVerificationMaterial()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'error.authNotConfigured',
      message: 'Hub connection is not configured on this device'
    })
  }

  const payload = await verifyAccessToken(token)

  if (!payload) {
    // A deployment that cannot verify anything reports every valid token as
    // expired. Ask the Hub what it actually publishes before blaming the
    // session, so the fix ("the Hub has no signing key") is visible.
    const keyState = await inspectHubSigningKeys()
    if (keyState === 'empty' || keyState === 'unreachable') {
      throw createError({
        statusCode: 503,
        statusMessage: 'error.hubSigningKeyUnavailable',
        message: keyState === 'empty'
          ? 'TM Hub publishes no signing key (GET /api/v1/auth/jwks is empty); set AUTH_JWT_PRIVATE_KEY on the Hub'
          : 'TM Hub key endpoint is unreachable'
      })
    }
    throw createError({ statusCode: 401, statusMessage: 'error.invalidToken', message: 'Invalid or expired token' })
  }

  // Security constraint: Token must match tm-tools appId (except root / cross-app).
  // The desktop vault can override the id at runtime, so the live env wins over
  // the public build-time default. An unset id means this deployment is not
  // bound to one app, so there is nothing to compare against.
  const currentAppId = config.hub.appId || String(useRuntimeConfig(event).public.hubAppId || '')
  const rawPayload = payload as unknown as Record<string, unknown>
  const capabilities = Array.isArray(rawPayload.capabilities) ? rawPayload.capabilities as string[] : []
  const isRootOrCrossApp = isRootClaims(payload)
    || (payload.permissions || []).includes('platform.crossapp.read')
    || (payload.permissions || []).includes('platform.crossapp.write')
    || capabilities.includes('*')
    || capabilities.includes('platform.crossapp.read')

  if (currentAppId && payload.appId && payload.appId !== currentAppId && !isRootOrCrossApp) {
    throw createError({ statusCode: 403, statusMessage: 'error.forbidden', message: 'Token not issued for this application' })
  }

  event.context.auth = payload
  // Server-only: Hub Storage checks the Storage grant against the caller's own
  // token, so the raw bearer has to survive past verification. It is never
  // copied into a response, a log line or the page payload.
  event.context.authToken = token
})
