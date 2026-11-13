/**
 * P5 build-time public config: only the Hub URL, the app id and PUBLIC JWKs may
 * be embedded in a packaged build. A secret-looking key that appears later in
 * `.env` must never reach `resources/public-config.json`, and a JWK carrying
 * `d` is refused even though the file is "just config".
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { bakePublicConfig, applyPublicConfig, PUBLIC_CONFIG_KEYS, FILE_NAME } = require('../../electron/tools/public-config.cjs')

const JWT_SECRET = 'shared-secret-must-never-ship'
const APP_SECRET = 'app-secret-must-never-ship'
const PUBLIC_JWK = { kty: 'RSA', kid: 'hub-1', alg: 'RS256', n: 'abc', e: 'AQAB' }

let root: string

function writeEnv(values: Record<string, string>) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
  writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`, 'utf8')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tm-public-config-'))
  mkdirSync(join(root, 'resources'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('bake-public-config — allow-list only', () => {
  it('writes hub url, app id and public keys, and drops every secret', () => {
    writeEnv({
      NUXT_PUBLIC_HUB_URL: 'https://hub.example.test',
      NUXT_PUBLIC_HUB_APP_ID: 'tm-tools_test',
      AUTH_JWT_PUBLIC_KEYS: JSON.stringify([PUBLIC_JWK]),
      AUTH_JWT_JWKS_URL: 'https://hub.example.test/api/v1/auth/jwks',
      AUTH_JWT_SECRET: JWT_SECRET,
      NUXT_HUB_APP_SECRET: APP_SECRET
    })

    const result = bakePublicConfig({ projectRoot: root, env: {} })
    assert.deepEqual(result.keys.sort(), [...PUBLIC_CONFIG_KEYS].sort())

    const text = readFileSync(join(root, 'resources', FILE_NAME), 'utf8')
    assert.match(text, /hub\.example\.test/)
    assert.equal(text.includes(JWT_SECRET), false)
    assert.equal(text.includes(APP_SECRET), false)
    assert.equal(JSON.parse(text).AUTH_JWT_SECRET, undefined)
    assert.equal(JSON.parse(text).NUXT_HUB_APP_SECRET, undefined)
  })

  it('bakes the JWKS endpoint so keys rotate without a new installer', () => {
    writeEnv({
      NUXT_PUBLIC_HUB_URL: 'https://hub.example.test',
      NUXT_PUBLIC_HUB_APP_ID: 'tm-tools_test',
      AUTH_JWT_PUBLIC_KEYS: JSON.stringify([PUBLIC_JWK]),
      AUTH_JWT_JWKS_URL: 'https://hub.example.test/api/v1/auth/jwks'
    })

    bakePublicConfig({ projectRoot: root, env: {} })
    const written = JSON.parse(readFileSync(join(root, 'resources', FILE_NAME), 'utf8'))
    assert.equal(written.AUTH_JWT_JWKS_URL, 'https://hub.example.test/api/v1/auth/jwks')
    // A symmetric secret must never reach the desktop, whatever .env holds.
    assert.equal(written.AUTH_JWT_SECRET, undefined)
  })

  it('refuses a key set that carries a private exponent', () => {
    writeEnv({ AUTH_JWT_PUBLIC_KEYS: JSON.stringify([{ ...PUBLIC_JWK, d: 'private' }]) })
    assert.throws(
      () => bakePublicConfig({ projectRoot: root, env: {} }),
      /must be a non-empty array of public RSA JWKs/
    )
  })

  it('refuses malformed key JSON', () => {
    writeEnv({ AUTH_JWT_PUBLIC_KEYS: '{not json' })
    assert.throws(() => bakePublicConfig({ projectRoot: root, env: {} }), /not valid JSON/)
  })

  it('lets the shell env win over .env', () => {
    writeEnv({ NUXT_PUBLIC_HUB_URL: 'https://from-file.test', NUXT_PUBLIC_HUB_APP_ID: 'file-app' })
    bakePublicConfig({ projectRoot: root, env: { NUXT_PUBLIC_HUB_URL: 'https://from-shell.test' } })
    const written = JSON.parse(readFileSync(join(root, 'resources', FILE_NAME), 'utf8'))
    assert.equal(written.NUXT_PUBLIC_HUB_URL, 'https://from-shell.test')
    assert.equal(written.NUXT_PUBLIC_HUB_APP_ID, 'file-app')
  })
})

describe('apply-public-config — defaults only', () => {
  it('fills missing keys and keeps an explicit value', () => {
    const file = join(root, 'resources', FILE_NAME)
    writeFileSync(file, JSON.stringify({
      NUXT_PUBLIC_HUB_URL: 'https://baked.test',
      NUXT_PUBLIC_HUB_APP_ID: 'baked-app',
      AUTH_JWT_PUBLIC_KEYS: JSON.stringify([PUBLIC_JWK])
    }), 'utf8')

    const env: Record<string, string> = { NUXT_PUBLIC_HUB_APP_ID: 'user-config' }
    const applied = applyPublicConfig(file, env)
    assert.equal(env.NUXT_PUBLIC_HUB_URL, 'https://baked.test')
    assert.equal(env.NUXT_PUBLIC_HUB_APP_ID, 'user-config')
    assert.deepEqual(applied.sort(), ['AUTH_JWT_PUBLIC_KEYS', 'NUXT_PUBLIC_HUB_URL'])
  })

  it('does nothing when the file is absent', () => {
    const env: Record<string, string> = {}
    assert.deepEqual(applyPublicConfig(join(root, 'missing.json'), env), [])
    assert.deepEqual(env, {})
  })
})

/**
 * The reported bug: `pnpm dev:electron` login answered "Hub URL and App ID are
 * not configured". Dev loads the renderer from the Nuxt dev server and never
 * calls `startServer()`, so applying the baked file inside that function left
 * the auth broker with an empty app id. The call must sit on the startup path
 * both modes take, after config.env has had its chance to win.
 */
describe('main.cjs applies the baked config in dev too', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const main = readFileSync(join(repoRoot, 'electron', 'main.cjs'), 'utf8')

  it('applies it from app.whenReady, not from startServer', () => {
    const ready = main.slice(main.indexOf('app.whenReady()'))
    assert.ok(
      /loadUserConfig\(\)\s*\n\s*applyBakedPublicConfig\(\)/.test(ready),
      'whenReady must load config.env then apply the baked public config'
    )
    const startServer = main.slice(main.indexOf('async function startServer()'))
    const body = startServer.slice(0, startServer.indexOf('\n}'))
    assert.ok(
      !/applyPublicConfig\(/.test(body),
      'startServer is packaged-only; the call belongs on the shared startup path'
    )
  })

  it('resolves the packaged and dev locations separately', () => {
    assert.ok(/process\.resourcesPath.*resources.*public-config\.json/s.test(main))
    assert.ok(/__dirname,\s*'\.\.',\s*'resources',\s*'public-config\.json'/.test(main))
  })
})
