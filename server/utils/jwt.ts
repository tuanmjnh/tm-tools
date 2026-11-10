import { SignJWT, decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import type { JWK } from 'jose'
import type { TokenPayload } from '#shared/types/auth'
import { config } from '../config/index'

function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

/**
 * Hub public verification key. Only `n`/`e`; anything carrying `d` is rejected
 * so a mis-pasted private key cannot become trusted material.
 */
interface HubPublicJwk {
  kty: 'RSA'
  kid: string
  alg?: 'RS256'
  n: string
  e: string
}

let cachedRaw = ''
let cachedKeys: HubPublicJwk[] = []

function isHubPublicJwk(value: unknown): value is HubPublicJwk {
  if (!value || typeof value !== 'object') return false
  const jwk = value as Record<string, unknown>
  if ('d' in jwk) return false
  return jwk.kty === 'RSA'
    && typeof jwk.n === 'string' && jwk.n.length > 0
    && typeof jwk.e === 'string' && jwk.e.length > 0
    && typeof jwk.kid === 'string' && jwk.kid.length > 0
}

/**
 * `AUTH_JWT_PUBLIC_KEYS` is a JSON array of Hub public JWKs - the same document
 * the Hub publishes at `/api/v1/auth/jwks`. It is not a secret, so a packaged
 * build may embed it.
 */
export function getHubPublicKeys(): HubPublicJwk[] {
  const raw = config.auth.accessTokenPublicKeys
  if (raw === cachedRaw) return cachedKeys
  cachedRaw = raw
  cachedKeys = []
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      cachedKeys = Array.isArray(parsed) ? parsed.filter(isHubPublicJwk) : []
    } catch {
      cachedKeys = []
    }
  }
  return cachedKeys
}

/** A token can be verified when either the RS256 public keys or the legacy secret is present. */
export function hasAccessTokenVerificationMaterial(): boolean {
  return getHubPublicKeys().length > 0 || Boolean(config.auth.accessTokenSecret)
}

async function verifyRsa(token: string, kid: string | undefined): Promise<Record<string, unknown> | null> {
  const keys = getHubPublicKeys().filter(key => !kid || key.kid === kid)
  for (const jwk of keys) {
    try {
      const key = await importJWK(jwk as unknown as JWK, 'RS256')
      const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'] })
      return payload as Record<string, unknown>
    } catch {
      // Wrong key for this `kid`: try the next published key.
    }
  }
  return null
}

export async function signAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${config.auth.accessTokenExpiry}s`)
    .sign(getSecret(config.auth.accessTokenSecret))
}

export async function signRefreshToken(payload: Pick<TokenPayload, 'userId'>): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${config.auth.refreshTokenExpiry}s`)
    .sign(getSecret(config.auth.refreshTokenSecret))
}

/**
 * Hub tokens are RS256 since P3. HS256 keeps verifying with the legacy shared
 * secret until every issuer rotates; `none` and any other algorithm are refused.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  let header: { alg?: string, kid?: string }
  try {
    header = decodeProtectedHeader(token) as { alg?: string, kid?: string }
  } catch {
    return null
  }

  if (header.alg === 'RS256') {
    const payload = await verifyRsa(token, header.kid)
    return payload as unknown as TokenPayload | null
  }

  if (header.alg === 'HS256') {
    const secret = config.auth.accessTokenSecret
    if (!secret) return null
    try {
      const { payload } = await jwtVerify(token, getSecret(secret), { algorithms: ['HS256'] })
      return payload as unknown as TokenPayload
    } catch {
      return null
    }
  }

  return null
}

export async function verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(config.auth.refreshTokenSecret))
    return { userId: payload.userId as string }
  } catch {
    return null
  }
}
