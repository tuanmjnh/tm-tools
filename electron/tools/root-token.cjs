// P1: the desktop admin gate for device configuration. A Hub access token is
// verified locally with material that is already on this device, so the gate
// keeps working offline and while the Hub URL itself is being fixed.
// P3: Hub tokens are RS256. The public JWK verifies them; HS256 stays as the
// transitional arm for tokens issued before the key rotation, and the root
// rule is identical for both.
'use strict'

const crypto = require('node:crypto')

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function verifyHs256(parts, secret) {
  if (typeof secret !== 'string' || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  const provided = Buffer.from(parts[2])
  const wanted = Buffer.from(expected)
  return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted)
}

function parsePublicKeys(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(key => key && typeof key === 'object' && !('d' in key)) : []
  } catch {
    return []
  }
}

function verifyRs256(parts, kid, publicKeys) {
  const keys = publicKeys.filter(key => key.kty === 'RSA' && (!kid || key.kid === kid))
  for (const jwk of keys) {
    try {
      const key = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' })
      const ok = crypto.verify(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        key,
        Buffer.from(parts[2], 'base64url')
      )
      if (ok) return true
    } catch {
      // Wrong key for this `kid`: keep looking.
    }
  }
  return false
}

function isRootAccessToken(token, options = {}) {
  const { secret = '', publicKeys = [] } = options
  if (typeof token !== 'string' || !token) return false

  const parts = token.split('.')
  if (parts.length !== 3) return false

  const header = decodePart(parts[0])
  const payload = decodePart(parts[1])
  if (!header || !payload) return false
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return false

  const signed = header.alg === 'HS256'
    ? verifyHs256(parts, secret)
    : header.alg === 'RS256'
      ? verifyRs256(parts, header.kid, parsePublicKeys(publicKeys))
      : false
  if (!signed) return false

  const roles = Array.isArray(payload.roles) ? payload.roles : []
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : []
  return roles.includes('root') || permissions.includes('*') || payload.role === 'root'
}

/** Legacy two-argument form: HS256 only. */
function isRootHs256Token(token, secret) {
  return isRootAccessToken(token, { secret })
}

module.exports = { isRootAccessToken, isRootHs256Token }
