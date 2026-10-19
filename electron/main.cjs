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
const { registerTmcutController } = require('./tools/tmcut.controller.cjs')
const { registerAiGateway } = require('./tools/ai-gateway.cjs')
// R139 (§203): API-key slots are encrypted AT REST with the OS keychain
// (safeStorage: DPAPI/Keychain/libsecret). Boundary rule: the FILE holds
// tokens, process.env holds plaintext (the gateway stays untouched — its
// rate limiter/audit/abort behavior is battle-tested, don't touch it).
// decrypt() passes plaintext through, so pre-encryption files keep working.
const { encrypt, decrypt, isEncryptionAvailable, magicPrefix } = require('./tools/ai-secure.cjs')
const { mediaSchemePrivileges, createMediaHandler } = require('./media-protocol.cjs')

// Secret config slots: the AI panel writes exactly KEY / KEY_<TASK>.
// Matching the full slot shape keeps the rule closed — no arbitrary key
// name can qualify for encryption/masking.
const SECRET_SLOT_RE = /^AI_API_KEY(_.+)?$/

let initializePlatform
try {
  initializePlatform = require('./dist/index.cjs').initializePlatform
} catch {
  require('tsx/cjs')
  initializePlatform = require('./src/index.ts').initializePlatform
}

protocol.registerSchemesAsPrivileged([mediaSchemePrivileges()])

const isDev = !app.isPackaged
const PORT = process.env.APP_PORT || 3456

// Origins the renderer legitimately runs from; media-protocol uses this
// to decide whether a fetch() gets CORS headers (webSecurity:true, R126).
function appOrigins() {
  if (isDev) return ['http://localhost:3000', 'http://127.0.0.1:3000']
  return [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]
}

let win = null

function loadUserConfig() {
  const userConfigPath = path.join(app.getPath('userData'), 'config.env')
  try {
    const content = fs.readFileSync(userConfigPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1)
      }
      // R139: the file holds keychain TOKENS; env carries plaintext so the
      // gateway and every existing consumer stay untouched. decrypt()
      // passes plaintext through (pre-R139 files) and yields null for a
      // corrupt token — dropped here, which the gateway reports honestly
      // as ai.no-key (re-enter the key) instead of sending garbage.
      if (SECRET_SLOT_RE.test(key)) value = decrypt(value)
      if (!process.env[key] && value !== null) {
        process.env[key] = value
      }
    }
  } catch {
    // No user config yet, defaults in server/config/index.ts will be used
  }
}

async function startServer() {
  loadUserConfig()

  process.env.NITRO_PORT = String(PORT)
  process.env.NITRO_HOST = '127.0.0.1'

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
      webSecurity: true
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:3000')
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
  const appOrigin = isDev ? 'http://localhost:3000' : `http://127.0.0.1:${PORT}`
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin) && !url.startsWith('devtools://')) {
      event.preventDefault()
    }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
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

  // Handle window.open() calls - allow popups for OAuth flows
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Allow OAuth providers (Google, etc.) to open in Electron popup
    // so the session cookie is preserved for the callback validation
    const allowedOAuthHosts = [
      'accounts.google.com',
      'github.com',
      'login.microsoftonline.com'
    ]
    try {
      const parsed = new URL(url)
      if (allowedOAuthHosts.some(host => parsed.hostname.includes(host))) {
        // Open OAuth URLs in Electron popup (shares session cookies)
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 540,
            height: 680,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true
            }
          }
        }
      }
      // Other external URLs → system browser
      if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        const { shell } = require('electron')
        shell.openExternal(url).catch(() => {})
        return { action: 'deny' }
      }
    } catch { /* ignore URL parse errors */ }
    // Internal URLs → new window
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 540,
        height: 680,
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

