/**
 * CDP driver for the running Electron dev window (R148).
 *
 * Drives the REAL renderer of `pnpm dev:electron`, so the pages under test run
 * with window.electronAPI present (the browser preview cannot show that).
 * Zero dependencies: Node 22's global WebSocket speaks the DevTools Protocol.
 *
 * Usage:
 *   node scratch/cdp-drive.mjs                # all tmcut routes
 *   node scratch/cdp-drive.mjs /tmcut/autocut # one route
 *
 * What it reports per route: document title, whether the SPA mounted, which
 * Electron bridges exist, visible-text markers, and EVERY console/exception
 * entry captured while the page loaded (that is the part that finds bugs).
 */

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222'

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/tmcut', '/tmcut/autocut', '/tmcut/factory', '/tmcut/templates', '/tmcut/editor']

async function pickPageTarget() {
  const list = await (await fetch(`${ENDPOINT}/json/list`)).json()
  const target = list.find(t => t.type === 'page' && !t.url.startsWith('devtools://'))
  if (!target) throw new Error('no renderer page target found — is dev:electron running?')
  return target
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let nextId = 1
    const pending = new Map()
    const events = []
    ws.addEventListener('open', () => resolve({ ws, send, events }))
    ws.addEventListener('error', e => reject(new Error(`ws error: ${e.message || 'unknown'}`)))
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: done, reject: fail } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) fail(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`))
        else done(msg.result)
        return
      }
      if (msg.method) events.push(msg)
    })
    function send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            reject(new Error(`timeout: ${method}`))
          }
        }, 30000)
      })
    }
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text)
  }
  return res.result.value
}

/** Wait until the SPA mounted something into #__nuxt, or give up. */
async function waitForMount(send, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const state = await evaluate(send, `(() => {
        const root = document.getElementById('__nuxt')
        return {
          ready: document.readyState,
          mounted: !!root && root.childElementCount > 0,
          text: (document.body ? document.body.innerText : '').slice(0, 200)
        }
      })()`)
      if (state.mounted) return state
    } catch {
      // mid-navigation: Runtime may be detached, retry
    }
    await sleep(500)
  }
  return null
}

function formatEvent(msg) {
  // Full frames matter: a Vue warning's TEXT names no file, but the frames
  // below the Vue internals are the app code that triggered it.
  const frames = (stackTrace) => (stackTrace?.callFrames || []).map(f =>
    `${f.url.replace(/^https?:\/\/localhost:\d+\/_nuxt\//, '~/').replace(/\?v=[0-9a-f]+$/, '')}:${f.lineNumber + 1}:${f.columnNumber}`)
  if (msg.method === 'Runtime.consoleAPICalled') {
    const p = msg.params
    const text = (p.args || []).map(a => a.value ?? a.description ?? a.type).join(' ')
    return { kind: `console.${p.type}`, text: text.slice(0, 900), stack: (frames(p.stackTrace)[0] || ''), frames: frames(p.stackTrace) }
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    return { kind: 'exception', text: (d.exception?.description || d.text || '').slice(0, 900), stack: frames(d.stackTrace)[0] || '' }
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    return { kind: `log.${e.level}`, text: String(e.text).slice(0, 900), stack: e.url || '' }
  }
  return null
}

async function probeRoute(base, route) {
  const target = await pickPageTarget()
  const { ws, send, events } = await connect(target.webSocketDebuggerUrl)
  const report = { route, title: null, mounted: false, bridges: [], markers: {}, problems: [], textSample: '' }
  try {
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Log.enable')

    const onLoad = new Promise(resolve => {
      const check = () => {
        if (events.some(e => e.method === 'Page.loadEventFired')) resolve()
      }
      const timer = setInterval(() => {
        check()
        if (report.mounted) { /* keep waiting for load */ }
      }, 100)
      setTimeout(() => { clearInterval(timer); resolve() }, 25000)
    })
    await send('Page.navigate', { url: `${base}${route}` })
    await waitForMount(send)
    await onLoad
    await sleep(2500) // let async setup (stores, hub calls, IPC) settle and log

    const info = await evaluate(send, `(() => {
      const api = window.electronAPI || {}
      const root = document.getElementById('__nuxt')
      const body = document.body ? document.body.innerText : ''
      return {
        title: document.title,
        mounted: !!root && root.childElementCount > 0,
        bridges: Object.keys(api).filter(k => typeof api[k] === 'function'),
        hasElectronFlag: !!api.isElectron,
        headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.innerText.trim()).filter(Boolean).slice(0, 12),
        unresolved: Array.from(document.querySelectorAll('*')).filter(el => el.tagName.includes('-') && el.tagName.startsWith('U')).map(el => el.tagName.toLowerCase()),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 25),
        inputs: document.querySelectorAll('input,textarea,select').length,
        canvas: document.querySelectorAll('canvas').length,
        textLen: body.length,
        textSample: body.slice(0, 300)
      }
    })()`)

    report.title = info.title
    report.mounted = info.mounted
    report.bridges = info.bridges
    report.markers = {
      electronFlag: info.hasElectronFlag,
      headings: info.headings,
      buttons: info.buttons,
      inputs: info.inputs,
      canvas: info.canvas,
      textLen: info.textLen,
      unresolved: info.unresolved
    }
    report.textSample = info.textSample
    report.problems = events.map(formatEvent).filter(Boolean).filter(e =>
      e.kind === 'exception' || e.kind === 'console.error' || e.kind === 'console.warning' || e.kind.startsWith('log.')
    )
  } catch (err) {
    report.problems.push({ kind: 'driver', text: String(err.message || err) })
  } finally {
    ws.close()
  }
  return report
}

const base = process.env.APP_BASE || 'http://localhost:4002'
const reports = []
for (const route of ROUTES) {
  process.stdout.write(`probe ${route} ... `)
  const r = await probeRoute(base, route)
  reports.push(r)
  console.log(r.mounted ? `mounted (${r.markers.textLen} chars, ${r.problems.length} problems)` : `NOT MOUNTED (${r.problems.length} problems)`)
}

console.log('\n=== DETAIL ===')
for (const r of reports) {
  console.log(`\n--- ${r.route}`)
  console.log(`  title   : ${r.title}`)
  console.log(`  mounted : ${r.mounted} | electronAPI.isElectron=${r.markers.electronFlag} | bridges=${r.bridges.length}`)
  console.log(`  bridges : ${r.bridges.slice(0, 14).join(', ')}${r.bridges.length > 14 ? ` …(+${r.bridges.length - 14})` : ''}`)
  console.log(`  headings: ${JSON.stringify(r.markers.headings)}`)
  console.log(`  buttons : ${JSON.stringify(r.markers.buttons?.slice(0, 12))}`)
  console.log(`  inputs=${r.markers.inputs} canvas=${r.markers.canvas} textLen=${r.markers.textLen} unresolvedEls=${JSON.stringify(r.markers.unresolved || [])}`)
  console.log(`  text    : ${JSON.stringify(r.textSample.slice(0, 180))}`)
  if (r.problems.length) {
    console.log('  problems:')
    for (const p of r.problems.slice(0, 25)) {
      console.log(`    [${p.kind}] ${p.text.replace(/\n/g, ' ').slice(0, 200)}`)
      if (p.frames) for (const f of p.frames.slice(0, 8)) console.log(`        · ${f}`)
    }
  } else {
    console.log('  problems: (none)')
  }
}

// Machine-readable companion for the docs/process log.
const { writeFileSync } = await import('node:fs')
writeFileSync('scratch/cdp-report.json', JSON.stringify(reports, null, 2))
console.log('\nwrote scratch/cdp-report.json')
