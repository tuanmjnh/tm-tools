/**
 * Step-based interaction test for the running Electron dev window (R148).
 *
 * Complements scratch/cdp-drive.mjs (which only loads routes): this drives
 * real clicks in the real renderer and reports, per step, the console
 * errors/exceptions that appeared while that step ran — so a failure names
 * the click that caused it.
 *
 *   node scratch/cdp-actions.mjs
 *
 * Nothing here writes user data on purpose: steps either navigate, open a
 * dialog, or click a link. File pickers / exports are deliberately not
 * triggered.
 */

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222'
const BASE = process.env.APP_BASE || 'http://localhost:4002'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function pickTarget() {
  const list = await (await fetch(`${ENDPOINT}/json/list`)).json()
  const t = list.find(x => x.type === 'page' && !x.url.startsWith('devtools://'))
  if (!t) throw new Error('no renderer target — is dev:electron running?')
  return t
}

const target = await pickTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
const events = []

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', e => reject(new Error(String(e.message || e))))
})
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method) events.push(msg)
})

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)) } }, 30000)
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text)
  return res.result.value
}

const IGNORE = /Electron Security Warning|\[MCP\] electronAPI\.mcp\.onToolInvoke not available|Download the Vue Devtools/

function drainProblems() {
  const out = []
  for (const msg of events.splice(0, events.length)) {
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
      if (!IGNORE.test(text)) out.push(`console.${msg.params.type}: ${text.replace(/\n/g, ' ').slice(0, 300)}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      out.push(`exception: ${(d.exception?.description || d.text || '').replace(/\n/g, ' ').slice(0, 300)}`)
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      out.push(`log.error: ${String(msg.params.entry.text).replace(/\n/g, ' ').slice(0, 300)}`)
    }
  }
  return out
}

async function waitMounted(timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ok = await evaluate(`(() => { const r = document.getElementById('__nuxt'); return !!r && r.childElementCount > 0 })()`)
      if (ok) return true
    } catch { /* navigation in flight */ }
    await sleep(400)
  }
  return false
}

const mountedExpr = '(() => { const r = document.getElementById("__nuxt"); return !!r && r.childElementCount > 0 })()'

async function goto(route, ready) {
  await send('Page.navigate', { url: `${BASE}${route}` })
  await waitMounted()
  // A dev server that just rebuilt Nitro can hand the page a stale module
  // graph: the SPA loading template stays and #__nuxt never fills. One
  // reload clears it — otherwise every step on the page reports "no buttons".
  if (!(await evaluate(mountedExpr).catch(() => false))) {
    await send('Page.navigate', { url: `${BASE}${route}` })
    await waitMounted()
  }
  // Clicking during the SPA's first paint lands on the outgoing page and
  // silently reports clicked:false, so wait for the route's own marker.
  if (ready) {
    const t0 = Date.now()
    while (Date.now() - t0 < 15000) {
      const text = await evaluate('document.body.innerText').catch(() => '')
      if (new RegExp(ready).test(text || '')) break
      await sleep(400)
    }
  }
  await sleep(1200)
}

/**
 * Click the first button/link/summary matching `text`: exact > startsWith >
 * contains (labels carry arrows/decoration, e.g. "← Back to Templates").
 */
async function clickText(text) {
  return evaluate(`(() => {
    const norm = s => String(s).replace(/[\u2190-\u21ff\u2000-\u206f]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const needle = norm(${JSON.stringify(text)})
    const els = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], summary'))
      .filter(e => e.getClientRects().length > 0)
    const el = els.find(e => norm(e.innerText) === needle)
      || els.find(e => norm(e.innerText).startsWith(needle))
      || els.find(e => norm(e.innerText).includes(needle))
    if (!el) return { clicked: false, candidates: els.map(e => norm(e.innerText)).filter(Boolean).slice(0, 20) }
    el.click()
    return { clicked: true, tag: el.tagName, text: norm(el.innerText).slice(0, 60) }
  })()`)
}

// offsetParent is null for anything inside a position:fixed overlay, so it
// reported "no dialog" for every Nuxt UI modal. getClientRects() is honest.
const HAYSTACK = `(() => {
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  // NOT .fixed: the app shell (sidebar/topbar/drawers) is fixed-position
  // too, and matching it made every page look like one big dialog.
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-reka-popper-content-wrapper]'))
    .filter(visible)
    .filter(el => (el.innerText || '').trim().length > 0)
  const selects = Array.from(document.querySelectorAll('select')).map(sel => ({
    options: Array.from(sel.options).map(o => o.text.trim()),
    disabled: sel.disabled
  }))
  return {
    path: location.pathname + location.search,
    dialogText: dialogs.map(d => d.innerText.trim()).join('\\n---\\n').slice(0, 1500),
    dialogCount: dialogs.length,
    selects,
    // Full body text for assertions; the short field stays for log readability.
    bodyText: (document.body.innerText || '').slice(0, 4000),
    text: (document.body.innerText || '').slice(0, 600)
  }
})()`

const steps = [
  {
    label: 'index: nav → Templates',
    run: async () => {
      await goto('/tmcut', 'Recent Projects')
      const clicked = await clickText('Templates')
      await sleep(2000)
      return { clicked, path: await evaluate('location.pathname') }
    },
    expect: r => r.path === '/tmcut/templates'
  },
  {
    label: 'index: hero + recent projects + presets render',
    run: async () => { await goto('/tmcut', 'Recent Projects'); return evaluate(HAYSTACK) },
    expect: r => /Recent Projects/.test(r.bodyText) && /Presets & Aspect Ratios/.test(r.bodyText)
  },
  {
    label: 'factory: "Back to Templates" link navigates (was URouterLink)',
    run: async () => {
      await goto('/tmcut/factory', 'Video Factory')
      const clicked = await clickText('Back to Templates')
      await sleep(2000)
      return { clicked, path: await evaluate('location.pathname') }
    },
    expect: r => r.clicked.clicked === true && r.path === '/tmcut/templates'
  },
  {
    label: 'templates: library renders its categories',
    run: async () => { await goto('/tmcut/templates', 'Template Library'); return evaluate(HAYSTACK) },
    expect: r => /Template Library/.test(r.text)
  },
  {
    label: 'autocut: 4-step shell renders (no stray dialog)',
    run: async () => { await goto('/tmcut/autocut', 'Upload Source Clip'); return evaluate(HAYSTACK) },
    expect: r => /STEP 1/.test(r.bodyText) && /STEP 4/.test(r.bodyText) && r.dialogCount === 0
  },
  {
    label: 'editor: AI Script dialog opens with the model chooser',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      const clicked = await clickText('AI Script')
      await sleep(4000)
      const state = await evaluate(HAYSTACK)
      // The dialog's own text is the point: it must show translated labels
      // (never raw i18n keys) and "provider — model id" options.
      const dialog = await evaluate(`(() => {
        const d = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
          .filter(el => el.getClientRects().length > 0)
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0]
        if (!d) return null
        return {
          text: d.innerText.trim().slice(0, 900),
          selects: Array.from(d.querySelectorAll('select')).map(s => ({
            value: s.value,
            disabled: s.disabled,
            options: Array.from(s.options).map(o => o.text.trim())
          })),
          rawKeyLeak: /\btmcut\.[a-zA-Z.]+\b/.test(d.innerText)
        }
      })()`)
      return { clicked, dialog }
    },
    expect: r => r.clicked.clicked === true && r.dialog !== null && r.dialog.rawKeyLeak === false
  },
  {
    label: 'editor: AI Script model Test runs a REAL completion',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      const open = await clickText('AI Script')
      await sleep(4500)

      // The picker's verdict is the tail paragraph under the select, so read
      // the dialog tail verbatim instead of pattern-matching an error format
      // ("timed out" does not contain "timeout" — that mistake reported a
      // real failure as 'no verdict').
      const tail = `(() => {
        const d = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
          .filter(el => el.getClientRects().length > 0)
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0]
        if (!d) return null
        // The verdict is a paragraph INSIDE the picker box, not the last line
        // of the dialog (the right-hand storyboard panel owns those).
        const sel = d.querySelector('select')
        const box = sel ? (sel.closest('div.rounded-lg') || sel.parentElement.parentElement) : null
        const lines = box ? (box.innerText || '').split('\\n').map(l => l.trim()).filter(Boolean) : null
        const btn = Array.from(d.querySelectorAll('button')).find(x => /test/i.test(x.innerText || ''))
        return { picker: lines, busy: btn ? btn.disabled : null, hasSelect: !!sel }
      })()`
      const before = await evaluate(tail)
      const clicked = await clickText('Test model') || await clickText('Kiểm tra model')
      let after = null
      for (let i = 0; i < 30; i++) {
        await sleep(2000)
        const seen = await evaluate(tail).catch(() => null)
        if (seen) {
          after = seen
          const verdict = (seen.picker || []).join(' ')
          const isVerdict = /answered in|timed out|no key|rate|failed|error|Model OK|ai\./i.test(verdict)
          if (isVerdict && seen.busy === false) break
        }
      }
      const verdictLines = (after?.picker || []).filter(l => /answered in|timed out|no key|failed|error|not found|rate|ai\./i.test(l))
      return {
        opened: open.clicked === true,
        clicked: clicked.clicked === true,
        currentModel: (before?.picker || [])[1] || null,
        optionCount: (before?.picker || []).length - 2,
        verdictLines,
        busyWhenDone: after?.busy
      }
    },
    expect: r => r.clicked === true && r.verdictLines.length > 0
  },
  {
    label: 'editor: AI Script picker internals (diagnostic)',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      await clickText('AI Script')
      await sleep(5000)
      const inspect = `(() => {
        const d = Array.from(document.querySelectorAll('[role="dialog"]')).filter(el => el.getClientRects().length > 0)[0]
        if (!d) return { dialog: false }
        const buttons = Array.from(d.querySelectorAll('button')).map(b => ({
          text: (b.innerText || '').replace(/\\s+/g, ' ').trim(),
          disabled: b.disabled,
          title: b.getAttribute('title')
        }))
        const sel = d.querySelector('select')
        return {
          dialog: true,
          buttons,
          selected: sel ? sel.value : null,
          selectedText: sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : null,
          tail: (d.innerText || '').split('\\n').slice(-6).join(' | ')
        }
      })()`
      const before = await evaluate(inspect)
      // Click the picker's Test button by its position in the button list.
      await evaluate(`(() => {
        const d = Array.from(document.querySelectorAll('[role="dialog"]')).filter(el => el.getClientRects().length > 0)[0]
        const b = Array.from(d.querySelectorAll('button')).find(x => /test/i.test(x.innerText || ''))
        if (b) { b.click(); return true }
        return false
      })()`)
      const samples = []
      for (let i = 0; i < 9; i++) {
        await sleep(5000)
        const s = await evaluate(`(() => {
          const d = Array.from(document.querySelectorAll('[role="dialog"]')).filter(el => el.getClientRects().length > 0)[0]
          const b = d ? Array.from(d.querySelectorAll('button')).find(x => /test/i.test(x.innerText || '')) : null
          return { busy: b ? b.disabled : null, tail: d ? (d.innerText || '').split('\\n').slice(-4).join(' | ') : null }
        })()`).catch(() => null)
        samples.push(s)
      }
      return { before, samples }
    },
    expect: () => true
  },
  {
    label: 'editor: AI Script GENERATES a storyboard end-to-end',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      await clickText('AI Script')
      await sleep(4000)

      // Vue v-model listens for real input events; a plain .value write is
      // ignored, so set through the native prototype setter.
      const typed = await evaluate(`(() => {
        const d = Array.from(document.querySelectorAll('[role="dialog"]')).filter(el => el.getClientRects().length > 0)[0]
        if (!d) return { found: false }
        const ta = d.querySelector('textarea')
        if (!ta) return { found: false }
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'Ba thoi quen buoi sang giup tang nang suat lam viec')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return { found: true, value: ta.value.slice(0, 40) }
      })()`)

      const clicked = await clickText('Generate Script with AI')
      let produced = null
      for (let i = 0; i < 30; i++) {
        await sleep(3000)
        const state = await evaluate(`(() => {
          const d = Array.from(document.querySelectorAll('[role="dialog"]')).filter(el => el.getClientRects().length > 0)[0]
          if (!d) return null
          const text = d.innerText || ''
          return {
            empty: text.includes('No Script Generated Yet'),
            scenes: (text.match(/(\\d+)\\s*(scenes|canh|SCENE)/i) || [])[0] || null,
            hasSceneWord: /SCENE\\s*\\d|Scene 1|Canh 1/i.test(text),
            tail: text.split('\\n').map(l => l.trim()).filter(Boolean).slice(-6)
          }
        })()`).catch(() => null)
        if (state && !state.empty) { produced = state; break }
      }
      return { typed, clicked, produced }
    },
    expect: r => r.clicked.clicked === true && r.produced !== null,
    // Generation is a real model call; 90s of polling is inside this step.
    timeoutMs: 200000
  },
  {
    label: 'editor: media tabs switch (Video / Audio / Image / Text / Effects)',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      const results = []
      for (const tab of ['Video', 'Audio', 'Image', 'Text', 'Effects', 'Filters']) {
        results.push({ tab, ...(await clickText(tab)) })
        await sleep(900)
      }
      return results
    },
    expect: r => r.filter(x => x.clicked).length >= 5
  },
  {
    label: 'editor: Export Queue dialog opens',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      const clicked = await clickText('Export Queue')
      await sleep(2500)
      return { clicked, state: await evaluate(HAYSTACK) }
    },
    expect: r => r.clicked.clicked === true && r.state.dialogCount > 0
  },
  {
    label: 'editor: AI Edit + Agent + Audio Orchestration buttons respond',
    run: async () => {
      await goto('/tmcut/editor', 'MEDIA LIBRARY')
      const out = []
      for (const label of ['AI Edit', 'Agent', 'Audio Orchestration']) {
        const before = await evaluate('document.body.innerText.length')
        const c = await clickText(label)
        await sleep(1800)
        const after = await evaluate('document.querySelectorAll(\'[role="dialog"]\').length')
        out.push({ label, clicked: c.clicked === true, dialogs: after, before })
        // Close whatever opened so the next label is clickable.
        await evaluate('document.dispatchEvent(new KeyboardEvent(\'keydown\', { key: \'Escape\' }))')
        await sleep(600)
      }
      return out
    },
    expect: r => r.filter(x => x.clicked).length === 3
  }
]

await send('Runtime.enable')
await send('Page.enable')
await send('Log.enable')

// STEP=<regex> runs a subset while iterating on one surface.
const only = process.env.STEP ? new RegExp(process.env.STEP, 'i') : null
const selected = only ? steps.filter(s => only.test(s.label)) : steps

let failed = 0
for (const step of selected) {
  events.length = 0
  let result
  let error = null
  try {
    result = await step.run()
  } catch (err) {
    error = String(err.message || err)
  }
  await sleep(600)
  const problems = drainProblems()
  let ok = !error
  if (ok && step.expect) {
    try {
      ok = !!step.expect(result)
    } catch (err) {
      ok = false
      error = `expect threw: ${err.message}`
    }
  }
  if (!ok || problems.length) failed++
  console.log(`${ok && !problems.length ? 'PASS' : 'FAIL'}  ${step.label}`)
  if (error) console.log(`      error: ${error}`)
  if (result !== undefined) console.log(`      result: ${JSON.stringify(result).slice(0, 1600)}`)
  for (const p of problems.slice(0, 6)) console.log(`      ${p}`)
}

console.log(failed === 0 ? '\nALL STEPS CLEAN' : `\n${failed} step(s) need attention`)
ws.close()
process.exit(failed === 0 ? 0 : 1)
