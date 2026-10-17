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
const { mediaSchemePrivileges, createMediaHandler } = require('./media-protocol.cjs')

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
      if (!process.env[key]) {
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

// IPC sender validation (audit MEDIUM): every privileged handler refuses
// calls whose frame is not the app's own origin. Dev loads from the Vite
// server URL, prod from the loopback nitro server; devtools frames and
// the initial about:blank are let through because Chromium injects them
// around trusted app navigations.
function isTrustedSender(event) {
  let url
  try {
    url = event.senderFrame ? event.senderFrame.url : ''
  } catch {
    return false
  }
  if (!url || url === 'about:blank' || url.startsWith('devtools://')) return true
  if (isDev) return url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000')
  return url.startsWith(`http://127.0.0.1:${PORT}`) || url.startsWith(`http://localhost:${PORT}`)
}

ipcMain.handle('get-config', (event) => {
  if (!isTrustedSender(event)) return {}
  const result = {}
  const configFile = userConfigPath()
  try {
    const content = fs.readFileSync(configFile, 'utf8')
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
    // ignore
  }
  return result
})

ipcMain.handle('set-config', (event, values) => {
  if (!isTrustedSender(event)) return { success: false }
  const configFile = userConfigPath()
  const existing = {}
  try {
    const content = fs.readFileSync(configFile, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      existing[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
    }
  } catch {
    // ignore
  }
  const merged = { ...existing, ...values }
  const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`)
  fs.writeFileSync(configFile, lines.join('\n') + '\n', 'utf8')
  for (const [key, value] of Object.entries(values)) {
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
  protocol.handle('media', createMediaHandler(appOrigins))

  registerYoutubeController()
  registerFfmpegController()
  registerDialogController()
  registerFileManagerController()
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