// R139 migration: keys written before encryption existed sit plaintext in
// config.env. Re-encrypt once on startup (file + live env) so the window
// between "old version wrote a key" and "new version protects it" is a
// single launch. Skips anything already encrypted; no-ops when the OS
// keychain is unavailable (plaintext keeps working — decrypt is tolerant).
function migrateStoredKeysToSecureStorage() {
  if (!isEncryptionAvailable()) return
  const configFile = userConfigPath()
  let content
  try {
    content = fs.readFileSync(configFile, 'utf8')
  } catch {
    return
  }
  const magic = magicPrefix()
  let changed = false
  const migrated = content.replace(/^([ \t]*)(AI_API(?:_URL)?(?:_[A-Z0-9_]+)?)([ \t]*)=([ \t]*)(.+?)[ \t]*$/gm,
    (line, sp1, key, sp2, eq, sp3, rawValue) => {
      if (!SECRET_SLOT_RE.test(key)) return line
      let value = rawValue
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1)
      }
      if (!value || value.startsWith(magic)) return line
      const enc = encrypt(value)
      if (enc === value) return line // no backend mid-flight: leave as-is
      changed = true
      return `${key}=${enc}`
    })
  if (changed) {
    try {
      fs.writeFileSync(configFile, migrated, 'utf8')
    } catch {
      // unwritable file: live env still migrated, file follows next save
    }
  }
}

// IPC sender validation (audit MEDIUM, R133 §197): every privileged
// handler refuses calls whose frame is not the app's own origin. Dev
// loads from the Vite server URL, prod from the loopback nitro server;
// devtools frames and the initial about:blank are let through because
// Chromium injects them around trusted app navigations. R133 extracted
// the factory into ipcPolicy.cjs so the file-manager controller applies
// the SAME rule (it used to have none at all).
const { createSenderGate, gateIpcMainHandle } = require('./ipcPolicy.cjs')

const isTrustedSender = createSenderGate({ isDev, port: PORT })

// R134 (§198): install the choke-point BEFORE any controller registers.
// Every ipcMain.handle call from now on — all six controllers, the
// platform layer's ipcHelper, and any future handler — is automatically
// wrapped so a non-app-origin frame's invoke resolves to undefined.
// This is what the R133 audit follow-up promised as "mechanical":
// instead of gating ~150 registration sites one by one, the registration
// FUNCTION ITSELF is gated once.
gateIpcMainHandle(ipcMain, isTrustedSender)

