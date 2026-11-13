const { app, BrowserWindow, Menu, ipcMain, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { pathToFileURL } = require('url')
const { registerYoutubeController } = require('./tools/youtube.controller.cjs')
const { registerFfmpegController } = require('./tools/ffmpeg.controller.cjs')
const { registerDialogController } = require('./tools/dialog.cjs')
const { registerFileManagerController } = require('./tools/file-manager.cjs')
const { registerAppUpdaterController } = require('./tools/app-updater.cjs')
const { registerProfilesController } = require('./tools/profiles.controller.cjs')
// API-key slots are encrypted AT REST with the OS keychain (safeStorage:
// DPAPI/Keychain/libsecret). decrypt() passes plaintext through, so files
// written before encryption existed keep working.
const { decrypt, isEncryptionAvailable } = require('./tools/ai-secure.cjs')
// One config.env parser for startup, get-config and set-config: "file
// missing" can never be read differently by two handlers.
const { readConfigFile, writeConfigValues } = require('./tools/config-file.cjs')
// P5: Hub URL, app id and PUBLIC JWKs baked at build time. Applied after
// config.env, as defaults only, so a fresh install verifies Hub tokens without
// any hand configuration while a per-user config still wins.
const { applyPublicConfig } = require('./tools/public-config.cjs')
const { mediaSchemePrivileges, createMediaHandler } = require('./media-protocol.cjs')
// Secret config slots: ONE definition shared by the masking and encryption
// paths below, so no arbitrary key name qualifies for at-rest encryption.
const { SECRET_SLOT_RE } = require('./tools/secret-slots.cjs')
// v2: the auth broker is the only writer of a device credential. It is stored in
// the keychain vault and never returned to the renderer.
const { createHubLoginBroker } = require('./tools/hub-login-broker.cjs')
// window.open policy: same-origin API links download, `?inline=1` previews.
const { decideWindowOpen } = require('./tools/window-open.cjs')
// P1: the device-config admin gate verifies the caller's Hub token locally.
// P3: RS256 public keys join the check, so a Hub that no longer shares a
// secret can still authorize a root to repair this device's configuration.
const { isRootAccessToken } = require('./tools/root-token.cjs')

let initializePlatform
try {
  initializePlatform = require('./dist/index.cjs').initializePlatform
} catch {
  require('tsx/cjs')
  initializePlatform = require('./src/index.ts').initializePlatform
}

protocol.registerSchemesAsPrivileged([mediaSchemePrivileges()])

const isDev = !app.isPackaged
// R148: both ports come from the ONE resolver in tools/ports.cjs. A bare
// `process.env.PORT || fallback` treated a truthy-but-unusable ambient value
// ("0") as a port, and the dev window was sent to http://localhost:0
// (ERR_UNSAFE_PORT) while the SAME bad port also keyed the IPC sender gate.
// Only a real TCP port wins now; anything else falls back.
const { parsePort, resolveDevPort } = require('./tools/ports.cjs')

const PORT = parsePort(process.env.APP_PORT) ?? 3456
// Dev renderer is served by `pnpm dev` / `dev:electron` (nuxt dev --port
// 4002 since the fleet port reallocation). Keep the wait-on URL in the
// `dev:electron` script in sync with this default.
const DEV_PORT = resolveDevPort(process.env)

// Origins the renderer legitimately runs from; media-protocol uses this
// to decide whether a fetch() gets CORS headers (webSecurity:true, R126).
function appOrigins() {
  if (isDev) return [`http://localhost:${DEV_PORT}`, `http://127.0.0.1:${DEV_PORT}`]
  return [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]
}

let win = null

function loadUserConfig() {
  // The file holds keychain TOKENS for secret slots; env carries plaintext
  // so the tool controllers keep reading env. decrypt() passes plaintext
  // through (legacy files) and yields null for a corrupt token — dropped
  // here rather than exported as garbage.
  const { values } = readConfigFile(path.join(app.getPath('userData'), 'config.env'))
  for (const [key, raw] of Object.entries(values)) {
    const value = SECRET_SLOT_RE.test(key) ? decrypt(raw) : raw
    if (!process.env[key] && value !== null) {
      process.env[key] = value
    }
  }
}

/**
 * Hub URL / app id / public JWKs baked at build time. Applied on the shared
 * startup path, not inside `startServer()`: dev loads the renderer from the
 * Nuxt dev server and never starts Nitro, so a packaged-only call left the
 * auth broker with an empty app id and every login failed `notConfigured`.
 * `applyPublicConfig` only fills keys the environment does not already have,
 * so `config.env` still wins.
 */
function applyBakedPublicConfig() {
  applyPublicConfig(
    app.isPackaged
      ? path.join(process.resourcesPath, 'resources', 'public-config.json')
      : path.join(__dirname, '..', 'resources', 'public-config.json')
  )
}

async function startServer() {
  process.env.NITRO_PORT = String(PORT)
  process.env.NITRO_HOST = '127.0.0.1'
  // Nitro runs in-process here, so cwd-relative data (.data/) would land
  // inside the installed app dir. Point the local chat store at userData.
  process.env.TOOLS_DATA_DIR = app.getPath('userData')

  const serverPath = path.join(__dirname, '..', '.output', 'server', 'index.mjs')
  await import(pathToFileURL(serverPath).href)

  return new Promise((resolve, reject) => {
    let attempts = 0
    const maxAttempts = 30
    const poll = () => {
      attempts++
      const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
        res.resume()
        console.log(`[Electron] Nitro server running on http://127.0.0.1:${PORT}`)
        resolve()
      })
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Server did not start after ${maxAttempts} attempts`))
        } else {
          setTimeout(poll, 300)
        }
      })
      req.end()
    }
    poll()
  })
}

function getAppIcon() {
  const isWin = process.platform === 'win32'
  const iconName = isWin ? 'icon.ico' : 'icon.png'
  const candidatePaths = [
    path.join(__dirname, '..', 'public', iconName),
    path.join(__dirname, '..', '.output', 'public', iconName),
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(__dirname, '..', '.output', 'public', 'icon.png')
  ]
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

async function createWindow() {
  Menu.setApplicationMenu(null)

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // R126: same-origin policy is back ON. The one thing that used to
      // need webSecurity:false — loading local media — now runs through
      // the privileged media:// scheme, which answers CORS for
      // appOrigins() only (media-protocol.cjs). Media tags load
      // cross-origin by design; only fetch()/canvas readback need CORS,
      // and those come from the app origin.
      webSecurity: true,
      devTools: isDev
    }
  })

  if (isDev) {
    win.loadURL(`http://localhost:${DEV_PORT}`)
    win.webContents.openDevTools()
  } else {
    try {
      await startServer()
    } catch (err) {
      console.error('[Electron] Failed to start server:', err)
      win.loadURL(`data:text/html,<h1>Server failed to start</h1><pre>${err.message}</pre>`)
      win.show()
      return
    }
    win.loadURL(`http://127.0.0.1:${PORT}`)
  }

  // Navigation lockdown (Electron security checklist #17): the main
  // frame must never navigate to a foreign origin. Programmatic loads
  // (loadURL/back) do not fire this event; only user/link-driven
  // navigations do. window.open stays with the OAuth-aware handler below.
  const appOrigin = isDev ? `http://localhost:${DEV_PORT}` : `http://127.0.0.1:${PORT}`
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin) && !url.startsWith('devtools://')) {
      event.preventDefault()
    }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (isDev && input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools()
      return
    }
    // F5 reload: the app sets the application menu to null (which removes
    // Electron's default reload roles), so F5 is wired here manually.
    if (input.key === 'F5') {
      event.preventDefault()
      win.webContents.reload()
    }
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  // Handle window.open() calls - allow popups for OAuth flows.
  // The decision itself lives in tools/window-open.cjs so it stays testable:
  // same-origin `/api/` links download EXCEPT the `?inline=1` preview route,
  // which opens a window with Electron's built-in PDF viewer enabled.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen({
      url,
      currentUrl: win && !win.isDestroyed() ? win.webContents.getURL() : null
    })

    if (decision.action === 'external') {
      const { shell } = require('electron')
      shell.openExternal(url).catch(() => {})
      return { action: 'deny' }
    }

    if (decision.action === 'download') {
      win.webContents.downloadURL(url)
      return { action: 'deny' }
    }

    if (decision.action === 'popup') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: decision.pdfPlugins ? 1100 : 540,
          height: decision.pdfPlugins ? 900 : 680,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            plugins: Boolean(decision.pdfPlugins)
          }
        }
      }
    }

    if (decision.action === 'deny') return { action: 'deny' }

    // Internal URLs (e.g. the PDF preview window) → new window sized by the
    // window.open features, so the preview keeps its requested dimensions.
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    }
  })

  registerAppUpdaterController(win)
  registerProfilesController(win)

  win.on('closed', () => {
    win = null
  })
}

