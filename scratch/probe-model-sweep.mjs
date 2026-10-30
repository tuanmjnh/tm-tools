/**
 * Model sweep (R148) — which catalogued models on the configured provider
 * actually ANSWER?
 *
 * The picker lists 85 NVIDIA models, but a catalogue entry is not a working
 * model: NVIDIA keeps retired ids (404/410) and some entries hang until the
 * timeout. The `plan` surface was configured with one that times out, so AI
 * Script produced nothing. This runs the gateway against candidates and
 * reports the ones that reply — the only honest way to choose.
 *
 *   node scratch/probe-model-sweep.mjs [limit]
 *
 * No secret handling: the main process resolves the stored key from the plan
 * slots (which already hold a working NVIDIA key — models() returns 85).
 */

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222'
const LIMIT = Number(process.argv[2]) || 10

const list = await (await fetch(`${ENDPOINT}/json/list`)).json()
const target = list.find(t => t.type === 'page' && !t.url.startsWith('devtools://'))
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
  if (res.exceptionDetails) throw new Error((res.exceptionDetails.exception && res.exceptionDetails.exception.description) || res.exceptionDetails.text)
  return res.result.value
}
await send('Runtime.enable')

const expr = '(async () => {' +
  '  const gw = window.electronAPI.tools.aiGateway;' +
  '  const task = "plan";' +
  '  const listRes = await gw.models({ task });' +
  '  const d = (listRes && listRes.data) || {};' +
  '  const all = Array.isArray(d) ? d : (d.models || []);' +
  '  const ids = all.map(m => m.id || m.modelId || String(m)).filter(Boolean);' +
  '  // Chat-shaped candidates first; embeddings/rerankers/vision-only/dead families\n' +
  '  // are not worth a probe.\n' +
  '  const prefer = /instruct|chat|deepseek|llama|qwen|mistral|gemma|nemotron|phi|yi-/i;' +
  '  const skip = /embed|rerank|guard|fuyu|deplot|diffusion|cosmos|starcoder|codegemma|esm|molm|vila|nvclip|riva/i;' +
  '  const candidates = ids.filter(id => prefer.test(id) && !skip.test(id)).slice(0, ' + LIMIT + ');' +
  '  const results = [];' +
  '  for (const model of candidates) {' +
  '    const t0 = Date.now();' +
  '    try {' +
  '      const r = await gw.complete({ task, model, messages: [{ role: "user", content: "Reply with exactly: OK" }], maxTokens: 64, timeoutMs: 9000 });' +
  '      const data = (r && r.data) || {};' +
  '      const text = String(data.content || "").trim();' +
  '      results.push({ model, ms: Date.now() - t0, state: (r && r.ok) && text ? "ok" : "empty",' +
  '        code: r && r.code, error: String((r && r.error) || "").slice(0, 90), content: text.slice(0, 40) });' +
  '    } catch (e) {' +
  '      results.push({ model, ms: Date.now() - t0, state: "throw", error: String((e && e.message) || e).slice(0, 80) });' +
  '    }' +
  '  }' +
  '  return { total: ids.length, candidates, results };' +
'})()'

const out = await evaluate(expr)
console.log(`catalogue: ${out.total} models | probed ${out.results.length}\n`)
for (const r of out.results) {
  const verdict = r.state === 'ok'
    ? `OK  (${r.ms}ms) "${r.content}"`
    : `${r.state.toUpperCase()} (${r.ms}ms) ${r.code || ''} ${r.error || ''}`
  console.log(`  ${r.model.padEnd(46)} ${verdict}`)
}
const working = out.results.filter(r => r.state === 'ok')
console.log(`\nworking: ${working.length}/${out.results.length}`)
if (working.length) console.log('first working model:', working[0].model)

ws.close()
