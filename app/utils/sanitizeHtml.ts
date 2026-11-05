/**
 * Strips active content from untrusted HTML before it reaches `v-html`:
 * script/style/iframe-like elements, inline event handlers and javascript: URLs.
 * It is intentionally conservative — it never grants markup back, only removes it.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  let out = html
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|form|base|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|form|base|svg|math)\b[^>]*\/?>/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  out = out.replace(/(href|src)\s*=\s*("|')?\s*(javascript|data:text\/html)[^"'>\s]*/gi, '$1="#"')
  return out
}
