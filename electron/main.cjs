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
const { registerAssetCenterController } = require('./tools/asset-center.controller.cjs')
const { registerAiGateway } = require('./tools/ai-gateway.cjs')
const { registerVideoGeneration } = require('./tools/video-generation/controller.mjs')
// MCP server (Phase 2) — spawned child with IPC channel
const { spawn } = require('child_process')
const { fileURLToPath } = require('url')
const { dirname, join } = require('path')
// R139 (§203): API-key slots are encrypted AT REST with the OS keychain
// (safeStorage: DPAPI/Keychain/libsecret). Boundary rule: the FILE holds
// tokens, process.env holds plaintext (the gateway stays untouched — its
// rate limiter/audit/abort behavior is battle-tested, don't touch it).
// decrypt() passes plaintext through, so pre-encryption files keep working.
const { encrypt, decrypt, isEncryptionAvailable, magicPrefix } = require('./tools/ai-secure.cjs')
// R143 (§206): the line transform behind the startup migration AND the
// vault page's "Encrypt now" button is pure (key-migrate.cjs) so the
// Electron probe can prove the real behavior (real keychain, plaintext
// -> token, idempotent second pass) instead of only pinning a contract.
const { migrateKeyContent } = require('./tools/key-migrate.cjs')
// R141 (§205): the config.env parser is shared by get-config, ai-key-status
// and set-config — one implementation, so "file missing" can never be
// read differently by two handlers. Shape: { exists, values }.
const { readConfigFile } = require('./tools/config-file.cjs')
const { mediaSchemePrivileges, createMediaHandler } = require('./media-protocol.cjs')

// Secret config slots: ONE definition (secret-slots.cjs) shared by the
// masking/decryption paths here and the at-rest migration. The AI panel
// writes exactly KEY / KEY_<TASK>; the full-slot shape keeps the rule
// closed so no arbitrary key name qualifies. R145 (§207): this line used
// to be a second literal copy with a grep-pin spec; now drift is
// structurally impossible.
const { SECRET_SLOT_RE } = require('./tools/secret-slots.cjs')

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
// Dev renderer is served by `pnpm dev` (nuxt dev) on the repo's dev port
// (PORT in .env — 4002 since the fleet port reallocation). Keep in sync
// with the wait-on URL in the `dev:electron` script.
const DEV_PORT = Number(process.env.PORT || 4002)

// Origins the renderer legitimately runs from; media-protocol uses this
// to decide whether a fetch() gets CORS headers (webSecurity:true, R126).
function appOrigins() {
  if (isDev) return [`http://localhost:${DEV_PORT}`, `http://127.0.0.1:${DEV_PORT}`]
  return [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]
}

let win = null

