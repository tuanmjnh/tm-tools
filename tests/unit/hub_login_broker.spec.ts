/**
 * Hub auth broker (v2) — the Electron Main trust boundary.
 *
 * Pins the rules that must never regress:
 *  - the renderer-visible payload NEVER contains `deviceCredential`;
 *  - the issued secret is written to the vault through `writeConfigValues`
 *    and mirrored into `process.env` for the local Nitro server;
 *  - a TOTP password step carries no credential, and the second factor does;
 *  - every full-session call sends the nested device identity;
 *  - a vault write failure drops the credential instead of leaking it;
 *  - Hub rejections surface the statusMessage so the UI keeps actionable copy.
 */
import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createHubLoginBroker } = require('../../electron/tools/hub-login-broker.cjs')

const HUB = 'http://hub.test'
const APP = 'tm-tools_4e2ygb'
const SECRET = 'device-secret-never-returned'

const calls: Array<{ url: string, body: Record<string, unknown> }> = []
let respond: (url: string, body: Record<string, unknown>) => { status: number, body: unknown } = () => ({ status: 500, body: null })
let vaultWrites: Array<Record<string, string>> = []
let vaultShouldThrow = false

const values: Record<string, string> = {
  NUXT_PUBLIC_HUB_URL: HUB,
  NUXT_PUBLIC_HUB_APP_ID: APP
}

const broker = createHubLoginBroker({
  configFile: () => 'config.env',
  readConfigFile: () => ({ exists: true, values: { ...values } }),
  writeConfigValues: (_file: string, next: Record<string, string>) => {
    if (vaultShouldThrow) throw new Error('vault unavailable')
    vaultWrites.push({ ...next })
    Object.assign(values, next)
  },
  fetchImpl: async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body)
    calls.push({ url, body })
    const reply = respond(url, body)
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body
    }
  },
  platform: 'win32',
  arch: 'x64',
  version: '9.9.9'
})

const SESSION = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 900,
  user: { id: 'u1', email: 'a@b.c', name: 'A', appId: APP }
}

beforeEach(() => {
  calls.length = 0
  vaultWrites = []
  vaultShouldThrow = false
  delete process.env.HUB_DEVICE_SECRET
  delete process.env.HUB_DEVICE_ID
  delete process.env.HUB_DEVICE_HUB_ORIGIN
  delete values.HUB_DEVICE_ID
  delete values.HUB_DEVICE_SECRET
  delete values.HUB_DEVICE_USER_ID
  delete values.HUB_DEVICE_APP_ID
  delete values.HUB_DEVICE_HUB_ORIGIN
  delete values.HUB_DEVICE_EXPIRES_AT
  delete values.HUB_DEVICE_SCOPES
})

after(() => {
  delete process.env.HUB_DEVICE_SECRET
  delete process.env.HUB_DEVICE_ID
  delete process.env.HUB_DEVICE_HUB_ORIGIN
})

describe('deviceInfo', () => {
  it('returns metadata only — no machine id, no secret', () => {
    const info = broker.deviceInfo()
    assert.equal(info?.identityKind, 'electron-machine')
    assert.match(info!.deviceId, /^[0-9a-f]{64}$/)
    assert.equal(info?.deviceType, 'desktop')
    assert.equal(info?.platform, 'desktop')
    assert.equal(info?.osPlatform, 'win32')
    assert.equal(info?.appVersion, '9.9.9')
    assert.equal(JSON.stringify(info).includes(SECRET), false)
  })
})