const userConfigPath = () => path.join(app.getPath('userData'), 'config.env')

// IPC sender validation (audit MEDIUM, R133 §197): every privileged
// handler refuses calls whose frame is not the app's own origin. Dev
// loads from the Vite server URL, prod from the loopback nitro server;
// devtools frames and the initial about:blank are let through because
// Chromium injects them around trusted app navigations. R133 extracted
// the factory into ipcPolicy.cjs so the file-manager controller applies
// the SAME rule (it used to have none at all).
const { createSenderGate, gateIpcMainHandle } = require('./ipcPolicy.cjs')

const isTrustedSender = createSenderGate({ isDev, port: PORT, devPort: DEV_PORT })

// R134 (§198): install the choke-point BEFORE any controller registers.
// Every ipcMain.handle call from now on is automatically wrapped so a
// non-app-origin frame's invoke resolves to undefined — instead of gating
// ~150 registration sites one by one, the registration FUNCTION ITSELF is
// gated once.
gateIpcMainHandle(ipcMain, isTrustedSender)

ipcMain.handle('get-config', (event) => {
  if (!isTrustedSender(event)) return {}
  const parsed = readConfigFile(userConfigPath())
  const result = {}
  for (const [key, raw] of Object.entries(parsed.values)) {
    // Secret slots are masked out entirely: the renderer only needs to
    // know whether a value exists, never the key itself. A corrupt token
    // maps to '' ("unset") instead of leaking base64 noise into the UI.
    if (SECRET_SLOT_RE.test(key)) {
      const plain = decrypt(raw)
      result[key] = plain ? '********' : ''
      continue
    }
    result[key] = raw
  }
  return result
})