// Config parsing shared by get/set (was duplicated three times inline).
function readConfigFile(file) {
  const result = {}
  try {
    const content = fs.readFileSync(file, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  } catch {
    // no config yet
  }
  return result
}

ipcMain.handle('get-config', (event) => {
  if (!isTrustedSender(event)) return {}
  const result = {}
  for (const [key, raw] of Object.entries(readConfigFile(userConfigPath()))) {
    // R139: the file holds keychain TOKENS for secret slots; a renderer
    // must never see either form. The panel only needs to know whether a
    // key EXISTS (hasKey badges come from the gateway status), so secret
    // values are masked out entirely. A corrupt token maps to '' (also
    // "unset") instead of leaking base64 noise into the UI.
    if (SECRET_SLOT_RE.test(key)) {
      const plain = decrypt(raw)
      delete result[key]
      result[key] = plain ? '********' : ''
      continue
    }
    result[key] = raw
  }
  return result
})

ipcMain.handle('set-config', (event, values) => {
  if (!isTrustedSender(event)) return { success: false }
  const configFile = userConfigPath()
  const existing = readConfigFile(configFile)
  const incoming = values && typeof values === 'object' ? values : {}
  const merged = { ...existing, ...incoming }
  const lines = Object.entries(merged)
    // R139: a masked value coming BACK from get-config ('********')
    // means the UI echoed the placeholder — keep the stored token.
    .filter(([k, v]) => !(SECRET_SLOT_RE.test(k) && String(v) === '********'))
    .map(([k, v]) => {
      // Secret slots go to the file as keychain tokens; every other
      // value is written verbatim, exactly as before.
      const stored = SECRET_SLOT_RE.test(k) ? encrypt(String(v)) : String(v)
      return `${k}=${stored}`
    })
  fs.writeFileSync(configFile, lines.join('\n') + '\n', 'utf8')
  for (const [key, value] of Object.entries(incoming)) {
    // Live env keeps PLAINTEXT (the gateway reads env, untouched by R139);
    // a masked echo skips the env write so it never clobbers the real key.
    if (SECRET_SLOT_RE.test(key) && String(value) === '********') continue
    process.env[key] = String(value)
  }
  return { success: true, path: configFile }
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

// Watch-folder for render outputs (TMCut export, docs section 65.4).
// Watches the output directory and notifies the renderer once the file
// appears and stays stable (2s idle), so the export modal can toast +
// offer instant preview without polling.
const outputWatchers = new Map()

function stopOutputWatcher(key) {
  const entry = outputWatchers.get(key)
  if (!entry) return
  outputWatchers.delete(key)
  try {
    if (entry.timer) clearTimeout(entry.timer)
  } catch {
    // ignore
  }
  try {
    entry.watcher.close()
  } catch {
    // ignore
  }
}

function notifyRenderDone(filePath) {
  let size = 0
  try {
    size = fs.statSync(filePath).size
  } catch {
    // ignore
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send('tmcut:renderDone', { filePath, size })
  }
}

function readOutputStat(key) {
  try {
    const stat = fs.statSync(key)
    return { mtimeMs: stat.mtimeMs, size: stat.size }
  } catch {
    return null
  }
}

function scheduleRenderNotify(key) {
  const entry = outputWatchers.get(key)
  if (!entry) return
  const current = readOutputStat(key)
  if (!current || current.size === 0) return
  // Ignore the stale file that already existed when watching started.
  if (current.mtimeMs === entry.baseMtime && current.size === entry.baseSize) return
  try {
    if (entry.timer) clearTimeout(entry.timer)
  } catch {
    // ignore
  }
  entry.timer = setTimeout(() => {
    const latest = readOutputStat(key)
    stopOutputWatcher(key)
    if (latest && latest.size > 0) notifyRenderDone(key)
  }, 2000)
}

ipcMain.handle('tmcut:watch-output', (_event, { filePath }) => {
  if (typeof filePath !== 'string' || !filePath) return false
  // Path traversal protection: resolve and check against allowed roots
  try {
    const resolved = path.resolve(filePath)
    const userDataRoot = path.resolve(app.getPath('userData'))
    if (!resolved.startsWith(userDataRoot + path.sep) && resolved !== userDataRoot) {
      return false
    }
  } catch {
    return false
  }
  const key = path.normalize(filePath)
  stopOutputWatcher(key)
  const dir = path.dirname(key)
  const base = path.basename(key)
  try {
    if (!fs.existsSync(dir)) return false
    const baseline = readOutputStat(key)
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (filename && filename !== base) return
      scheduleRenderNotify(key)
    })
    watcher.on('error', () => stopOutputWatcher(key))
    outputWatchers.set(key, {
      watcher,
      timer: null,
      baseMtime: baseline ? baseline.mtimeMs : -1,
      baseSize: baseline ? baseline.size : -1
    })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('tmcut:unwatch-output', (_event, { filePath }) => {
  stopOutputWatcher(typeof filePath === 'string' ? path.normalize(filePath) : '')
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
  // R139: user config used to be read only by startServer() (packaged
  // path). Load it for every session so dev and prod see the same env
  // (set-if-unset semantics), then migrate any pre-R139 plaintext keys
  // to keychain tokens before anything else touches the file (§203).
  loadUserConfig()
  migrateStoredKeysToSecureStorage()
  protocol.handle('media', createMediaHandler(appOrigins))

  registerYoutubeController()
  registerFfmpegController()
  registerDialogController()
  // R133 §197: the filesystem surface now requires the same app-origin
  // check as the privileged root handlers (audit residual risk closed).
  registerFileManagerController({ isTrustedSender })
  registerTmcutController()
  registerAiGateway()
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
