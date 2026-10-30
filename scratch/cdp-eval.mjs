/**
 * CDP eval utility (R148) — run one expression in the running Electron
 * renderer and print the JSON result.
 *
 *   node scratch/cdp-eval.mjs "location.pathname"
 *   node scratch/cdp-eval.mjs "document.body.innerText.slice(0,200)"
 *
 * Kept dependency-free (Node 22 global WebSocket). Expressions passed here
 * are plain CLI arguments, so no escaping gymnastics are involved.
 */

import { readFileSync } from 'node:fs'

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222'
const expression = process.argv[2] || (process.env.EXPR_FILE ? readFileSync(process.env.EXPR_FILE, 'utf8') : null)
if (!expression) {
  console.error('usage: node scratch/cdp-eval.mjs "<expression>"  (or set EXPR_FILE for a long one)')
  process.exit(2)
}

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
    const { resolve } = pending.get(msg.id)
    pending.delete(msg.id)
    resolve(msg)
  }
})

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 60000)
  })
}

const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
if (res.result && res.result.exceptionDetails) {
  console.error('EXCEPTION:', res.result.exceptionDetails.exception && res.result.exceptionDetails.exception.description)
  process.exit(1)
}
console.log(JSON.stringify(res.result && res.result.result ? res.result.result.value : res, null, 2))
ws.close()
