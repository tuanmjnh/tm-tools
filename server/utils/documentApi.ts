import type { H3Event } from 'h3'
import type { DocumentErrorCode } from '#shared/types/document'
import type { TokenPayload } from '#shared/types/auth'
import { DocumentError, toDocumentError } from '#server/modules/document/operations'

export interface DocumentApiSuccess<T> {
  ok: true
  data: T
  requestId: string
}

export interface DocumentApiFailure {
  ok: false
  error: { code: string, message: string, retryable: boolean }
  requestId: string
}

export interface DocumentCaller {
  ownerId: string
  tenantId?: string
  event: H3Event
}

/**
 * Hub-issued access tokens describe the subject as `sub`, while a locally
 * minted `TokenPayload` uses `userId`. Only the Hub verifies the token here, so
 * both spellings have to resolve to the same owner id.
 */
interface DocumentClaims extends Partial<TokenPayload> {
  sub?: string
}

/**
 * The hub token is the only identity Document Studio trusts. A job record is
 * always scoped by `ownerId` from here, never from a request body.
 */
export function documentCaller(event: H3Event): DocumentCaller {
  const auth = (event.context as { auth?: DocumentClaims }).auth
  const ownerId = auth?.userId || auth?.sub
  if (!ownerId) {
    throw createError({ statusCode: 401, statusMessage: 'error.tokenMissing', message: 'Missing authorization token' })
  }
  return { ownerId, tenantId: auth.appId, event }
}

function requestId(event: H3Event): string {
  return String(event.context.requestId ?? crypto.randomUUID())
}

/** Wraps a handler so every failure becomes one typed, client-mappable body. */
export async function runDocument<T>(
  event: H3Event,
  action: () => Promise<T> | T
): Promise<DocumentApiSuccess<T>> {
  const id = requestId(event)
  try {
    return { ok: true, data: await action(), requestId: id }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    const normalized = toDocumentError(error)
    const body: DocumentApiFailure = {
      ok: false,
      error: {
        code: normalized.code satisfies DocumentErrorCode,
        message: normalized.code,
        retryable: normalized.retryable
      },
      requestId: id
    }
    throw createError({
      statusCode: normalized.status,
      statusMessage: normalized.code,
      message: normalized.code,
      data: body
    })
  }
}

export function documentBody<T>(event: H3Event): Promise<T> {
  return readBody<T>(event).then(body => (body ?? {}) as T)
}

export { DocumentError }