describe('login', () => {
  it('sends the nested device identity and asks for a credential', async () => {
    respond = () => ({ status: 200, body: { success: true, data: { ...SESSION } } })
    const result = await broker.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, true)

    const sent = calls[0]!.body
    assert.equal(sent.appId, APP)
    assert.equal(sent.requestDeviceCredential, true)
    assert.equal((sent.device as Record<string, unknown>).identityKind, 'electron-machine')
    assert.equal(sent.platform, 'desktop')
  })

  it('persists the credential, mirrors it into env, and strips it from the result', async () => {
    respond = () => ({
      status: 200,
      body: {
        success: true,
        data: {
          ...SESSION,
          deviceCredential: { deviceId: 'dc-1', secret: SECRET, expiresAt: '2027-01-01T00:00:00.000Z', scopes: ['ai.relay'] }
        }
      }
    })

    const result = await broker.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, true)
    assert.equal(result.credentialPersisted, true)
    assert.equal('deviceCredential' in (result.data as object), false)
    assert.equal(JSON.stringify(result).includes(SECRET), false)

    assert.equal(values.HUB_DEVICE_ID, 'dc-1')
    assert.equal(values.HUB_DEVICE_SECRET, SECRET)
    assert.equal(values.HUB_DEVICE_SCOPES, 'ai.relay')
    // Owner + app binding come from the session, so storage namespacing works.
    assert.equal(values.HUB_DEVICE_USER_ID, 'u1')
    assert.equal(values.HUB_DEVICE_APP_ID, APP)
    // The issuing Hub is recorded: the credential must never travel to another.
    assert.equal(values.HUB_DEVICE_HUB_ORIGIN, HUB)
    assert.equal(process.env.HUB_DEVICE_SECRET, SECRET)
    assert.equal(process.env.HUB_DEVICE_HUB_ORIGIN, HUB)
  })

  it('drops the credential instead of leaking it when the vault write fails', async () => {
    vaultShouldThrow = true
    respond = () => ({
      status: 200,
      body: { success: true, data: { ...SESSION, deviceCredential: { deviceId: 'dc-1', secret: SECRET, expiresAt: '', scopes: [] } } }
    })

    const result = await broker.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, true)
    assert.equal(result.credentialPersisted, false)
    assert.equal(JSON.stringify(result).includes(SECRET), false)
    assert.equal(process.env.HUB_DEVICE_SECRET, undefined)
  })

  it('returns a TOTP challenge untouched and persists nothing', async () => {
    respond = () => ({
      status: 200,
      body: { success: true, data: { totpRequired: true, pendingTotpToken: 'pending', user: { id: 'u1', email: 'a@b.c', name: 'A' } } }
    })

    const result = await broker.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, true)
    assert.equal((result.data as Record<string, unknown>).totpRequired, true)
    assert.equal(vaultWrites.length, 0)
  })

  it('surfaces the Hub statusMessage on rejection', async () => {
    respond = () => ({ status: 403, body: { success: false, statusMessage: 'error.deviceApprovalRequired', message: 'pending' } })
    const result = await broker.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, false)
    if (result.success) return
    assert.equal(result.code, 'rejected')
    assert.equal(result.status, 403)
    assert.equal(result.statusMessage, 'error.deviceApprovalRequired')
  })

  it('reports an unreachable Hub when fetch throws', async () => {
    const offline = createHubLoginBroker({
      configFile: () => 'config.env',
      readConfigFile: () => ({ exists: true, values: { ...values } }),
      writeConfigValues: () => {},
      fetchImpl: async () => { throw new Error('ECONNREFUSED') }
    })
    const result = await offline.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, false)
    if (!result.success) assert.equal(result.code, 'unreachable')
  })
})

describe('verifyTotp', () => {
  it('re-sends the device identity and persists the post-MFA credential', async () => {
    respond = () => ({
      status: 200,
      body: { success: true, data: { ...SESSION, deviceCredential: { deviceId: 'dc-2', secret: SECRET, expiresAt: '', scopes: ['storage.user'] } } }
    })

    const result = await broker.verifyTotp({ code: '123456', pendingTotpToken: 'pending' })
    assert.equal(result.success, true)
    assert.equal(calls[0]!.url, `${HUB}/api/v1/auth/totp/login`)
    assert.equal((calls[0]!.body.device as Record<string, unknown>).identityKind, 'electron-machine')
    assert.equal(JSON.stringify(result).includes(SECRET), false)
    assert.equal(values.HUB_DEVICE_ID, 'dc-2')
  })

  it('rejects a call without both fields before touching the network', async () => {
    const result = await broker.verifyTotp({ code: '', pendingTotpToken: 'pending' })
    assert.equal(result.success, false)
    if (!result.success) assert.equal(result.code, 'invalidRequest')
    assert.equal(calls.length, 0)
  })
})

describe('passkey and register', () => {
  it('passkey start sends no device metadata and no credential request', async () => {
    respond = () => ({ status: 200, body: { success: true, data: { challenge: 'c', rpId: 'r' } } })
    const result = await broker.passkeyStart()
    assert.equal(result.success, true)
    assert.equal(calls[0]!.url, `${HUB}/api/v1/auth/passkey/login/start`)
    assert.equal('device' in calls[0]!.body, false)
    assert.equal('requestDeviceCredential' in calls[0]!.body, false)
  })

  it('passkey finish is a full session and persists the credential', async () => {
    respond = () => ({
      status: 200,
      body: { success: true, data: { ...SESSION, deviceCredential: { deviceId: 'dc-3', secret: SECRET, expiresAt: '', scopes: ['ai.relay'] } } }
    })
    const result = await broker.passkeyFinish({ id: 'cred' })
    assert.equal(result.success, true)
    assert.equal(JSON.stringify(result).includes(SECRET), false)
    assert.equal(values.HUB_DEVICE_ID, 'dc-3')
  })

  it('register behaves like login for vault handling', async () => {
    respond = () => ({
      status: 200,
      body: { success: true, data: { ...SESSION, deviceCredential: { deviceId: 'dc-4', secret: SECRET, expiresAt: '', scopes: [] } } }
    })
    const result = await broker.register({ email: 'a@b.c', password: 'pw', name: 'A' })
    assert.equal(result.success, true)
    assert.equal(calls[0]!.url, `${HUB}/api/v1/auth/register`)
    assert.equal(JSON.stringify(result).includes(SECRET), false)
    assert.equal(values.HUB_DEVICE_ID, 'dc-4')
  })
})

