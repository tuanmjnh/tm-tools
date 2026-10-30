/**
 * Screenshot sweep (R150 UI audit) — load each route in the running Electron
 * renderer and save a PNG via Page.captureScreenshot.
 *
 *   node scratch/cdp-shot.mjs <path> <outfile> [extraEvalJsFile]
 */
const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223'
const [, , routeArg, outArg, evalArg] = process.argv
if (!routeArg || !outArg) {
  console.error('usage: node scratch/cdp-shot.mjs "/tmcut" out.png [exprFile]')
  process.exit(2)
}

const list = await (await fetch(`${ENDPOINT}/json/list`)).json()
const target = list.find(t => t.type === 'page' && !t.url.startsWith('devtools://'))
if (!target) throw new Error('no renderer target')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', e => rej(new Error(String(e.message || e)))) })
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg) }
})
function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

await send('Page.enable')
await send('Page.navigate', { url: `http://localhost:4002${routeArg}` })
await sleep(8000)
if (evalArg) {
  const { readFileSync } = await import('node:fs')
  const expr = `(${readFileSync(evalArg, 'utf8').trim()})()`
  await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true })
  await sleep(2500)
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('node:fs')
writeFileSync(outArg, Buffer.from(shot.result.data, 'base64'))
console.log('saved', outArg)
ws.close()
process.exit(0)
