/**
 * Which identity this server presents to TM Hub (`resolveHubCallerDetailed`).
 *
 * The point of these specs is that a stored credential is either used for the
 * Hub that issued it, or not used at all — there is no third outcome where a
 * stale or half-written credential quietly becomes something else.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const PROD = 'https://hub.prod.test'
const LOCAL = 'http://localhost:4000'
const APP = 'tm-tools_app'

// `config.hub.url` is a plain value captured when the module loads (only the
// credential slots are getters), so the Hub this "process" points at has to be
// in the environment before the import runs.
process.env.NUXT_PUBLIC_HUB_URL = PROD
process.env.NUXT_PUBLIC_HUB_APP_ID = APP

const { resolveHubCallerDetailed, hubStorageNamespace } = await import('../../server/utils/hubIdentity')

const ENV_KEYS = [
  'NUXT_PUBLIC_HUB_URL', 'NUXT_PUBLIC_HUB_APP_ID', 'NUXT_HUB_APP_SECRET',
  'HUB_DEVICE_ID', 'HUB_DEVICE_SECRET', 'HUB_DEVICE_USER_ID',
  'HUB_DEVICE_APP_ID', 'HUB_DEVICE_HUB_ORIGIN', 'HUB_DEVICE_EXPIRES_AT', 'HUB_DEVICE_SCOPES'
]

const saved = new Map<string, string | undefined>()
beforeEach(() => {
  for (const key of ENV_KEYS) {
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

function enroll(overrides: Record<string, string> = {}) {
  process.env.HUB_DEVICE_ID = 'dev-1'
  process.env.HUB_DEVICE_SECRET = 'secret-1'
  process.env.HUB_DEVICE_USER_ID = 'user-1'
  process.env.HUB_DEVICE_APP_ID = APP
  process.env.HUB_DEVICE_HUB_ORIGIN = PROD
  Object.assign(process.env, overrides)
}

describe('device caller', () => {
  it('is used for the Hub and app that issued it', () => {
    enroll()
    const { caller, issue } = resolveHubCallerDetailed()
    assert.equal(issue, null)
    assert.equal(caller?.kind, 'device')
    assert.equal(caller?.appId, APP)
    assert.equal(caller?.userId, 'user-1')
    assert.equal(caller?.headers['X-Device-Id'], 'dev-1')
  })

  it('is refused when this build points at another Hub', () => {
    enroll({ HUB_DEVICE_HUB_ORIGIN: LOCAL })
    const { caller, issue, storedOrigin } = resolveHubCallerDetailed()
    assert.equal(caller, null)
    assert.equal(issue, 'hub-mismatch')
    assert.equal(storedOrigin, LOCAL)
  })

  it('is refused when the app id changed but the Hub did not', () => {
    process.env.NUXT_PUBLIC_HUB_APP_ID = APP
    enroll({ HUB_DEVICE_HUB_ORIGIN: PROD, HUB_DEVICE_APP_ID: 'tm-tools_other' })
    const { caller, issue } = resolveHubCallerDetailed()
    assert.equal(caller, null)
    assert.equal(issue, 'app-mismatch')
  })

  it('is refused when it carries no recording of its Hub', () => {
    enroll({ HUB_DEVICE_HUB_ORIGIN: '' })
    const { caller, issue } = resolveHubCallerDetailed()
    assert.equal(caller, null)
    assert.equal(issue, 'legacy-no-origin')
  })

  it('fails closed on half a pair instead of downgrading to the App Secret', () => {
    enroll({ HUB_DEVICE_SECRET: '' })
    process.env.NUXT_HUB_APP_SECRET = 'app-secret'
    const { caller, issue } = resolveHubCallerDetailed()
    assert.equal(caller, null, 'a half credential must not become an app caller')
    assert.equal(issue, 'incomplete-pair')
  })
})

describe('app caller', () => {
  it('is used when nothing is enrolled', () => {
    process.env.NUXT_PUBLIC_HUB_APP_ID = APP
    process.env.NUXT_HUB_APP_SECRET = 'app-secret'
    const { caller, issue } = resolveHubCallerDetailed()
    assert.equal(issue, null)
    assert.equal(caller?.kind, 'app')
    assert.equal(caller?.headers['X-App-Secret'], 'app-secret')
  })

  it('is absent when either half is missing', () => {
    process.env.NUXT_HUB_APP_SECRET = 'app-secret'
    assert.equal(resolveHubCallerDetailed().caller, null, 'no app id, no caller')
    delete process.env.NUXT_HUB_APP_SECRET
    process.env.NUXT_PUBLIC_HUB_APP_ID = APP
    assert.equal(resolveHubCallerDetailed().caller, null, 'no app secret, no caller')
  })
})

describe('storage namespace', () => {
  it('confines a device caller to its own user namespace', () => {
    enroll()
    assert.equal(hubStorageNamespace('tm-tools/pdf'), 'users/user-1')
  })

  it('keeps the deployment namespace for an app caller', () => {
    process.env.NUXT_HUB_APP_SECRET = 'app-secret'
    assert.equal(hubStorageNamespace('tm-tools/pdf'), 'tm-tools/pdf')
  })

  it('keeps the deployment namespace when the device credential is refused', () => {
    enroll({ HUB_DEVICE_HUB_ORIGIN: LOCAL })
    assert.equal(hubStorageNamespace('tm-tools/pdf'), 'tm-tools/pdf')
  })
})