function loadUserConfig() {
  // R141 (§205): parse through the SAME module every config reader uses —
  // startup, get-config, ai-key-status and set-config can no longer
  // disagree about what a line means (each private copy had drifted on
  // error handling and quote stripping).
  const { values } = readConfigFile(path.join(app.getPath('userData'), 'config.env'))
  for (const [key, raw] of Object.entries(values)) {
    // R139: the file holds keychain TOKENS; env carries plaintext so the
    // gateway and every existing consumer stay untouched. decrypt()
    // passes plaintext through (pre-R139 files) and yields null for a
    // corrupt token — dropped here, which the gateway reports honestly
    // as ai.no-key (re-enter the key) instead of sending garbage.
    const value = SECRET_SLOT_RE.test(key) ? decrypt(raw) : raw
    if (!process.env[key] && value !== null) {
      process.env[key] = value
    }
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
// R143: the transform itself lives in key-migrate.cjs (pure, probe-tested
// against the REAL keychain); this wrapper owns file + availability.
function migrateStoredKeysToSecureStorage() {
  if (!isEncryptionAvailable()) return
  const configFile = userConfigPath()
  let content
  try {
    content = fs.readFileSync(configFile, 'utf8')
  } catch {
    return
  }
  const { content: migrated, changed } = migrateKeyContent(content)
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

const isTrustedSender = createSenderGate({ isDev, port: PORT, devPort: DEV_PORT })

// R134 (§198): install the choke-point BEFORE any controller registers.
// Every ipcMain.handle call from now on — all six controllers, the
// platform layer's ipcHelper, and any future handler — is automatically
// wrapped so a non-app-origin frame's invoke resolves to undefined.
// This is what the R133 audit follow-up promised as "mechanical":
// instead of gating ~150 registration sites one by one, the registration
// FUNCTION ITSELF is gated once.
gateIpcMainHandle(ipcMain, isTrustedSender)

// R141 (§205): the config.env parser is shared by get-config,
// ai-key-status and set-config via `electron/tools/config-file.cjs`.
// One implementation means "file missing" can never be read
// differently by two handlers — the old inline copy here returned a
// bare {} on every read failure, so a fresh install (no config.env
// yet) looked identical to a parsed file with zero secret slots and
// the vault banner lied about the OS keychain.

ipcMain.handle('get-config', (event) => {
  if (!isTrustedSender(event)) return {}
  const parsed = readConfigFile(userConfigPath())
  const result = {}
  for (const [key, raw] of Object.entries(parsed.values)) {
    // R139: the file holds keychain TOKENS for secret slots; a renderer
    // must never see either form. The panel only needs to know whether a
    // key EXISTS (hasKey badges come from the gateway status), so secret
    // values are masked out entirely. A corrupt token maps to '' (also
    // "unset") instead of leaking base64 noise into the UI.
    if (SECRET_SLOT_RE.test(key)) {
      const plain = decrypt(raw)
      result[key] = plain ? '********' : ''
      continue
    }
    result[key] = raw
  }
  return result
})

// Shared vault-status read for ai-key-status AND ai-migrate-keys. One
// counting rule, so the "Encrypt now" button's answer and the banner's
// question can never disagree (§205: closed to SECRET_SLOT_RE — counts,
// never values; a stray non-secret value with the magic prefix must
// never be counted as an encrypted key).
function keyVaultStatus() {
  const parsed = readConfigFile(userConfigPath())
  let encrypted = 0
  let plaintext = 0
  for (const [key, raw] of Object.entries(parsed.values)) {
    if (!SECRET_SLOT_RE.test(key) || !raw) continue
    if (raw.startsWith(magicPrefix())) encrypted++
    else plaintext++
  }
  return { available: isEncryptionAvailable(), exists: parsed.exists, encrypted, plaintext }
}

ipcMain.handle('ai-key-status', (event) => {
  if (!isTrustedSender(event)) return { ok: false }
  // R140 + R141: the vault dashboard asks "how many keys are protected?" —
  // counts only, never tokens or values (the renderer never sees them).
  // `exists` distinguishes a fresh install (no config file yet) from a
  // parsed file with zero secret slots — without it both look like
  // "0 encrypted / 0 plaintext" and the banner lies about the keychain.
  return { ok: true, data: keyVaultStatus() }
})

ipcMain.handle('ai-migrate-keys', (event) => {
  if (!isTrustedSender(event)) return { ok: false }
  // R143 (§206): "Encrypt now" on the vault page. The startup migration
  // runs ONCE; if the keychain was flaky at boot (or the file momentarily
  // unwritable) plaintext keys would sit until the NEXT launch with no way
  // to act on the amber banner. This re-runs the SAME idempotent
  // migration and returns fresh counts — already-encrypted tokens are
  // skipped, double-clicking changes nothing, and the write is atomic
  // with the file's own line format. Storage FORM only: no config value
  // changes, live env keeps plaintext (§203 boundary untouched).
  if (!isEncryptionAvailable()) return { ok: false, data: keyVaultStatus() }
  migrateStoredKeysToSecureStorage()
  return { ok: true, data: keyVaultStatus() }
})

ipcMain.handle('set-config', (event, values) => {
  if (!isTrustedSender(event)) return { success: false }
  const configFile = userConfigPath()
  const existing = readConfigFile(configFile)
  const incoming = values && typeof values === 'object' ? values : {}
  const merged = { ...existing.values, ...incoming }
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
  // Roadmap v3 PART A: on-demand Asset Center. The queue lives renderer-side
  // (core state machine); this controller is the thin download/registry I/O
  // adapter. getWindow() is a getter because `win` is recreated on macOS
  // activate — registering here (not in createWindow) avoids double-handlers.
  registerAssetCenterController(() => win)
  registerAiGateway()
  registerVideoGeneration()

  // MCP server (Phase 2) — spawn child process with IPC channel
  let mcpServerProcess = null
  function spawnMcpServer() {
    if (mcpServerProcess) return mcpServerProcess
    const serverPath = join(dirname(fileURLToPath(import.meta.url)), 'tools', 'mcp', 'server.mjs')
    mcpServerProcess = spawn(process.execPath, [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        MCP_IDLE_TIMEOUT_MS: '300000'
      }
    })
    mcpServerProcess.on('error', (err) => {
      console.error('[MCP] Server spawn error:', err)
      mcpServerProcess = null
    })
    mcpServerProcess.on('exit', (code, signal) => {
      console.log(`[MCP] Server exited: code=${code}, signal=${signal}`)
      mcpServerProcess = null
    })
    // Forward MCP server stderr to our logs
    if (mcpServerProcess.stderr) {
      mcpServerProcess.stderr.on('data', (data) => {
        const text = data.toString().trim()
        if (text) console.error('[MCP Server]', text)
      })
    }
    return mcpServerProcess
  }

  // IPC handlers for MCP server -> main communication
  // All gated by isTrustedSender via gateIpcMainHandle (R134)
  ipcMain.handle('mcp:server:tool:invoke', async (event, { tool, params, requestId, projectId }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    try {
      if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
      return new Promise((resolve) => {
        // Listen for response from renderer via the preload bridge
        const responseChannel = `mcp:forward:respond`
        const handler = (_evt, { requestId: respId, result }) => {
          if (respId === requestId) {
            ipcMain.removeHandler(responseChannel, handler)
            resolve(result)
          }
        }
        ipcMain.on(responseChannel, handler)
        win.webContents.send('mcp:forward', { tool, params, requestId, projectId })
        // Timeout after 10s
        setTimeout(() => {
          ipcMain.removeHandler(responseChannel, handler)
          resolve({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Timeout', retryable: true } })
        }, 10000)
      })
    } catch (err) {
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: String(err), retryable: true } }
    }
  })

  ipcMain.handle('mcp:server:session:init', async (event, { projectId }) => {
    if (!isTrustedSender(event)) return { ok: false }
    return { ok: true, projectId }
  })

  ipcMain.handle('mcp:server:session:close', async (event) => {
    if (!isTrustedSender(event)) return { ok: false }
    return { ok: true }
  })

  // Renderer -> main: proposal changed / project changed events from MCP server
  // These are pushed via the PUSH_CHANNELS allowlist
  ipcMain.handle('mcp:server:event:proposal_changed', (event, proposal) => {
    if (!isTrustedSender(event)) return
    // Forward to host via stdio (server logs it)
    console.error(JSON.stringify({ type: 'event:proposal_changed', payload: proposal }))
  })

  ipcMain.handle('mcp:server:event:project_changed', (event, summary) => {
    if (!isTrustedSender(event)) return
    console.error(JSON.stringify({ type: 'event:project_changed', payload: summary }))
  })

  ipcMain.handle('mcp:server:event:job_status', (event, job) => {
    if (!isTrustedSender(event)) return
    console.error(JSON.stringify({ type: 'event:job_status', payload: job }))
  })

  // Phase 4: Asset Center, Templates, Export Queue handlers
  // All forward to renderer via mcp:forward channel
  // ============================================================

  // Asset Center
  ipcMain.handle('mcp:asset:list_catalog', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('asset.list_catalog', { params, projectId }, event)
  })

  ipcMain.handle('mcp:asset:install', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('asset.install', { params, projectId }, event)
  })

  ipcMain.handle('mcp:asset:uninstall', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('asset.uninstall', { params, projectId }, event)
  })

  ipcMain.handle('mcp:asset:install_status', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('asset.install_status', { params, projectId }, event)
  })

  // Templates
  ipcMain.handle('mcp:template:list', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('template.list', { params, projectId }, event)
  })

  ipcMain.handle('mcp:template:apply', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('template.apply', { params, projectId }, event)
  })

  ipcMain.handle('mcp:template:save_as', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('template.save_as', { params, projectId }, event)
  })

  ipcMain.handle('mcp:template:delete', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('template.delete', { params, projectId }, event)
  })

  ipcMain.handle('mcp:template:import', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('template.import', { params, projectId }, event)
  })

  ipcMain.handle('mcp:template:export', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('template.export', { params, projectId }, event)
  })

  // Export Queue
  ipcMain.handle('mcp:export:list_jobs', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.list_jobs', { params, projectId }, event)
  })

  ipcMain.handle('mcp:export:add_job', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.add_job', { params, projectId }, event)
  })

  ipcMain.handle('mcp:export:pause_job', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.pause_job', { params, projectId }, event)
  })

  ipcMain.handle('mcp:export:resume_job', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.resume_job', { params, projectId }, event)
  })

  ipcMain.handle('mcp:export:cancel_job', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.cancel_job', { params, projectId }, event)
  })

  ipcMain.handle('mcp:export:retry_job', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.retry_job', { params, projectId }, event)
  })

  ipcMain.handle('mcp:export:clear_history', async (event, { projectId, params }) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted sender', retryable: false } }
    if (!win || win.isDestroyed()) return { ok: false, error: { code: 'NO_PROJECT', message: 'No window available', retryable: true } }
    return forwardToRenderer('export.clear_history', { params, projectId }, event)
  })

  // Forward helper: sends mcp:forward to renderer, waits for mcp:forward:respond
  function forwardToRenderer(tool, payload, event) {
    return new Promise((resolve) => {
      const requestId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const responseChannel = 'mcp:forward:respond'
      const handler = (_evt, { requestId: respId, result }) => {
        if (respId === requestId) {
          ipcMain.removeHandler(responseChannel, handler)
          resolve(result)
        }
      }
      ipcMain.on(responseChannel, handler)
      win.webContents.send('mcp:forward', { tool, params: payload, requestId, projectId: payload.projectId })
      setTimeout(() => {
        ipcMain.removeHandler(responseChannel, handler)
        resolve({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Timeout', retryable: true } })
      }, 30000)
    })
  }

  // Start MCP server on demand when renderer requests it

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
