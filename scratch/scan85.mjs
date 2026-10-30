import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
const { key, ids } = await page.evaluate(async () => {
  const gc = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
  const t = decodeURIComponent(gc('accessToken') || '')
  const H = { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + t }
  const kr = await fetch('https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/connections/0b67bf6c-78e9-4dbe-8bf1-1c04c5cd6a64/key', { headers: H })
  const kj = await kr.json().catch(() => ({}))
  const mr = await fetch('https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/models?provider=nvidia', { headers: H })
  const mj = await mr.json().catch(() => ({}))
  return {
    key: kj?.data?.apiKey || '',
    ids: (mj.data || []).filter(m => m.isEnabled !== false).map(m => m.modelId)
  }
})
await b.close()
console.log(`key=${key ? 'yes' : 'no'} ids=${ids.length}`)
if (!key || ids.length === 0) process.exit(2)

const base = 'https://integrate.api.nvidia.com/v1'

async function probe(model, timeoutMs = 12000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 512, stream: false }),
      signal: ac.signal
    })
    const text = await r.text()
    clearTimeout(t)
    let j = null
    try { j = JSON.parse(text) } catch {}
    const ch = j?.choices?.[0]
    const content = ch?.message?.content
    if (r.ok && content) return { model, state: 'ok', ms: Date.now() - t0 }
    if (r.status === 404 || r.status === 410) return { model, state: 'missing', ms: Date.now() - t0 }
    if (r.ok && !content) return { model, state: 'no-content', ms: Date.now() - t0, finish: ch?.finish_reason, rl: (ch?.message?.reasoning_content || '').length }
    return { model, state: `http-${r.status}`, ms: Date.now() - t0, detail: (j?.error?.message || text).slice(0, 60) }
  } catch (e) {
    clearTimeout(t)
    return { model, state: e.name === 'AbortError' ? 'timeout' : 'network', ms: Date.now() - t0, detail: String(e.message).slice(0, 60) }
  }
}

const results = []
let i = 0
const CONC = 6
async function worker() {
  while (i < ids.length) {
    const my = ids[i++]
    const r = await probe(my)
    results.push(r)
    console.log(`${String(results.length).padStart(2)}/${ids.length} ${r.state.padEnd(10)} ${r.ms}ms  ${r.model}`)
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
writeFileSync('scratch/scan85.json', JSON.stringify(results, null, 1))
const by = {}
for (const r of results) by[r.state] = (by[r.state] || 0) + 1
console.log('\nSUMMARY ' + JSON.stringify(by))
console.log('OK: ' + results.filter(r => r.state === 'ok').map(r => `${r.model}(${r.ms}ms)`).join(', '))
console.log('NO-CONTENT: ' + results.filter(r => r.state === 'no-content').map(r => `${r.model}(finish=${r.finish},rl=${r.rl})`).join(', '))
// Where do the working models sit in catalogue order? (drives the probe walk)
const okIdx = results.map((r, idx) => [r.state, idx]).filter(([s]) => s === 'ok').map(([, idx]) => idx)
console.log('ok positions: ' + okIdx.join(', '))
