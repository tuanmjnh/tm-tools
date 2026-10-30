import { chromium } from 'playwright-core'
const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
const { key, baseUrl } = await page.evaluate(async () => {
  const gc = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
  const t = decodeURIComponent(gc('accessToken') || '')
  const r = await fetch('https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/connections/0b67bf6c-78e9-4dbe-8bf1-1c04c5cd6a64/key',
    { headers: { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + t } })
  const j = await r.json().catch(() => ({}))
  return { key: j?.data?.apiKey || '', baseUrl: 'https://integrate.api.nvidia.com/v1' }
})
await b.close()

async function probe(model, timeoutMs, maxTokens) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const r = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: maxTokens, stream: false }),
      signal: ac.signal
    })
    const text = await r.text()
    clearTimeout(t)
    let j = null; try { j = JSON.parse(text) } catch {}
    return { model, ms: Date.now() - t0, status: r.status, raw: text.slice(0, 500), parsed: j }
  } catch (e) {
    clearTimeout(t)
    return { model, ms: Date.now() - t0, status: 0, raw: e.name === 'AbortError' ? 'TIMEOUT' : String(e.message), parsed: null }
  }
}

for (const [m, to, mt] of [['z-ai/glm-5.3-flash', 30000, 24], ['deepseek-ai/deepseek-v4.1-flash', 40000, 24], ['minimaxai/minimax-m3.1-flash', 30000, 24]]) {
  const r = await probe(m, to, mt)
  const content = r.parsed?.choices?.[0]?.message?.content
  const finish = r.parsed?.choices?.[0]?.finish_reason
  console.log(`--- ${m} | HTTP ${r.status} | ${r.ms}ms | finish=${finish}`)
  console.log('    content:', JSON.stringify(content ?? null).slice(0, 200))
  if (!content) console.log('    body   :', r.raw.slice(0, 300))
}
