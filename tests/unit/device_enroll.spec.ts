/**
 * P4 — per-device enrollment against TM Hub.
 *
 * The public build carries no shared secret: Main asks Hub for a device code,
 * the renderer shows the short code and only learns metadata, and the issued
 * credential is written to config.env through the vault. This spec drives
 * every branch of the controller with an injected fetch, so the security
 * contract (secret never in the result, root gate on credential changes,
 * single-use codes) is pinned without a live Hub.
 */
import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createDeviceEnroller, DEVICE_KEYS } = require('../../electron/tools/device-enroll.cjs')
const { readConfigFile, writeConfigValues } = require('../../electron/tools/config-file.cjs')

const dir = mkdtempSync(join(tmpdir(), 'tm-tools-enroll-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const HUB = 'http://127.0.0.1:4998'
const SECRET = 'device-secret-never-returned'
const APP = 'tm-tools'

const AUTHORIZE = {
  success: true,
  data: {
    deviceCode: 'dc-1',
    userCode: 'ABCD-EFGH',
    verificationUri: `${HUB}/device`,
    verificationUriComplete: `${HUB}/device?code=ABCD-EFGH`,
    expiresIn: 600,
    interval: 1
  }
}

const CREDENTIAL = {
  deviceId: 'dev-1',
  secret: SECRET,
  userId: 'user-1',
  appId: APP,
  scopes: ['ai.relay', 'storage.user'],
  expiresAt: '2027-01-01T00:00:00.000Z'
}

const ENV_KEYS = ['NUXT_PUBLIC_HUB_URL', 'NUXT_PUBLIC_HUB_APP_ID', 'AUTH_JWT_SECRET', 'AUTH_JWT_PUBLIC_KEYS', ...DEVICE_KEYS]

let n = 0
function configFile(contents = '') {
  const path = join(dir, `config-${n++}.env`)
  writeFileSync(path, contents, 'utf8')
  return path
}

function baseConfig(extra = '') {
  return `NUXT_PUBLIC_HUB_URL=${HUB}\nNUXT_PUBLIC_HUB_APP_ID=${APP}\n${extra}`
}

function json(status: number, payload: unknown): Response {
  return Response.json(payload, { status })
}

interface Call { url: string, body: Record<string, unknown> }

function enroller(file: string, routes: Record<string, (call: Call) => Response | Promise<Response>>, extra: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const progress: Array<Record<string, unknown>> = []
  const opened: string[] = []
  const instance = createDeviceEnroller({
    configFile: () => file,
    readConfigFile,
    writeConfigValues,
    isRootAccessToken: () => false,
    openExternal: async (url: string) => {
      opened.push(url)
      return true
    },
    onProgress: (payload: Record<string, unknown>) => progress.push(payload),
    fetchImpl: async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      const call = { url: String(url), body }
      calls.push(call)
      const route = Object.entries(routes).find(([suffix]) => String(url).endsWith(suffix))
      if (!route) throw new Error(`unexpected fetch ${url}`)
      return await route[1]!(call)
    },
    ...extra
  })
  return { instance, calls, progress, opened }
}

const issued = () => json(200, { success: true, data: CREDENTIAL })

beforeEach(() => {
  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key)
})

describe('device enrollment — status', () => {
  it('reports unenrolled with empty metadata and no secret field', () => {
    const { instance } = enroller(configFile(baseConfig()), {})
    assert.deepEqual(instance.status(), {
      enrolled: false,
      deviceId: '',
      appId: '',
      userId: '',
      expiresAt: '',
      scopes: []
    })
  })

  it('reports enrolled metadata but never the stored secret', () => {
    const file = configFile(baseConfig([
      `HUB_DEVICE_ID=dev-1`,
      `HUB_DEVICE_SECRET=${SECRET}`,
      'HUB_DEVICE_USER_ID=user-1',
      `HUB_DEVICE_APP_ID=${APP}`,
      'HUB_DEVICE_EXPIRES_AT=2027-01-01T00:00:00.000Z',
      'HUB_DEVICE_SCOPES=ai.relay,storage.user'
    ].join('\n') + '\n'))
    const { instance } = enroller(file, {})
    const status = instance.status()
    assert.equal(status.enrolled, true)
    assert.equal(status.deviceId, 'dev-1')
    assert.deepEqual(status.scopes, ['ai.relay', 'storage.user'])
    assert.equal(JSON.stringify(status).includes(SECRET), false)
  })
})

