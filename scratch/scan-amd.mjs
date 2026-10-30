import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const AMD_CONN = '057084c5-4940-4871-ab91-61e7b141240a'
const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
const { key, ids } = await page.evaluate(async (connId) => {
  const gc = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
  const t = decodeURIComponent(gc('accessToken') || '')
  const H = { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + t }
  const kr = await fetch(`https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/connections/${connId}/key`, { headers: H })
  const kj = await kr.json().catch(() => ({}))
  const mr = await fetch(`https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/models?connectionId=${connId}`, { headers: H })
  const mj = await mr.json().catch(() => ({}))
  return { key: kj?.data?.apiKey || '', ids: (mj.data || []).filter(m => m.isEnabled !== false).map(m => m.modelId) }
}, AMD_CONN)
await b.close()
console.log(`key=${key ? 'yes' : 'no'} models=${ids.length}: ${ids.join(', ')}`)
if (!key || ids.length === 0) process.exit(2)

const base = 'https://developer.amd.com.cn/radeon/api/v1'
async function probe(model, timeoutMs = 15000) {
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
    if (r.ok && ch?.message?.content) return { model, state: 'ok', ms: Date.now() - t0 }
    if (r.status === 404 || r.status === 410) return { model, state: 'missing', ms: Date.now() - t0 }
    if (r.ok && !ch?.message?.content) return { model, state: 'no-content', ms: Date.now() - t0, finish: ch?.finish_reason, rl: (ch?.message?.reasoning_content || '').length }
    return { model, state: `http-${r.status}`, ms: Date.now() - t0, detail: (j?.error?.message || text).slice(0, 80) }
  } catch (e) {
    clearTimeout(t)
    return { model, state: e.name === 'AbortError' ? 'timeout' : 'network', ms: Date.now() - t0, detail: String(e.message).slice(0, 80) }
  }
}

const results = []
let i = 0
async function worker() {
  while (i < ids.length) {
    const my = ids[i++]
    const r = await probe(my)
    results.push(r)
    console.log(`${r.state.padEnd(10)} ${r.ms}ms  ${r.model}${r.detail ? '  -> ' + r.detail : ''}`)
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
writeFileSync('scratch/scan-amd.json', JSON.stringify(results, null, 1))
const ok = results.filter(r => r.state === 'ok')
console.log(`\nAMD OK: ${ok.length}/${results.length} -> ${ok.map(r => r.model).join(', ') || '(none)'}`)
