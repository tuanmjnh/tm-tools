'use strict'
// P4 — per-device enrollment against TM Hub (RFC 8628 Device Authorization).
//
// A public build carries no shared secret. The Main process asks Hub for a
// device code, shows the short user code, opens the Hub approval page in the
// system browser, then polls until a root approves. The issued credential is
// written to config.env through the same safeStorage vault as other secrets
// and NEVER crosses the IPC boundary: the renderer only learns identity
// metadata (device id, app id, scopes, expiry).
//
// Pure module: no electron import at module scope (ipcMain/shell are passed
// in), so the flow is unit-testable with an injected fetch.

const os = require('node:os')

const AUTHORIZE_PATH = '/api/v1/auth/device/authorize'
const TOKEN_PATH = '/api/v1/auth/device/token'
const REQUEST_TIMEOUT_MS = 15_000
/** One extra interval past `expiresIn` before we give up locally. */
const EXPIRY_GRACE_MS = 5_000

const DEVICE_KEYS = [
  'HUB_DEVICE_ID',
  'HUB_DEVICE_SECRET',
  'HUB_DEVICE_USER_ID',
  'HUB_DEVICE_APP_ID',
  'HUB_DEVICE_EXPIRES_AT',
  'HUB_DEVICE_SCOPES'
]

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function defaultOpenExternal(url) {
  try {
    const { shell } = require('electron')
    return Promise.resolve(shell.openExternal(url)).catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

function defaultClientName() {
  return `TM Tools on ${os.hostname()}`.slice(0, 120)
}

/**
 * `fetchImpl` is injectable so specs can drive every branch (pending → issued,
 * denied, expired, unreachable) without a live Hub.
 */
function createDeviceEnroller(options) {
  const {
    configFile,
    readConfigFile,
    writeConfigValues,
    isRootAccessToken,
    openExternal = defaultOpenExternal,
    onProgress = () => {},
    fetchImpl = (...args) => globalThis.fetch(...args)
  } = options

  let inFlight = false

  function readValues() {
    return readConfigFile(configFile()).values
  }

  function identityHeaders(values) {
    const secret = values.AUTH_JWT_SECRET || ''
    const publicKeys = values.AUTH_JWT_PUBLIC_KEYS || process.env.AUTH_JWT_PUBLIC_KEYS || ''
    return { secret, publicKeys }
  }

  /** Root gate, identical to set-config: only a configured device needs it. */
  function denyNonRoot(values, accessToken) {
    const { secret, publicKeys } = identityHeaders(values)
    if (!secret && !publicKeys) return false
    return !isRootAccessToken(accessToken, { secret, publicKeys })
  }

  async function request(url, body) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      const payload = await response.json().catch(() => null)
      return { status: response.status, payload }
    } finally {
      clearTimeout(timer)
    }
  }

  function status() {
    const values = readValues()
    const enrolled = Boolean(values.HUB_DEVICE_ID && values.HUB_DEVICE_SECRET)
    return {
      enrolled,
      deviceId: enrolled ? String(values.HUB_DEVICE_ID) : '',
      appId: enrolled ? String(values.HUB_DEVICE_APP_ID || '') : '',
      userId: enrolled ? String(values.HUB_DEVICE_USER_ID || '') : '',
      expiresAt: enrolled ? String(values.HUB_DEVICE_EXPIRES_AT || '') : '',
      scopes: enrolled ? String(values.HUB_DEVICE_SCOPES || '').split(',').filter(Boolean) : []
    }
  }

  function persistCredential(credential) {
    const values = readValues()
    const next = {
      ...values,
      HUB_DEVICE_ID: String(credential.deviceId),
      HUB_DEVICE_SECRET: String(credential.secret),
      HUB_DEVICE_USER_ID: String(credential.userId || ''),
      HUB_DEVICE_APP_ID: String(credential.appId || ''),
      HUB_DEVICE_EXPIRES_AT: String(credential.expiresAt || ''),
      HUB_DEVICE_SCOPES: Array.isArray(credential.scopes) ? credential.scopes.join(',') : ''
    }
    writeConfigValues(configFile(), next)
    // `config.hub` reads process.env on every call, so the running Nitro server
    // picks the credential up without a restart.
    for (const key of DEVICE_KEYS) process.env[key] = next[key]
  }

  async function enroll({ accessToken } = {}) {
    if (inFlight) return { success: false, code: 'busy' }
    inFlight = true
    try {
      const values = readValues()
      const alreadyEnrolled = Boolean(values.HUB_DEVICE_ID && values.HUB_DEVICE_SECRET)
      if (alreadyEnrolled && denyNonRoot(values, accessToken)) {
        return { success: false, code: 'notRoot' }
      }

      const hubUrl = normalizeBaseUrl(values.NUXT_PUBLIC_HUB_URL || process.env.NUXT_PUBLIC_HUB_URL || 'http://localhost:4000')
      const appId = String(values.NUXT_PUBLIC_HUB_APP_ID || process.env.NUXT_PUBLIC_HUB_APP_ID || '').trim()
      if (!hubUrl || !appId) return { success: false, code: 'notConfigured' }

      onProgress({ phase: 'authorizing' })

      let start
      try {
        start = await request(`${hubUrl}${AUTHORIZE_PATH}`, {
          appId,
          clientName: defaultClientName(),
          platform: process.platform
        })
      } catch {
        return { success: false, code: 'unreachable' }
      }
      if (start.status !== 200 || !start.payload?.success || !start.payload?.data?.deviceCode) {
        return { success: false, code: 'rejected', hubCode: start.payload?.statusMessage || '' }
      }

      const data = start.payload.data
      const expiresAt = new Date(Date.now() + Number(data.expiresIn || 600) * 1000).toISOString()
      const verificationUri = String(data.verificationUriComplete || data.verificationUri || '')
      onProgress({
        phase: 'pending',
        userCode: String(data.userCode || ''),
        verificationUri,
        expiresAt
      })
      if (verificationUri) await openExternal(verificationUri)

      const intervalMs = Math.max(Number(data.interval) || 5, 2) * 1000
      const deadline = Date.now() + Math.max(Number(data.expiresIn) || 600, 30) * 1000 + EXPIRY_GRACE_MS

      while (Date.now() < deadline) {
        await sleep(intervalMs)
        let poll
        try {
          poll = await request(`${hubUrl}${TOKEN_PATH}`, { deviceCode: data.deviceCode })
        } catch {
          // Transient network failure: keep polling until the local deadline.
          continue
        }

        if (poll.status === 200 && poll.payload?.success && poll.payload?.data?.deviceId) {
          persistCredential(poll.payload.data)
          onProgress({ phase: 'issued' })
          return {
            success: true,
            enrolled: true,
            deviceId: String(poll.payload.data.deviceId),
            appId: String(poll.payload.data.appId || appId),
            expiresAt: String(poll.payload.data.expiresAt || ''),
            scopes: Array.isArray(poll.payload.data.scopes) ? poll.payload.data.scopes : []
          }
        }
        if (poll.status === 428) continue
        if (poll.status === 403) {
          onProgress({ phase: 'denied' })
          return { success: false, code: 'denied' }
        }
        if (poll.status === 400) {
          onProgress({ phase: 'expired' })
          return { success: false, code: 'expired' }
        }
        // 429 / 5xx: back off one more interval and retry.
      }

      onProgress({ phase: 'expired' })
      return { success: false, code: 'expired' }
    } finally {
      inFlight = false
    }
  }

  /** Local forget only: removing the stored credential, not revoking it in Hub. */
  function forget({ accessToken } = {}) {
    const values = readValues()
    if (!values.HUB_DEVICE_ID) return { success: true, enrolled: false }
    if (denyNonRoot(values, accessToken)) return { success: false, code: 'notRoot' }

    const next = { ...values }
    for (const key of DEVICE_KEYS) delete next[key]
    writeConfigValues(configFile(), next)
    for (const key of DEVICE_KEYS) delete process.env[key]
    return { success: true, enrolled: false }
  }

  return { status, enroll, forget }
}

function registerDeviceController(options) {
  const { ipcMain, isTrustedSender, ...rest } = options
  const enroller = createDeviceEnroller(rest)

  ipcMain.handle('device:status', (event) => {
    if (!isTrustedSender(event)) return { enrolled: false }
    return enroller.status()
  })

  ipcMain.handle('device:enroll', async (event, payload) => {
    if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
    return await enroller.enroll({ accessToken: payload?.accessToken })
  })

  ipcMain.handle('device:forget', (event, payload) => {
    if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
    return enroller.forget({ accessToken: payload?.accessToken })
  })

  return enroller
}

module.exports = { createDeviceEnroller, registerDeviceController, DEVICE_KEYS }