describe('secure storage unavailable', () => {
  it('never writes a plaintext device secret when the keychain is unusable', async () => {
    const noKeychain = createHubLoginBroker({
      configFile: () => 'config.env',
      readConfigFile: () => ({ exists: true, values: { ...values } }),
      writeConfigValues: (file: string, next: Record<string, string>) => {
        vaultWrites.push({ ...next })
        Object.assign(values, next)
      },
      canPersistSecret: () => false,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { ...SESSION, deviceCredential: { deviceId: 'dc-x', secret: SECRET, expiresAt: '', scopes: [] } }
        })
      })
    })

    const result = await noKeychain.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, true)
    assert.equal(result.credentialPersisted, false)
    assert.equal(JSON.stringify(result).includes(SECRET), false)
    assert.equal(vaultWrites.length, 0, 'nothing may reach the vault writer')
    assert.equal(process.env.HUB_DEVICE_SECRET, undefined)
  })
})

describe('notConfigured', () => {
  it('refuses to call Hub when the app id is missing', async () => {
    const unconfigured = createHubLoginBroker({
      configFile: () => 'config.env',
      readConfigFile: () => ({ exists: false, values: { NUXT_PUBLIC_HUB_URL: HUB } }),
      writeConfigValues: () => {},
      fetchImpl: async () => { throw new Error('should not be called') }
    })
    const result = await unconfigured.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, false)
    if (!result.success) assert.equal(result.code, 'notConfigured')
  })
})

describe('credential scope', () => {
  async function enroll() {
    respond = () => ({
      status: 200,
      body: { success: true, data: { ...SESSION, deviceCredential: { deviceId: 'dc-9', secret: SECRET, expiresAt: '', scopes: ['ai.relay'] } } }
    })
    await broker.login({ email: 'a@b.c', password: 'pw' })
  }

  it('records the issuing Hub and reports it alongside the metadata', async () => {
    await enroll()
    const status = broker.credentialStatus()
    assert.equal(status.enrolled, true)
    assert.equal(status.hubOrigin, HUB)
    assert.equal(status.appId, APP)
    assert.deepEqual(status.scopes, ['ai.relay'])
    assert.equal(JSON.stringify(status).includes(SECRET), false)
  })

  it('reports an unenrolled device without inventing metadata', () => {
    const status = broker.credentialStatus()
    assert.equal(status.enrolled, false)
    assert.equal(status.hubOrigin, '')
    assert.deepEqual(status.scopes, [])
  })

  it('forget clears every credential slot in the vault and the environment', async () => {
    await enroll()
    const result = broker.forgetCredential()
    assert.equal(result.success, true)

    assert.equal(values.HUB_DEVICE_ID, '')
    assert.equal(values.HUB_DEVICE_SECRET, '')
    assert.equal(values.HUB_DEVICE_HUB_ORIGIN, '')
    assert.equal(process.env.HUB_DEVICE_ID, '')
    assert.equal(process.env.HUB_DEVICE_SECRET, '')
    assert.equal(process.env.HUB_DEVICE_HUB_ORIGIN, '')
    // The public Hub target is not a credential: forgetting must not unset it.
    assert.equal(values.NUXT_PUBLIC_HUB_URL, HUB)
    assert.equal(values.NUXT_PUBLIC_HUB_APP_ID, APP)
    assert.equal(broker.credentialStatus().enrolled, false)
  })

  it('re-enrolling on another Hub overwrites the stale origin instead of keeping both', async () => {
    await enroll()
    values.NUXT_PUBLIC_HUB_URL = 'https://hub.prod.test'
    respond = () => ({
      status: 200,
      body: { success: true, data: { ...SESSION, user: { ...SESSION.user, appId: 'tm-tools_prod' }, deviceCredential: { deviceId: 'dc-prod', secret: 'prod-secret', expiresAt: '', scopes: ['ai.relay'] } } }
    })

    const result = await broker.login({ email: 'a@b.c', password: 'pw' })
    assert.equal(result.success, true)

    const status = broker.credentialStatus()
    assert.equal(status.hubOrigin, 'https://hub.prod.test')
    assert.equal(status.appId, 'tm-tools_prod')
    assert.equal(values.HUB_DEVICE_ID, 'dc-prod')
    assert.equal(values.HUB_DEVICE_SECRET, 'prod-secret')
    values.NUXT_PUBLIC_HUB_URL = HUB
  })
})