describe('device enrollment — authorization flow', () => {
  it('pending → 428 → issued writes the credential and returns metadata only', async () => {
    const file = configFile(baseConfig())
    let polls = 0
    const { instance, calls, progress, opened } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => (++polls === 1
        ? json(428, { error: true, statusMessage: 'error.authorizationPending' })
        : issued())
    })

    const result = await instance.enroll({ accessToken: 'user-jwt' })

    assert.equal(result.success, true)
    assert.equal(result.enrolled, true)
    assert.equal(result.deviceId, 'dev-1')
    assert.deepEqual(result.scopes, ['ai.relay', 'storage.user'])
    assert.equal(JSON.stringify(result).includes(SECRET), false)
    assert.equal(progress.map(p => p.phase).join(','), 'authorizing,pending,issued')
    assert.equal(progress[1]!.userCode, 'ABCD-EFGH')
    assert.deepEqual(opened, [`${HUB}/device?code=ABCD-EFGH`])

    const stored = readConfigFile(file).values
    assert.equal(stored.HUB_DEVICE_ID, 'dev-1')
    assert.equal(stored.HUB_DEVICE_USER_ID, 'user-1')
    assert.equal(stored.HUB_DEVICE_APP_ID, APP)
    assert.equal(stored.HUB_DEVICE_SCOPES, 'ai.relay,storage.user')
    assert.match(String(stored.HUB_DEVICE_SECRET), new RegExp(`^(tmcut:enc:v1:.+|${SECRET})$`))
    assert.equal(process.env.HUB_DEVICE_ID, 'dev-1')
    assert.equal(process.env.HUB_DEVICE_SECRET, stored.HUB_DEVICE_SECRET)

    // The authorize body names the app and platform, never a local secret.
    const authorize = calls.find(call => call.url.endsWith('/authorize'))!
    assert.equal(authorize.body.appId, APP)
    assert.equal('secret' in authorize.body, false)
    assert.equal(JSON.stringify(calls).includes(SECRET), false)
  })

  it('a fresh install enrolls without any local secret or root token', async () => {
    const file = configFile(baseConfig())
    const { instance } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => issued()
    }, { isRootAccessToken: () => false })

    const result = await instance.enroll({ accessToken: '' })
    assert.equal(result.success, true)
  })

  it('403 marks the approval denied and writes nothing', async () => {
    const file = configFile(baseConfig())
    const { instance, progress } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => json(403, { error: true, statusMessage: 'error.deviceDenied' })
    })

    const result = await instance.enroll({ accessToken: 'user-jwt' })
    assert.deepEqual(result, { success: false, code: 'denied' })
    assert.equal(progress.at(-1)!.phase, 'denied')
    assert.equal('HUB_DEVICE_ID' in readConfigFile(file).values, false)
  })

  it('400 marks the code expired', async () => {
    const file = configFile(baseConfig())
    const { instance, progress } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => json(400, { error: true, statusMessage: 'error.deviceCodeExpired' })
    })

    const result = await instance.enroll({ accessToken: 'user-jwt' })
    assert.deepEqual(result, { success: false, code: 'expired' })
    assert.equal(progress.at(-1)!.phase, 'expired')
    assert.equal('HUB_DEVICE_ID' in readConfigFile(file).values, false)
  })

  it('an unreachable Hub is unreachable, not rejected', async () => {
    const file = configFile(baseConfig())
    const { instance } = enroller(file, {
      '/authorize': () => { throw new Error('ECONNREFUSED') },
      '/token': () => issued()
    })

    assert.deepEqual(await instance.enroll({ accessToken: 'user-jwt' }), { success: false, code: 'unreachable' })
  })

  it('a non-200 authorize is rejected and keeps the Hub code', async () => {
    const file = configFile(baseConfig())
    const { instance } = enroller(file, {
      '/authorize': () => json(400, { error: true, statusMessage: 'device.unknown_app' }),
      '/token': () => issued()
    })

    const result = await instance.enroll({ accessToken: 'user-jwt' })
    assert.equal(result.success, false)
    assert.equal(result.code, 'rejected')
    assert.equal(result.hubCode, 'device.unknown_app')
  })

  it('refuses to call Hub before the public Hub URL and App ID exist', async () => {
    const file = configFile('NUXT_PUBLIC_HUB_URL=http://127.0.0.1:4998\n')
    const { instance, calls } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => issued()
    })

    assert.deepEqual(await instance.enroll({ accessToken: 'user-jwt' }), { success: false, code: 'notConfigured' })
    assert.equal(calls.length, 0)
  })

  it('rejects a second enrollment while one is in flight', async () => {
    const file = configFile(baseConfig())
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { instance } = enroller(file, {
      '/authorize': async () => {
        await gate
        return json(400, { error: true })
      },
      '/token': () => issued()
    })

    const first = instance.enroll({ accessToken: 'user-jwt' })
    const second = await instance.enroll({ accessToken: 'user-jwt' })
    assert.deepEqual(second, { success: false, code: 'busy' })

    release()
    assert.equal((await first).success, false)
  })
})