ipcMain.handle('set-config', async (event, values, accessToken) => {
  if (!isTrustedSender(event)) return { success: false }
  const configFile = userConfigPath()
  const existing = readConfigFile(configFile)
  const incoming = values && typeof values === 'object' ? values : {}

  // Device configuration is root-only once the device has been provisioned.
  // A fresh install is exempt: the local server cannot verify any token before
  // the shared secret exists, so demanding a root session there would deadlock
  // the bootstrap. Verification is local (same HS256 rule as the server), so a
  // wrong Hub URL cannot lock a root out of repairing its own config.
  if (existing.exists) {
    const storedSecret = decrypt(existing.values.AUTH_JWT_SECRET || '') || ''
    const publicKeys = existing.values.AUTH_JWT_PUBLIC_KEYS || process.env.AUTH_JWT_PUBLIC_KEYS || ''
    if ((storedSecret || publicKeys) && !isRootAccessToken(accessToken, { secret: storedSecret, publicKeys })) {
      return { success: false, code: 'notRoot' }
    }
  }

  const merged = { ...existing.values, ...incoming }
  // One writer for set-config and device enrollment: secret slots are encrypted
  // with the OS keychain and a '********' echo never overwrites the stored token.
  writeConfigValues(configFile, merged)
  for (const [key, value] of Object.entries(incoming)) {
    if (SECRET_SLOT_RE.test(key) && String(value) === '********') continue
    process.env[key] = String(value)
  }
  return { success: true, path: configFile }
})

// v2: the renderer never talks to Hub for a full-session auth call. Main derives
// the device identity, receives the optional device service credential, writes
// it into the vault and returns only sanitized session data over IPC.
const hubAuth = createHubLoginBroker({
  configFile: userConfigPath,
  readConfigFile,
  writeConfigValues,
  // No keychain, no credential on disk. The session still completes; the user
  // sees a "sign in again to enrol" hint instead of a silent plaintext secret.
  canPersistSecret: isEncryptionAvailable
})

