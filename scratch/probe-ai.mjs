/**
 * AI gateway probe (R148) — calls the REAL main-process gateway from the
 * running Electron renderer, with whatever key sits in the app's stored
 * config, and reports what each surface (plan / transcribe / triage) resolves
 * to plus one live completion.
 *
 *   node scratch/probe-ai.mjs             # status + one plan completion
 *   node scratch/probe-ai.mjs transcribe  # a different task
 *
 * Two traps this file exists to avoid, both hit while writing it:
 *   - every aiGateway IPC answers { ok, data } — reading r.content (instead of
 *     r.data.content) reports a healthy call as "empty content";
 *   - nested template literals with escaping produce bogus SyntaxErrors, so
 *     the page expressions are built by plain string concatenation.
 */

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222'
const task = process.argv[2] || 'plan'

const list = await (await fetch(`${ENDPOINT}/json/list`)).json()
const target = list.find(t => t.type === 'page' && !t.url.startsWith('devtools://'))
if (!target) throw new Error('no renderer target — is dev:electron running?')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
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
  }
})

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 120000)
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (res.exceptionDetails) {
    const d = res.exceptionDetails
    throw new Error((d.exception && d.exception.description) || d.text)
  }
  return res.result.value
}

await send('Runtime.enable')

const surfaceExpr = '(async () => {' +
  '  const api = window.electronAPI || {};' +
  '  const gw = (api.tools || {}).aiGateway || null;' +
  '  const out = { gatewayKeys: gw ? Object.keys(gw) : [] };' +
  '  if (gw && gw.tasks) {' +
  '    try { out.tasks = await gw.tasks(); } catch (e) { out.tasksError = String((e && e.message) || e); }' +
  '  }' +
  '  return out;' +
'})()'

console.log('--- renderer AI surface ---')
const surface = await evaluate(surfaceExpr)
console.log(JSON.stringify(surface.gatewayKeys))
const tasksData = surface.tasks && surface.tasks.data ? surface.tasks.data.tasks : null
if (tasksData) {
  for (const [name, st] of Object.entries(tasksData)) {
    console.log(`  ${name.padEnd(11)} provider=${st.provider} model=${st.model} hasKey=${st.hasKey} base=${st.baseUrl}`)
  }
} else {
  console.log('  tasks error:', surface.tasksError || JSON.stringify(surface.tasks).slice(0, 300))
}

const callExpr = '(async () => {' +
  '  const gw = window.electronAPI.tools.aiGateway;' +
  '  const t0 = Date.now();' +
  '  try {' +
  '    const r = await gw.complete({' +
  '      task: ' + JSON.stringify(task) + ',' +
  '      messages: [{ role: "user", content: "Reply with exactly: OK" }],' +
  '      maxTokens: 512,' +
  '      timeoutMs: 20000' +
  '    });' +
  '    const d = (r && r.data) || {};' +
  '    return { wrapperOk: !!(r && r.ok), roundTripMs: Date.now() - t0, latencyMs: d.latencyMs, model: d.model,' +
  '             content: String(d.content || "").slice(0, 200), hasContent: !!String(d.content || "").trim() };' +
  '  } catch (e) {' +
  '    return { threw: true, roundTripMs: Date.now() - t0, code: e && e.code, message: String((e && e.message) || e).slice(0, 300) };' +
  '  }' +
'})()'

console.log('\n--- live completion (task=' + task + ') ---')
console.log(JSON.stringify(await evaluate(callExpr), null, 2))

const modelsExpr = '(async () => {' +
  '  const gw = window.electronAPI.tools.aiGateway;' +
  '  if (!gw || !gw.models) return { unsupported: true };' +
  '  try {' +
  '    const r = await gw.models({ task: ' + JSON.stringify(task) + ' });' +
  '    const d = (r && r.data) || r;' +
  '    const arr = Array.isArray(d) ? d : (d && d.models) || [];' +
  '    return { count: arr.length, first: arr.slice(0, 6) };' +
  '  } catch (e) { return { error: String((e && e.message) || e).slice(0, 300) }; }' +
'})()'

console.log('\n--- models (task=' + task + ') ---')
console.log(JSON.stringify(await evaluate(modelsExpr), null, 2))

ws.close()
