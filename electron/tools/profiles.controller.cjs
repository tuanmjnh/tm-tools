const { ipcMain, app, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const http = require('http')
const https = require('https')
const { profilesDb } = require('./profiles.sqlite.cjs')

// In-memory registry of running profile processes
// profileId -> { pid: number, process: ChildProcess, port: number, startedAt: string }
const runningProfiles = new Map()

// Read config.env from userData
function readUserConfig() {
  const result = {}
  try {
    const configFile = path.join(app.getPath('userData'), 'config.env')
    if (fs.existsSync(configFile)) {
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
    }
  } catch {
    // ignore
  }
  return result
}

// Detect installed browser path by engine/type with config override
function findBrowserExecutable(engine) {
  const conf = readUserConfig()

  // 1. Check user config overrides
  if (engine === 'camoufox') {
    if (process.env.CAMOUFOX_PATH && fs.existsSync(process.env.CAMOUFOX_PATH)) return process.env.CAMOUFOX_PATH
    if (conf.CAMOUFOX_PATH && fs.existsSync(conf.CAMOUFOX_PATH)) return conf.CAMOUFOX_PATH
  } else if (engine === 'donut') {
    if (process.env.DONUT_PATH && fs.existsSync(process.env.DONUT_PATH)) return process.env.DONUT_PATH
    if (conf.DONUT_PATH && fs.existsSync(conf.DONUT_PATH)) return conf.DONUT_PATH
  } else if (engine === 'browser_oxide') {
    if (process.env.BROWSER_OXIDE_PATH && fs.existsSync(process.env.BROWSER_OXIDE_PATH)) return process.env.BROWSER_OXIDE_PATH
    if (conf.BROWSER_OXIDE_PATH && fs.existsSync(conf.BROWSER_OXIDE_PATH)) return conf.BROWSER_OXIDE_PATH
  } else if (engine === 'firefox') {
    if (process.env.FIREFOX_PATH && fs.existsSync(process.env.FIREFOX_PATH)) return process.env.FIREFOX_PATH
    if (conf.FIREFOX_PATH && fs.existsSync(conf.FIREFOX_PATH)) return conf.FIREFOX_PATH
  } else if (engine === 'chromium' || engine === 'chrome') {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
    if (conf.CHROME_PATH && fs.existsSync(conf.CHROME_PATH)) return conf.CHROME_PATH
  }

  // 2. Fallback to candidate scan by OS
  if (process.platform === 'win32') {
    let candidates
    if (engine === 'camoufox') {
      candidates = [
        path.join(process.env.LOCALAPPDATA || '', 'camoufox\\camoufox.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\camoufox\\camoufox.exe'),
        path.join(process.env.APPDATA || '', 'camoufox\\camoufox.exe'),
        path.join(process.cwd(), 'resources\\bin\\camoufox\\camoufox.exe')
      ]
    } else if (engine === 'donut') {
      candidates = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\DonutBrowser\\donut.exe'),
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Donut Browser\\donut.exe'),
        path.join(process.cwd(), 'resources\\bin\\donut\\donut.exe')
      ]
    } else if (engine === 'browser_oxide') {
      candidates = [
        path.join(process.env.USERPROFILE || '', '.cargo\\bin\\browser_oxide.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'browser_oxide\\browser_oxide.exe'),
        path.join(process.cwd(), 'resources\\bin\\oxide\\browser_oxide.exe')
      ]
    } else if (engine === 'firefox') {
      candidates = [
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Mozilla Firefox\\firefox.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox\\firefox.exe')
      ]
    } else {
      candidates = [
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe')
      ]
    }

    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p
    }
  } else if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Firefox.app/Contents/MacOS/firefox'
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
  } else {
    const candidates = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/brave-browser', '/usr/bin/firefox']
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

function getProfilesBaseDir() {
  const dir = path.join(app.getPath('userData'), 'browser_profiles')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getProfileDir(profileId) {
  const dir = path.join(getProfilesBaseDir(), profileId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// Generate an inline proxy extension if proxy requires username/password authentication
function createProxyAuthExtension(extDir, proxy) {
  if (!proxy || !proxy.username || !proxy.password) return null
  try {
    fs.mkdirSync(extDir, { recursive: true })
    const manifest = {
      version: '1.0.0',
      manifest_version: 2,
      name: 'Proxy Auth Helper',
      permissions: ['proxy', 'tabs', 'unlimitedStorage', '<all_urls>', 'webRequest', 'webRequestBlocking'],
      background: {
        scripts: ['background.js']
      },
      minimum_chrome_version: '22.0.0'
    }
    const bgJs = `
      var config = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "${proxy.type === 'socks5' ? 'socks5' : 'http'}",
            host: "${proxy.host}",
            port: parseInt(${proxy.port})
          },
          bypassList: ["localhost", "127.0.0.1"]
        }
      };
      chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});
      chrome.webRequest.onAuthRequired.addListener(
        function(details) {
          return {
            authCredentials: {
              username: "${proxy.username}",
              password: "${proxy.password}"
            }
          };
        },
        {urls: ["<all_urls>"]},
        ['blocking']
      );
    `
    fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    fs.writeFileSync(path.join(extDir, 'background.js'), bgJs, 'utf8')
    return extDir
  } catch (e) {
    console.error('[Profiles] Failed to create proxy extension:', e)
    return null
  }
}

// Find a free port for remote debugging
function getFreePort() {
  return new Promise((resolve) => {
    const srv = http.createServer()
    srv.listen(0, () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function registerProfilesController(win) {
  // Profiles CRUD
  ipcMain.handle('tools:profiles:listProfiles', (_event, filters) => {
    try {
      const res = profilesDb.listProfiles(filters)
      // Attach running status
      const items = res.items.map(item => ({
        ...item,
        isRunning: runningProfiles.has(item.id),
        runningPid: runningProfiles.get(item.id)?.pid || null
      }))
      return { success: true, data: { ...res, items } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:getProfile', (_event, id) => {
    try {
      const profile = profilesDb.getProfile(id)
      if (!profile) return { success: false, error: 'Not found' }
      return {
        success: true,
        data: {
          ...profile,
          isRunning: runningProfiles.has(id),
          runningPid: runningProfiles.get(id)?.pid || null
        }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:createProfile', (_event, data) => {
    try {
      const id = profilesDb.createProfile(data)
      return { success: true, data: { id } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:updateProfile', (_event, { id, data }) => {
    try {
      profilesDb.updateProfile(id, data)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:deleteProfiles', (_event, idOrIds) => {
    try {
      // If any of these are running, kill them first
      const ids = Array.isArray(idOrIds) ? idOrIds : (typeof idOrIds === 'string' ? idOrIds.split(',') : [])
      for (const id of ids) {
        if (runningProfiles.has(id.trim())) {
          try {
            runningProfiles.get(id.trim()).process.kill()
            runningProfiles.delete(id.trim())
          } catch {
            // ignore
          }
        }
      }
      const result = profilesDb.deleteProfiles(idOrIds)
      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:cloneProfile', (_event, { id, newName }) => {
    try {
      const newId = profilesDb.cloneProfile(id, newName)
      return { success: true, data: { id: newId } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Groups
  ipcMain.handle('tools:profiles:listGroups', () => {
    try {
      const data = profilesDb.listGroups()
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:saveGroup', (_event, groupData) => {
    try {
      if (groupData.id) {
        profilesDb.updateGroup(groupData.id, groupData)
        return { success: true, data: { id: groupData.id } }
      } else {
        const id = profilesDb.createGroup(groupData)
        return { success: true, data: { id } }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:deleteGroup', (_event, idOrIds) => {
    try {
      profilesDb.deleteGroup(idOrIds)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Proxies
  ipcMain.handle('tools:profiles:listProxies', () => {
    try {
      const data = profilesDb.listProxies()
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:saveProxy', (_event, proxyData) => {
    try {
      if (proxyData.id) {
        profilesDb.updateProxy(proxyData.id, proxyData)
        return { success: true, data: { id: proxyData.id } }
      } else {
        const id = profilesDb.createProxy(proxyData)
        return { success: true, data: { id } }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:deleteProxy', (_event, idOrIds) => {
    try {
      profilesDb.deleteProxy(idOrIds)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Proxy Checker
  ipcMain.handle('tools:profiles:checkProxy', async () => {
    const startTime = Date.now()
    try {
      return await new Promise((resolve) => {
        const testUrl = 'https://api.ipify.org?format=json'
        const req = https.get(testUrl, { timeout: 10000 }, (res) => {
          let body = ''
          res.on('data', chunk => body += chunk)
          res.on('end', () => {
            const latency = Date.now() - startTime
            try {
              const parsed = JSON.parse(body)
              resolve({
                success: true,
                data: {
                  ip: parsed.ip,
                  latency_ms: latency,
                  status: 'active'
                }
              })
            } catch {
              resolve({ success: true, data: { ip: body.trim(), latency_ms: latency, status: 'active' } })
            }
          })
        })
        req.on('error', (e) => {
          resolve({ success: false, error: e.message, data: { latency_ms: Date.now() - startTime, status: 'dead' } })
        })
        req.on('timeout', () => {
          req.destroy()
          resolve({ success: false, error: 'Connection timed out', data: { latency_ms: 10000, status: 'dead' } })
        })
      })
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // System & Browser Control
  ipcMain.handle('tools:profiles:detectBrowserExecutable', () => {
    const exe = findBrowserExecutable()
    return { success: true, data: { executablePath: exe } }
  })

  ipcMain.handle('tools:profiles:openProfileFolder', (_event, id) => {
    try {
      const dir = getProfileDir(id)
      shell.openPath(dir)
      return { success: true, data: { path: dir } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:clearProfileCache', (_event, id) => {
    try {
      const dir = getProfileDir(id)
      const cacheDir = path.join(dir, 'Default', 'Cache')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tools:profiles:getRunningProfiles', () => {
    const running = []
    for (const [id, info] of runningProfiles.entries()) {
      running.push({
        id,
        pid: info.pid,
        port: info.port,
        startedAt: info.startedAt
      })
    }
    return { success: true, data: running }
  })

  // Launch Browser
  ipcMain.handle('tools:profiles:launchBrowser', async (_event, { profileId, customExe }) => {
    if (runningProfiles.has(profileId)) {
      return { success: true, message: 'Profile is already running', data: { pid: runningProfiles.get(profileId).pid } }
    }

    const profile = profilesDb.getProfile(profileId)
    if (!profile) return { success: false, error: 'Profile not found' }

    const targetEngine = profile.browser_engine || profile.browser_type || 'chromium'
    const exePath = customExe || profile.custom_exe || findBrowserExecutable(targetEngine)
    if (!exePath || !fs.existsSync(exePath)) {
      return {
        success: false,
        error: 'Không tìm thấy browser executable tương thích trên hệ thống. Vui lòng cài đặt Google Chrome, Edge, Firefox, hoặc cấu hình đường dẫn trong Cài đặt > Trình duyệt.'
      }
    }

    const profileDir = getProfileDir(profileId)
    const remotePort = await getFreePort()

    const isFirefoxFamily = profile.browser_engine === 'firefox' || profile.browser_engine === 'camoufox' || profile.browser_type === 'firefox' || profile.browser_type === 'camoufox'

    const args = isFirefoxFamily
      ? [
          `-profile`, profileDir,
          `-no-remote`
        ]
      : [
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--password-store=basic',
          '--disable-blink-features=AutomationControlled',
          `--remote-debugging-port=${remotePort}`
        ]

    // Window size
    if (profile.screen_resolution) {
      const [w, h] = profile.screen_resolution.split('x')
      if (w && h) {
        args.push(`--window-size=${w.trim()},${h.trim()}`)
      }
    }

    // User Agent
    if (profile.user_agent) {
      args.push(`--user-agent=${profile.user_agent}`)
    }

    // Language
    if (profile.languages) {
      const lang = profile.languages.split(',')[0].trim()
      args.push(`--lang=${lang}`)
    }

    // WebRTC mode
    if (profile.webrtc_mode === 'disabled') {
      args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp')
    }

    // Proxy Setup
    let proxyObj = null
    if (profile.proxy_host && profile.proxy_port) {
      proxyObj = {
        type: profile.proxy_type || 'http',
        host: profile.proxy_host,
        port: profile.proxy_port,
        username: profile.proxy_username || '',
        password: profile.proxy_password || ''
      }
    } else if (profile.raw_proxy) {
      // Parse raw proxy string: host:port or host:port:user:pass or schema://user:pass@host:port
      const p = profile.raw_proxy.trim()
      const parts = p.split(':')
      if (parts.length >= 2) {
        proxyObj = {
          type: 'http',
          host: parts[0],
          port: parts[1],
          username: parts[2] || '',
          password: parts[3] || ''
        }
      }
    }

    if (isFirefoxFamily) {
      const userJsLines = [
        '// Generated by TM Tools Firefox/Camoufox profile launcher',
        'user_pref("toolkit.telemetry.enabled", false);',
        'user_pref("toolkit.telemetry.unified", false);',
        'user_pref("network.cookie.cookieBehavior", 0);'
      ]

      if (profile.languages) {
        userJsLines.push(`user_pref("intl.accept_languages", ${JSON.stringify(profile.languages)});`)
      }

      if (proxyObj) {
        userJsLines.push('user_pref("network.proxy.type", 1);')
        if (proxyObj.type === 'socks5') {
          userJsLines.push(`user_pref("network.proxy.socks", "${proxyObj.host}");`)
          userJsLines.push(`user_pref("network.proxy.socks_port", ${Number(proxyObj.port)});`)
          userJsLines.push('user_pref("network.proxy.socks_version", 5);')
          userJsLines.push('user_pref("network.proxy.socks_remote_dns", true);')
        } else {
          userJsLines.push(`user_pref("network.proxy.http", "${proxyObj.host}");`)
          userJsLines.push(`user_pref("network.proxy.http_port", ${Number(proxyObj.port)});`)
          userJsLines.push(`user_pref("network.proxy.ssl", "${proxyObj.host}");`)
          userJsLines.push(`user_pref("network.proxy.ssl_port", ${Number(proxyObj.port)});`)
        }
      }

      try {
        fs.writeFileSync(path.join(profileDir, 'user.js'), userJsLines.join('\n') + '\n', 'utf8')
      } catch (err) {
        console.error('[Profiles] Failed to write user.js:', err)
      }
    } else if (proxyObj) {
      if (proxyObj.username && proxyObj.password) {
        const extDir = path.join(profileDir, '_proxy_extension')
        createProxyAuthExtension(extDir, proxyObj)
        args.push(`--load-extension=${extDir}`)
      } else {
        const scheme = proxyObj.type === 'socks5' ? 'socks5://' : 'http://'
        args.push(`--proxy-server=${scheme}${proxyObj.host}:${proxyObj.port}`)
      }
    }

    // Start URL
    const startUrl = profile.start_url || 'https://whoer.net'
    args.push(startUrl)

    try {
      const child = spawn(exePath, args, {
        detached: true,
        stdio: 'ignore'
      })

      child.unref()

      runningProfiles.set(profileId, {
        pid: child.pid,
        process: child,
        port: remotePort,
        startedAt: new Date().toISOString()
      })

      profilesDb.updateLastLaunched(profileId)

      child.on('exit', () => {
        runningProfiles.delete(profileId)
        if (win && !win.isDestroyed()) {
          win.webContents.send('tools:profiles:statusChanged', {
            profileId,
            isRunning: false
          })
        }
      })

      if (win && !win.isDestroyed()) {
        win.webContents.send('tools:profiles:statusChanged', {
          profileId,
          isRunning: true,
          pid: child.pid
        })
      }

      return {
        success: true,
        data: {
          pid: child.pid,
          port: remotePort,
          profileId
        }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Stop Browser
  ipcMain.handle('tools:profiles:stopBrowser', (_event, profileId) => {
    const running = runningProfiles.get(profileId)
    if (!running) {
      return { success: true, message: 'Profile is not running' }
    }
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(running.pid), '/f', '/t'])
      } else {
        running.process.kill('SIGKILL')
      }
      runningProfiles.delete(profileId)

      if (win && !win.isDestroyed()) {
        win.webContents.send('tools:profiles:statusChanged', {
          profileId,
          isRunning: false
        })
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = {
  registerProfilesController,
  findBrowserExecutable
}