ipcMain.handle('auth:device-info', (event) => {
  if (!isTrustedSender(event)) return null
  return hubAuth.deviceInfo()
})

ipcMain.handle('auth:login', async (event, credentials) => {
  if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
  const email = String(credentials?.email || '').trim()
  const password = String(credentials?.password || '')
  if (!email || !password) return { success: false, code: 'invalidRequest' }
  return await hubAuth.login({ email, password })
})

ipcMain.handle('auth:verify-totp', async (event, input) => {
  if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
  return await hubAuth.verifyTotp(input)
})

ipcMain.handle('auth:passkey-start', async (event) => {
  if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
  return await hubAuth.passkeyStart()
})

ipcMain.handle('auth:passkey-finish', async (event, credential) => {
  if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
  return await hubAuth.passkeyFinish(credential)
})

ipcMain.handle('auth:register', async (event, input) => {
  if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
  const email = String(input?.email || '').trim()
  const password = String(input?.password || '')
  const name = String(input?.name || '').trim()
  if (!email || !password || !name) return { success: false, code: 'invalidRequest' }
  return await hubAuth.register({ email, password, name })
})

// Credential metadata + local forget. Nothing here reaches the Hub: "Forget
// this device" removes the local copy only, while revoking the Hub record stays
// a root-only Hub API action (its own route enforces that server-side).
ipcMain.handle('device:status', (event) => {
  if (!isTrustedSender(event)) return { enrolled: false, deviceId: '', appId: '', userId: '', expiresAt: '', scopes: [] }
  return hubAuth.credentialStatus()
})

ipcMain.handle('device:forget', (event) => {
  if (!isTrustedSender(event)) return { success: false, code: 'untrusted' }
  return hubAuth.forgetCredential()
})

ipcMain.handle('open-path', async (event, fullPath) => {
  if (!isTrustedSender(event)) return false
  const { shell } = require('electron')
  const exists = typeof fullPath === 'string' && fs.existsSync(fullPath)
  if (!exists) return false
  try {
    const err = await shell.openPath(fullPath)
    return err === ''
  } catch {
    return false
  }
})

ipcMain.handle('open-external', async (event, url) => {
  if (!isTrustedSender(event)) return false
  const { shell } = require('electron')
  try {
    // Validate URL format
    if (!url || typeof url !== 'string') return false
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('show-item-in-folder', async (event, fullPath) => {
  if (!isTrustedSender(event)) return false
  const { shell } = require('electron')
  if (typeof fullPath !== 'string' || !fs.existsSync(fullPath)) return false
  shell.showItemInFolder(fullPath)
  return true
})

ipcMain.handle('verify-path', async (_event, { filePath, type }) => {
  const { verifyExecutable } = require('./tools/paths.cjs')
  try {
    const isValid = await verifyExecutable(filePath, type)
    return { status: isValid }
  } catch {
    return { status: false }
  }
})

// The media:// protocol itself lives in media-protocol.cjs (R126): with
// webSecurity back on, only requests from appOrigins() receive CORS
// headers, so a remote frame cannot read local files through it.

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId(process.execPath)
  }
  // User config is read for every session so dev and prod see the same env
  // (set-if-unset semantics): the profile controller resolves its browser
  // executables from CHROME_PATH / CAMOUFOX_PATH / ... written by the
  // settings pages. The baked public config is applied right after it because
  // the Hub URL and app id gate every authenticated call in both modes.
  loadUserConfig()
  applyBakedPublicConfig()
  protocol.handle('media', createMediaHandler(appOrigins))

  registerYoutubeController()
  registerFfmpegController()
  registerDialogController()
  // R133 §197: the filesystem surface now requires the same app-origin
  // check as the privileged root handlers (audit residual risk closed).
  registerFileManagerController({ isTrustedSender })

  if (typeof initializePlatform === 'function') {
    initializePlatform()
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (win === null) createWindow()
})