describe('device enrollment — root gate and forget', () => {
  it('re-enrolling an enrolled device requires a root token', async () => {
    const file = configFile(baseConfig([
      'AUTH_JWT_SECRET=local-shared-secret',
      'HUB_DEVICE_ID=dev-1',
      `HUB_DEVICE_SECRET=${SECRET}`
    ].join('\n') + '\n'))
    const { instance, calls } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => issued()
    }, { isRootAccessToken: () => false })

    assert.deepEqual(await instance.enroll({ accessToken: 'user-jwt' }), { success: false, code: 'notRoot' })
    assert.equal(calls.length, 0)
    assert.equal(readConfigFile(file).values.HUB_DEVICE_ID, 'dev-1')
  })

  it('a root token may rotate the credential', async () => {
    const file = configFile(baseConfig([
      'AUTH_JWT_SECRET=local-shared-secret',
      'HUB_DEVICE_ID=dev-old',
      'HUB_DEVICE_SECRET=old-secret'
    ].join('\n') + '\n'))
    const { instance } = enroller(file, {
      '/authorize': () => json(200, AUTHORIZE),
      '/token': () => issued()
    }, { isRootAccessToken: () => true })

    const result = await instance.enroll({ accessToken: 'root-jwt' })
    assert.equal(result.success, true)
    assert.equal(readConfigFile(file).values.HUB_DEVICE_ID, 'dev-1')
  })

  it('forget removes only the device keys and keeps the rest of config.env', () => {
    const file = configFile(baseConfig([
      'AI_MODEL=gemini',
      'HUB_DEVICE_ID=dev-1',
      `HUB_DEVICE_SECRET=${SECRET}`,
      'HUB_DEVICE_USER_ID=user-1',
      `HUB_DEVICE_APP_ID=${APP}`,
      'HUB_DEVICE_EXPIRES_AT=2027-01-01T00:00:00.000Z',
      'HUB_DEVICE_SCOPES=ai.relay,storage.user'
    ].join('\n') + '\n'))
    const { instance } = enroller(file, {}, { isRootAccessToken: () => true })

    assert.deepEqual(instance.forget({ accessToken: 'root-jwt' }), { success: true, enrolled: false })
    const stored = readConfigFile(file).values
    for (const key of DEVICE_KEYS) assert.equal(key in stored, false, `${key} still stored`)
    assert.equal(stored.AI_MODEL, 'gemini')
    assert.equal(stored.NUXT_PUBLIC_HUB_APP_ID, APP)
    const raw = readFileSync(file, 'utf8')
    assert.equal(raw.includes(SECRET), false)
    assert.equal(instance.status().enrolled, false)
  })

  it('forget is a no-op on a device that was never enrolled', () => {
    const file = configFile(baseConfig())
    const { instance } = enroller(file, {})
    assert.deepEqual(instance.forget({ accessToken: 'user-jwt' }), { success: true, enrolled: false })
  })

  it('non-root cannot forget an enrolled credential when a local secret exists', () => {
    const file = configFile(baseConfig([
      'AUTH_JWT_SECRET=local-shared-secret',
      'HUB_DEVICE_ID=dev-1',
      `HUB_DEVICE_SECRET=${SECRET}`
    ].join('\n') + '\n'))
    const { instance } = enroller(file, {}, { isRootAccessToken: () => false })

    assert.deepEqual(instance.forget({ accessToken: 'user-jwt' }), { success: false, code: 'notRoot' })
    assert.equal(readConfigFile(file).values.HUB_DEVICE_ID, 'dev-1')
  })
})
