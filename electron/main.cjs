const { app, BrowserWindow, Menu, ipcMain, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { Readable } = require('node:stream')
const { pathToFileURL } = require('url')
const { registerYoutubeController } = require('./tools/youtube.controller.cjs')
const { registerFfmpegController } = require('./tools/ffmpeg.controller.cjs')
const { registerDialogController } = require('./tools/dialog.cjs')
const { registerFileManagerController } = require('./tools/file-manager.cjs')
const { registerAppUpdaterController } = require('./tools/app-updater.cjs')
const { registerProfilesController } = require('./tools/profiles.controller.cjs')
const { registerTmcutController } = require('./tools/tmcut.controller.cjs')
const { registerAiGateway } = require('./tools/ai-gateway.cjs')

let initializePlatform
try {
  initializePlatform = require('./dist/index.cjs').initializePlatform
} catch {
  require('tsx/cjs')
  initializePlatform = require('./src/index.ts').initializePlatform
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true
    }
  }
])

const isDev = !app.isPackaged
const PORT = process.env.APP_PORT || 3456

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
      webSecurity: false
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
              contextIsolation: true,
              webSecurity: false
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
          contextIsolation: true,
          webSecurity: false
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

ipcMain.handle('get-config', () => {
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

ipcMain.handle('set-config', (_event, values) => {
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
  const { shell } = require('electron')
  const exists = fs.existsSync(fullPath)
  // console.log('[open-path] path=' + JSON.stringify(fullPath), 'exists=', exists)
  if (exists) {
    try {
      const err = await shell.openPath(fullPath)
      // console.log('[open-path] shell.openPath result=' + JSON.stringify(err))
      return err === '' ? true : false
    } catch {
      // console.log('[open-path] threw')
    }
  }
  return false
})

ipcMain.handle('open-external', async (_event, url) => {
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
  const { shell } = require('electron')
  const exists = fullPath && fs.existsSync(fullPath)
  // console.log('[show-item-in-folder] FULL=' + JSON.stringify(fullPath), 'exists=', exists)
  if (exists) {
    shell.showItemInFolder(fullPath)
    return true
  }
  return false
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

// Content types served by the media:// protocol, keyed by extension.
// The Chromium media pipeline selects its demuxer from Content-Type,
// so a missing header breaks playback of some containers.
const MEDIA_CONTENT_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv', '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.aac': 'audio/aac', '.opus': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
}

function mediaContentTypeFor(filePath) {
  const ext = path.extname(filePath || '').toLowerCase()
  return MEDIA_CONTENT_TYPES[ext] || 'application/octet-stream'
}

// File stream for the media protocol. The 'error' listener
// is mandatory: an unhandled 'error' event on a Node stream
// (file locked or deleted between stat and read, requests
// aborted mid-scrub) would throw an uncaught exception and
// take down the main process. Readable.toWeb surfaces the
// failure to the consumer as a broken response body instead.
function diskStream(filePath, start, end) {
  const stream = fs.createReadStream(filePath, { start, end })
  stream.on('error', () => {
    // surfaced via the web stream as a response error
  })
  return stream
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId(process.execPath)
  }
  protocol.handle('media', async (request) => {
    try {
      let filePath = ''
      try {
        const parsedUrl = new URL(request.url)
        filePath = parsedUrl.searchParams.get('file') || ''
      } catch {
        // ignore
      }

      if (!filePath) {
        filePath = decodeURIComponent(request.url.replace(/^media:\/\//i, ''))
        if (process.platform === 'win32') {
          filePath = filePath.replace(/^\/+([a-zA-Z]:)/, '$1')
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('File not found: ' + (filePath || 'empty path'), { status: 404 })
      }
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) {
        return new Response('Not a file: ' + filePath, { status: 404 })
      }

      const fileSize = stat.size
      const contentType = mediaContentTypeFor(filePath)
      const baseHeaders = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' }

      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { ...baseHeaders, 'Content-Length': String(fileSize) }
        })
      }

      if (fileSize === 0) {
        return new Response(new Uint8Array(0), {
          status: 200,
          headers: { ...baseHeaders, 'Content-Length': '0' }
        })
      }

      // Serve the file straight from disk with HTTP Range support
      // (206 Partial Content). The media pipeline seeks by issuing
      // Range requests; a plain 200 without `Accept-Ranges` stalls
      // seeks beyond the initially buffered window, which froze the
      // preview whenever the playhead was dragged off 00:00.
      // (net.fetch(file://) cannot forward Range headers, so the
      // file is streamed directly instead.)
      const rangeHeader = request.headers.get('range')
      const rangeMatch = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null

      if (rangeMatch) {
        let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0
        let end = rangeMatch[2] ? Number(rangeMatch[2]) : fileSize - 1
        if (!Number.isFinite(start) || start < 0) start = 0
        if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1
        if (!rangeMatch[1] && rangeMatch[2]) {
          // Suffix range ("bytes=-N"): the final N bytes.
          const suffixLength = Math.min(end, fileSize)
          start = fileSize - suffixLength
          end = fileSize - 1
        }
        if (start > end || start >= fileSize) {
          return new Response('Range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          })
        }
        const stream = Readable.toWeb(diskStream(filePath, start, end))
        return new Response(stream, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`
          }
        })
      }

      const stream = Readable.toWeb(diskStream(filePath, 0, fileSize - 1))
      return new Response(stream, {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': String(fileSize) }
      })
    } catch (err) {
      return new Response(String(err), { status: 500 })
    }
  })

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
