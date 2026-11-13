import { SignJWT, decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { createRemoteJWKSet } from 'jose/jwks/remote'
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

/**
 * Remote JWKS resolvers keyed by URL: a key rotation on the Hub is picked up
 * without a redeploy, and a restart does not refetch per request. jose owns the
 * "unknown kid triggers one refetch after cooldown" rule and requires exactly
 * one key to match.
 */
const remoteSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function remoteJwks(url: string) {
  let resolver = remoteSets.get(url)
  if (!resolver) {
    resolver = createRemoteJWKSet(new URL(url), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000
    })
    remoteSets.set(url, resolver)
  }
  return resolver
}

/**
 * A token can be verified when the Hub published a JWKS URL, when a public key
 * was pinned at build time, or when the legacy shared secret is present for the
 * migration window. Which material is configured decides the path; every path
 * still fails closed on its own.
 */
export function hasAccessTokenVerificationMaterial(): boolean {
  return Boolean(config.auth.accessTokenJwksUrl)
    || getHubPublicKeys().length > 0
    || Boolean(config.auth.accessTokenSecret)
}

/** Asymmetric verification through the Hub's published key set. */
async function verifyViaRemoteJwks(
  token: string,
  algorithm: 'RS256' | 'ES256'
): Promise<Record<string, unknown> | null> {
  const url = config.auth.accessTokenJwksUrl
  if (!url) return null
  try {
    const { payload } = await jwtVerify(token, remoteJwks(url), { algorithms: [algorithm] })
    return payload as Record<string, unknown>
  } catch {
    // Unreachable Hub, unknown kid after refetch, bad signature, expired token:
    // all fail closed. The caller may still verify with a pinned key below.
    return null
  }
}

/** What the Hub's key endpoint currently offers. Diagnostic only. */
export type HubSigningKeyState = 'ok' | 'empty' | 'unreachable' | 'not-configured'

/**
 * Why a token could not be verified, when the cause is the Hub rather than the
 * token. A deployment that answers `{"keys":[]}` rejects every otherwise-valid
 * token, and reporting that as "invalid or expired session" sends the user to
 * the wrong place.
 *
 * Probes the endpoint directly rather than through the jose resolver: jose
 * resolves `undefined` both for an empty key set and for a transport failure,
 * which are exactly the two cases this has to tell apart. Only called after a
 * verification failure, so it never runs on the happy path.
 */
export async function inspectHubSigningKeys(): Promise<HubSigningKeyState> {
  const url = config.auth.accessTokenJwksUrl
  if (!url) return getHubPublicKeys().length > 0 ? 'ok' : 'not-configured'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal })
    if (!response.ok) return 'unreachable'
    const body = await response.json().catch(() => null) as { keys?: unknown[] } | null
    return Array.isArray(body?.keys) && body.keys.length > 0 ? 'ok' : 'empty'
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
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
 * Hub tokens are RS256 since P3. Verification order is: the Hub's published key
 * set (rotates without a rebuild), then a pinned public key (works offline),
 * then the legacy HS256 shared secret for tokens minted before the rotation.
 * `none` and every other algorithm are refused, and a token that no path
 * verifies is never treated as valid.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  let header: { alg?: string, kid?: string }
  try {
    header = decodeProtectedHeader(token) as { alg?: string, kid?: string }
  } catch {
    return null
  }

  if (header.alg === 'RS256' || header.alg === 'ES256') {
    const viaJwks = await verifyViaRemoteJwks(token, header.alg)
    if (viaJwks) return viaJwks as unknown as TokenPayload
    if (header.alg !== 'RS256') return null
    const pinned = await verifyRsa(token, header.kid)
    return pinned as unknown as TokenPayload | null
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
