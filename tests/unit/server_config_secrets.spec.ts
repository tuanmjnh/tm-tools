/**
 * The public installer ships `.output`, so no credential may survive a build:
 * every secret slot reads the environment at call time and has NO hardcoded
 * fallback. A missing secret must surface as "not configured", never as a
 * silently wrong key that turns every request into 401 `error.invalidToken`.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../../server/config/index'

const SECRET_ENV = [
  'AUTH_JWT_SECRET',
  'AUTH_REFRESH_TOKEN_SECRET',
  'NUXT_HUB_APP_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'FIREBASE_PRIVATE_KEY',
  'WEB_PUSH_PRIVATE_KEY'
]

const saved = new Map<string, string | undefined>()
beforeEach(() => {
  for (const key of [...SECRET_ENV, 'AUTH_JWT_PUBLIC_KEYS', 'NUXT_PUBLIC_HUB_APP_ID']) {
    saved.set(key, process.env[key])
    Reflect.deleteProperty(process.env, key)
  }
})
afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
  saved.clear()
})

describe('server config — no baked credentials', () => {
  it('every secret slot is empty when the environment says nothing', () => {
    const config = loadConfig()
    const slots: Record<string, string> = {
      AUTH_JWT_SECRET: config.auth.accessTokenSecret,
      AUTH_REFRESH_TOKEN_SECRET: config.auth.refreshTokenSecret,
      NUXT_HUB_APP_SECRET: config.hub.appSecret,
      SUPABASE_SERVICE_ROLE_KEY: config.supabase.serviceRoleKey,
      CLOUDINARY_API_KEY: config.cloudinary.apiKey,
      CLOUDINARY_API_SECRET: config.cloudinary.apiSecret,
      FIREBASE_PRIVATE_KEY: config.firebase.privateKey,
      WEB_PUSH_PRIVATE_KEY: config.webPush.privateKey
    }
    for (const [key, value] of Object.entries(slots)) {
      assert.equal(value, '', `${key} must have no hardcoded fallback`)
    }
  })

  it('the app id has no invented literal default', () => {
    assert.equal(loadConfig().hub.appId, '')
  })

  it('RS256 public keys are public config, read live, with no baked default', () => {
    const config = loadConfig()
    assert.equal(config.auth.accessTokenPublicKeys, '')
    process.env.AUTH_JWT_PUBLIC_KEYS = '[{"kty":"RSA"}]'
    assert.equal(config.auth.accessTokenPublicKeys, '[{"kty":"RSA"}]')
  })

  it('secrets are read live, so saving desktop settings applies without a restart', () => {
    const config = loadConfig()
    assert.equal(config.auth.accessTokenSecret, '')
    process.env.AUTH_JWT_SECRET = 'test-only-secret-value'
    assert.equal(config.auth.accessTokenSecret, 'test-only-secret-value')
    process.env.NUXT_HUB_APP_SECRET = 'test-only-app-secret'
    assert.equal(config.hub.appSecret, 'test-only-app-secret')
    process.env.NUXT_PUBLIC_HUB_APP_ID = 'tm-tools_test'
    assert.equal(config.hub.appId, 'tm-tools_test')
  })
})

describe('build output — secret scan gate', () => {
  it('no .env secret value appears in the shipped server chunks', () => {
    const output = join(process.cwd(), '.output', 'server', 'chunks')
    if (!existsSync(output) || !existsSync(join(process.cwd(), '.env'))) return
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    const secrets: string[] = []
    for (const key of SECRET_ENV) {
      const match = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
      const value = match?.[1]?.trim()
      if (value && value.length >= 16) secrets.push(value)
    }
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(mjs|js|json)$/.test(entry.name)) files.push(full)
      }
    }
    walk(output)
    const leaked: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // Report the file only — never the matched value.
      if (secrets.some(secret => source.includes(secret))) leaked.push(file)
    }
    assert.deepEqual(leaked, [], 'secret values are baked into the build output')
  })
})
