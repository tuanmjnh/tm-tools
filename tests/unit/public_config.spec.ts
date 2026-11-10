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
import { join } from 'node:path'

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
