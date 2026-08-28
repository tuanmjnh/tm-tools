/**
 * Error convention for this project:
 * - Backend `createError` sends `statusMessage` = i18n key (e.g. `error.invalidCredentials`)
 *   and `message` = human-readable error text (for logs / fallback).
 * - Frontend resolves the display string via `getErrorMessage(err, t)`:
 *   1. `statusMessage` used as an i18n key (translated if it exists);
 *   2. otherwise fall back to `message` text;
 *   3. otherwise a status-code-based default key.
 */
export type ApiErrorPayload = {
  statusCode?: number
  statusMessage?: string
  data?: { message?: string, statusMessage?: string, statusCode?: number }
  message?: string
}

export function getApiErrorStatus(err: unknown): number | undefined {
  const e = err as ApiErrorPayload
  return e?.statusCode ?? e?.data?.statusCode
}

export function getErrorKey(err: unknown): string {
  const e = err as ApiErrorPayload
  const status = getApiErrorStatus(err)

  if (!status) {
    const msg = String(e?.message || e?.data?.message || '').toLowerCase()
    const isNetwork = /fetch failed|failed to fetch|network|econn|timeout|load failed|socket/i.test(msg)
    return isNetwork ? 'error.network' : 'error.unexpected'
  }

  switch (status) {
    case 400: return 'error.invalidRequest'
    case 401: return 'error.invalidCredentials'
    case 403: return 'error.forbidden'
    case 404: return 'error.notFound'
    case 409: return 'error.conflict'
    case 422: return 'error.validation'
    case 429: return 'error.tooManyAttempts'
    default: return status >= 500 ? 'error.serverError' : 'error.unexpected'
  }
}

export function getErrorMessage(err: unknown, t: (key: string) => string): string {
  const e = err as ApiErrorPayload
  const code = e?.statusMessage || e?.data?.statusMessage
  if (code) {
    const translated = t(code)
    if (translated && translated !== code) return translated
  }
  const text = e?.message || e?.data?.message
  if (text) return text
  return t(getErrorKey(err))
}
