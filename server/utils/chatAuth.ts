import type { H3Event } from 'h3'
import type { TokenPayload } from '#shared/types/auth'

/**
 * Hub-issued access tokens describe the subject as `sub` + `roles[]`, while
 * `TokenPayload` models the local shape (`userId` + `role`). Accept both so a
 * token minted by either issuer resolves to the same chat identity.
 */
interface ChatClaims extends Partial<TokenPayload> {
  sub?: string
  roles?: string[]
}

export function requireChatUser(event: H3Event): TokenPayload {
  const claims = event.context.auth as ChatClaims | undefined
  const userId = claims?.userId || claims?.sub
  if (!claims || !userId) {
    throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })
  }
  return {
    ...claims,
    userId,
    email: claims.email || '',
    role: claims.role || claims.roles?.[0] || '',
    permissions: claims.permissions || []
  } as TokenPayload
}

/** Mirrors the permission the retired /api/chat endpoint enforced. */
export function requireChatWrite(auth: TokenPayload): void {
  const allowed = auth.role === 'root'
    || auth.permissions?.includes('*')
    || auth.permissions?.includes('chat:write')
    || auth.permissions?.includes('chat.write')
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'error.chatNoPermission', message: 'You do not have permission to use the chat' })
  }
}
