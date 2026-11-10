import type { H3Event } from 'h3'

/**
 * Claims as they arrive from TM Hub. Hub tokens carry `roles: string[]` and
 * `sub`; locally-issued tokens (legacy provider) carry `role` and `userId`.
 * Both shapes have to grant root, because a satellite that only inspects
 * `role` silently ignores every Hub-issued root session.
 */
export interface AuthClaims {
  userId?: string
  sub?: string
  role?: string
  roles?: string[]
  permissions?: string[]
  appId?: string
  [key: string]: unknown
}

/** The three claims that can grant root, kept separate so token interfaces without an index signature remain assignable. */
export interface RootClaims {
  role?: string
  roles?: string[]
  permissions?: string[]
}

export function isRootClaims(auth: RootClaims | null | undefined): boolean {
  if (!auth) return false
  return auth.role === 'root'
    || (Array.isArray(auth.roles) && auth.roles.includes('root'))
    || (Array.isArray(auth.permissions) && auth.permissions.includes('*'))
}

export function getAuthClaims(event: H3Event): AuthClaims | null {
  return ((event.context as { auth?: AuthClaims }).auth) ?? null
}

/**
 * Root-only guard for administrative configuration. The UI hides these
 * surfaces, but the check lives here so a direct API call is refused on its
 * own — route visibility is never the authorization.
 */
export function requireRootAuth(event: H3Event): AuthClaims {
  const auth = getAuthClaims(event)
  if (!auth) {
    throw createError({
      statusCode: 401,
      statusMessage: 'error.tokenMissing',
      message: 'Missing authorization token'
    })
  }
  if (!isRootClaims(auth)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'error.notRoot',
      message: 'Only root can perform this action'
    })
  }
  return auth
}
