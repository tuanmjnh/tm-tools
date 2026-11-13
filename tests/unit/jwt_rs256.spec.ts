/**
 * P3 migration contract: the Hub signs RS256 and publishes public JWKs, while
 * the local server still has to accept the HS256 tokens issued before the
 * rotation. A wrong key, an unknown `kid` and `alg: none` must all fail.
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPairSync } from 'node:crypto'
import { SignJWT } from 'jose'
import { hasAccessTokenVerificationMaterial, inspectHubSigningKeys, verifyAccessToken } from '../../server/utils/jwt'

const LEGACY_SECRET = 'legacy-shared-secret-for-tests-only'

function keypair(kid = 'hub-1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string, e: string }
  return { privateKey, publicKey: { kty: 'RSA', kid, alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e } }
}

const current = keypair()
const other = keypair('hub-2')

const saved = new Map<string, string | undefined>()
beforeEach(() => {
  for (const key of ['AUTH_JWT_PUBLIC_KEYS', 'AUTH_JWT_SECRET', 'AUTH_JWT_JWKS_URL', 'NUXT_PUBLIC_HUB_URL']) {
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

/**
 * Production shape: the packaged client holds NO key. It fetches the Hub's
 * public JWKS and lets `kid` pick the key, which is what makes a Hub key
 * rotation work without shipping a new installer.
 */
describe('P1 — verification through the Hub JWKS endpoint', () => {
  const served: { keys: unknown[] } = { keys: [] }
  let server: ReturnType<typeof createServer>
  let url = ''

  before(async () => {
    server = createServer((req, res) => {
      if ((req.url || '').split('?')[0] === '/api/v1/auth/jwks') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ keys: served.keys }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    url = `http://127.0.0.1:${address.port}/api/v1/auth/jwks`
  })

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  beforeEach(() => {
    served.keys = [current.publicKey]
    // A packaged client has no pinned keys and no shared secret.
    delete process.env.AUTH_JWT_PUBLIC_KEYS
    delete process.env.AUTH_JWT_SECRET
    process.env.AUTH_JWT_JWKS_URL = url
  })

  it('verifies a token by the kid the Hub published', async () => {
    const payload = await verifyAccessToken(await rs256(current.privateKey))
    assert.equal(payload?.userId, 'u1')
  })

  it('rejects a token signed by an unpublished key', async () => {
    assert.equal(await verifyAccessToken(await rs256(other.privateKey, 'hub-2')), null)
  })

  it('rejects an expired token even when the signature is valid', async () => {
    const expired = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'hub-1' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(current.privateKey)
    assert.equal(await verifyAccessToken(expired), null)
  })

  it('refuses alg:none with a JWKS configured', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
    assert.equal(await verifyAccessToken(`${header}.${body}.`), null)
  })

  it('never treats an unreachable JWKS as a valid token', async () => {
    process.env.AUTH_JWT_JWKS_URL = 'http://127.0.0.1:1/api/v1/auth/jwks'
    assert.equal(await verifyAccessToken(await rs256(current.privateKey)), null)
  })

  it('counts the JWKS URL as verification material on its own', () => {
    assert.equal(process.env.AUTH_JWT_PUBLIC_KEYS, undefined)
    assert.equal(process.env.AUTH_JWT_SECRET, undefined)
    assert.equal(hasAccessTokenVerificationMaterial(), true)
  })

  it('reports an empty key set on a cold cache instead of blaming the token', async () => {
    // A fresh process (the real misconfiguration case): nothing cached yet.
    served.keys = []
    process.env.AUTH_JWT_JWKS_URL = `${url}?cold=1`
    assert.equal(await inspectHubSigningKeys(), 'empty')
  })

  it('probes the endpoint rather than trusting the cached resolver', async () => {
    // The resolver has already cached a key; the Hub now serves none. The
    // diagnostic must describe the Hub as it is, not as it was.
    served.keys = []
    assert.equal(await inspectHubSigningKeys(), 'empty')
  })

  it('reports an unreachable key endpoint as such', async () => {
    process.env.AUTH_JWT_JWKS_URL = 'http://127.0.0.1:1/api/v1/auth/jwks'
    assert.equal(await inspectHubSigningKeys(), 'unreachable')
  })

  it('reports ok once the Hub publishes a key', async () => {
    assert.equal(await inspectHubSigningKeys(), 'ok')
  })

  it('does not claim the Hub is broken when keys were pinned at build time', async () => {
    delete process.env.AUTH_JWT_JWKS_URL
    process.env.AUTH_JWT_PUBLIC_KEYS = JSON.stringify([current.publicKey])
    assert.equal(await inspectHubSigningKeys(), 'ok')
  })
})
