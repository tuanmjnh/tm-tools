/**
 * P3 migration contract: the Hub signs RS256 and publishes public JWKs, while
 * the local server still has to accept the HS256 tokens issued before the
 * rotation. A wrong key, an unknown `kid` and `alg: none` must all fail.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { SignJWT } from 'jose'
import { hasAccessTokenVerificationMaterial, verifyAccessToken } from '../../server/utils/jwt'

const LEGACY_SECRET = 'legacy-shared-secret-for-tests-only'

function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string, e: string }
  return { privateKey, publicKey: { kty: 'RSA', kid: 'hub-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e } }
}

const current = keypair()
const other = keypair()

const saved = new Map<string, string | undefined>()
beforeEach(() => {
  for (const key of ['AUTH_JWT_PUBLIC_KEYS', 'AUTH_JWT_SECRET']) {
    saved.set(key, process.env[key])
    Reflect.deleteProperty(process.env, key)
  }
  process.env.AUTH_JWT_PUBLIC_KEYS = JSON.stringify([current.publicKey])
})
afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
  saved.clear()
})

const claims = { userId: 'u1', appId: 'tm-tools', roles: ['root'], permissions: ['*'] }

function rs256(privateKey: typeof current.privateKey, kid = 'hub-1') {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

function hs256(secret: string) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
}

describe('P3 — RS256 by kid with an HS256 legacy fallback', () => {
  it('accepts an RS256 token signed by the published key', async () => {
    const payload = await verifyAccessToken(await rs256(current.privateKey))
    assert.equal(payload?.userId, 'u1')
  })

  it('rejects an RS256 token whose kid is not published', async () => {
    assert.equal(await verifyAccessToken(await rs256(current.privateKey, 'hub-9')), null)
  })

  it('rejects an RS256 token signed by a key that does not match the published kid', async () => {
    assert.equal(await verifyAccessToken(await rs256(other.privateKey)), null)
  })

  it('accepts a legacy HS256 token while the shared secret is still configured', async () => {
    process.env.AUTH_JWT_SECRET = LEGACY_SECRET
    const payload = await verifyAccessToken(await hs256(LEGACY_SECRET))
    assert.equal(payload?.userId, 'u1')
  })

  it('rejects HS256 when the shared secret is absent (RS256-only deployment)', async () => {
    assert.equal(await verifyAccessToken(await hs256(LEGACY_SECRET)), null)
  })

  it('rejects an unsigned alg:none token even though the payload claims root', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    assert.equal(await verifyAccessToken(`${header}.${body}.`), null)
  })

  it('ignores a public key entry that carries private material (d)', async () => {
    process.env.AUTH_JWT_PUBLIC_KEYS = JSON.stringify([{ ...current.publicKey, d: 'leaked' }])
    assert.equal(await verifyAccessToken(await rs256(current.privateKey)), null)
  })

  it('verification material exists with public keys alone', () => {
    assert.equal(hasAccessTokenVerificationMaterial(), true)
    assert.equal(process.env.AUTH_JWT_SECRET, undefined)
  })

  it('reports "not configured" when neither keys nor the legacy secret exist', () => {
    delete process.env.AUTH_JWT_PUBLIC_KEYS
    assert.equal(hasAccessTokenVerificationMaterial(), false)
  })
})
