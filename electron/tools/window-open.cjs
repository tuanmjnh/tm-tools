// Window-open policy for the app shell. It lives outside main.cjs so the
// decision is testable without launching Electron.
//
// The bug it fixes: every same-origin `/api/` popup was turned into a
// download, so the artifact preview (`?inline=1`) saved a file instead of
// rendering it in a window.
'use strict'

const OAUTH_HOSTS = ['accounts.google.com', 'github.com', 'login.microsoftonline.com']

/** `?inline=1` marks the artifact preview route; `download` stays the default. */
const INLINE_FLAG = 'inline'

function isInlineRequest(url) {
  const value = url.searchParams.get(INLINE_FLAG)
  return value === '1' || value === 'true'
}

/**
 * Decides what the shell does with a `window.open` target.
 *
 * - `external` — hand the URL to the system browser.
 * - `download` — same-origin API link without the inline flag: save it.
 * - `popup`    — app window; `pdfPlugins` also turns on the built-in PDF viewer.
 * - `allow`    — ordinary internal route, default app window.
 *
 * Anything unparsable is left to the default handler rather than guessed at.
 */
function decideWindowOpen({ url, currentUrl }) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { action: 'allow' }
  }

  if (OAUTH_HOSTS.some(host => parsed.hostname.includes(host))) {
    return { action: 'popup' }
  }

  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
  if (!isHttp) return { action: 'allow' }

  const current = currentUrl ? new URL(currentUrl) : null
  // `null` means "origin unknown", not "different origin": a destroyed window
  // must not turn an inline preview into a download.
  const sameOrigin = current ? parsed.origin === current.origin : null

  if (sameOrigin === false) {
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if (isLoopback) return { action: 'allow' }
    return { action: 'external' }
  }

  if (parsed.pathname.startsWith('/api/')) {
    if (isInlineRequest(parsed)) return { action: 'popup', pdfPlugins: true }
    return { action: sameOrigin ? 'download' : 'allow' }
  }

  return { action: 'allow' }
}

module.exports = { decideWindowOpen }
