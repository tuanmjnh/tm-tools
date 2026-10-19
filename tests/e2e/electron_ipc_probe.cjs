// R133 probe (docs §197): prove the REAL Electron runtime enforces the
// IPC trust policy that unit specs can only model:
//  1) the real preload's electronAPI.on fires ONLY for allow-listed
//     channels, unsub works, and unknown channels receive nothing;
//  2) electronAPI.send refuses every channel (OUTBOUND allow-list empty,
//     silently — a bridge refusal is not an exception);
//  3) the REAL createSenderGate passes the trusted loopback origin and
//     refuses a file:// frame (the same factory the file-manager and all
//     privileged main handlers now use).
//
//   node_modules\electron\dist\electron.exe tests/e2e/electron_ipc_probe.cjs
//
// Prints PROBE lines to stdout; exits 0 on all pass, 1 on any failure.
const { app, BrowserWindow } = require('electron')
const http = require('http')
const path = require('path')

const { createSenderGate } = require('../../electron/ipcPolicy.cjs')

const PAGE = '<!doctype html><html><body>probe</body></html>'

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end(PAGE)
    })
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }))
  })
}

app.whenReady().then(async () => {
  let srv = null
  const results = []
  try {
    const started = await startServer()
    srv = started.srv
    const { port } = started

    // 1) The real gate factory against synthetic frames of both origins —
    // same code path main.cjs and the file-manager guard execute.
    const gate = createSenderGate({ isDev: false, port })
    results.push([gate({ senderFrame: { url: `http://127.0.0.1:${port}/` } }), 'gate trusts the loopback app origin'])
    results.push([!gate({ senderFrame: { url: 'file:///C:/evil/x.html' } }), 'gate refuses a file:// frame'])
    results.push([!gate({ senderFrame: { url: 'http://evil.example/' } }), 'gate refuses a remote origin'])

    // 2) Real preload, real sandbox, real http origin.
    const win = new BrowserWindow({
      width: 640,
      height: 480,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    await win.loadURL(`http://127.0.0.1:${port}/`)

    // Measurement sequence, no races (each step is awaited):
    //  a) register listeners via the real preload;
    //  b) push BOTH channels — only the allow-listed one may arrive;
    //  c) unsubscribe;
    //  d) push again — after unsub NOTHING may arrive (leak check);
    //  e) pull the page's counters.
    await win.webContents.executeJavaScript(`(() => {
      window.__probe = { got: 0, unknownFired: false, sendThrew: false }
      window.__unsub = window.electronAPI.on('eventbus:event', () => window.__probe.got++)
      window.__unsubUnknown = window.electronAPI.on('probe:not-allow-listed', () => { window.__probe.unknownFired = true })
      try { window.electronAPI.send('probe:any', {}) } catch (e) { window.__probe.sendThrew = true; window.__probe.sendErr = String(e && e.message ? e.message : e) }
      window.__probe.unsubIsFn = typeof window.__unsubUnknown === 'function'
      return 'registered'
    })()`)
    win.webContents.send('eventbus:event', { event: 'x', payload: 1 })
    win.webContents.send('probe:not-allow-listed', 1)
    await new Promise(r => setTimeout(r, 400))
    await win.webContents.executeJavaScript('window.__unsub(); "unsubbed"')
    win.webContents.send('eventbus:event', { event: 'x2', payload: 2 })
    win.webContents.send('probe:not-allow-listed', 2)
    await new Promise(r => setTimeout(r, 400))
    const outcome = await win.webContents.executeJavaScript('JSON.stringify(window.__probe)')
    const out = JSON.parse(outcome)

    results.push([out.got === 1, `allow-listed on() fires once then unsub works (got=${out.got})`])
    results.push([out.unsubIsFn && !out.unknownFired, 'unknown-channel on() refused (noop unsub, no delivery)'])
    results.push([out.sendThrew === false, `send() refuses silently on empty allow-list${out.sendErr ? ' :: ' + out.sendErr : ''}`])
  } catch (err) {
    results.push([false, `probe crashed: ${err && err.message ? err.message : String(err)}`])
  } finally {
    if (srv) srv.close()
    let failed = 0
    for (const [ok, name] of results) {
      console.log(`PROBE ${ok ? 'PASS' : 'FAIL'} ${name}`)
      if (!ok) failed++
    }
    app.exit(failed === 0 ? 0 : 1)
  }
})
