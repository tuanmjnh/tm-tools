/**
 * P1 — administrative configuration is root-only.
 *
 * The UI hides the Hub settings page and tab for non-root users, but these two
 * rules are what actually decide: the server claim check and the Electron
 * main-process gate that guards `set-config`. A direct API or IPC call must be
 * refused without the UI's help.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync, sign } from 'node:crypto'
import { createRequire } from 'node:module'
import { isRootClaims } from '../../server/utils/authz'

const require = createRequire(import.meta.url)
const { isRootAccessToken, isRootHs256Token } = require('../../electron/tools/root-token.cjs')

const SECRET = 'p1-test-shared-secret'

function hs256(payload: Record<string, unknown>, secret = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

describe('isRootClaims — Hub and legacy token shapes', () => {
  it('accepts a Hub token whose only root signal is the roles array', () => {
    assert.equal(isRootClaims({ sub: 'u1', roles: ['root'], permissions: [] }), true)
  })

  it('accepts a wildcard permission', () => {
    assert.equal(isRootClaims({ sub: 'u1', roles: ['admin'], permissions: ['*'] }), true)
  })

  it('accepts a legacy token that only carries role', () => {
    assert.equal(isRootClaims({ userId: 'u1', role: 'root', permissions: [] }), true)
  })

  it('refuses a normal user', () => {
    assert.equal(isRootClaims({ sub: 'u1', roles: ['editor'], permissions: ['content.read'] }), false)
  })

  it('refuses a missing payload', () => {
    assert.equal(isRootClaims(null), false)
    assert.equal(isRootClaims(undefined), false)
  })
})

describe('isRootHs256Token — desktop set-config gate', () => {
  const future = Math.floor(Date.now() / 1000) + 600

  it('accepts a valid root token', () => {
    assert.equal(isRootHs256Token(hs256({ sub: 'u1', roles: ['root'], exp: future }), SECRET), true)
  })

  it('refuses a valid non-root token', () => {
    assert.equal(isRootHs256Token(hs256({ sub: 'u1', roles: ['editor'], exp: future }), SECRET), false)
  })

  it('refuses a token signed with another secret', () => {
    assert.equal(isRootHs256Token(hs256({ sub: 'u1', roles: ['root'], exp: future }, 'other-secret'), SECRET), false)
  })

  it('refuses an expired root token', () => {
    const past = Math.floor(Date.now() / 1000) - 60
    assert.equal(isRootHs256Token(hs256({ sub: 'u1', roles: ['root'], exp: past }), SECRET), false)
  })

  it('refuses a tampered signature and a non-HS256 header', () => {
    const token = hs256({ sub: 'u1', roles: ['root'], exp: future })
    assert.equal(isRootHs256Token(`${token.slice(0, -2)}xx`, SECRET), false)
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ roles: ['root'] })).toString('base64url')
    assert.equal(isRootHs256Token(`${header}.${body}.`, SECRET), false)
  })

  it('refuses when there is no secret yet (nothing to verify with)', () => {
    assert.equal(isRootHs256Token(hs256({ roles: ['root'], exp: future }), ''), false)
  })
})

describe('isRootAccessToken — RS256 desktop set-config gate after P3', () => {
  const future = Math.floor(Date.now() / 1000) + 600
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string, e: string }
  const publicKeyJson = JSON.stringify([{ kty: 'RSA', kid: 'hub-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }])

  function rs256(payload: Record<string, unknown>, kid = 'hub-1', key = privateKey): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), key).toString('base64url')
    return `${header}.${body}.${sig}`
  }

  it('accepts an RS256 root token verified by the public key alone', () => {
    assert.equal(isRootAccessToken(rs256({ sub: 'u1', roles: ['root'], exp: future }), { publicKeys: publicKeyJson }), true)
  })

  it('refuses an RS256 non-root token', () => {
    assert.equal(isRootAccessToken(rs256({ sub: 'u1', roles: ['editor'], exp: future }), { publicKeys: publicKeyJson }), false)
  })

  it('refuses an unknown kid and a foreign signature', () => {
    const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    assert.equal(isRootAccessToken(rs256({ roles: ['root'], exp: future }, 'hub-9'), { publicKeys: publicKeyJson }), false)
    assert.equal(isRootAccessToken(rs256({ roles: ['root'], exp: future }, 'hub-1', foreign), { publicKeys: publicKeyJson }), false)
  })

  it('refuses an expired RS256 token and a key entry holding private material', () => {
    const past = Math.floor(Date.now() / 1000) - 60
    assert.equal(isRootAccessToken(rs256({ roles: ['root'], exp: past }), { publicKeys: publicKeyJson }), false)
    const withPrivate = JSON.stringify([{ kty: 'RSA', kid: 'hub-1', n: jwk.n, e: jwk.e, d: 'leaked' }])
    assert.equal(isRootAccessToken(rs256({ roles: ['root'], exp: future }), { publicKeys: withPrivate }), false)
  })

  it('still accepts the legacy HS256 token when both arms are configured', () => {
    const options = { secret: SECRET, publicKeys: publicKeyJson }
    assert.equal(isRootAccessToken(hs256({ roles: ['root'], exp: future }), options), true)
  })
})
