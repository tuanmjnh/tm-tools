import { chromium } from 'playwright-core'
const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
const { key } = await page.evaluate(async () => {
  const gc = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
  const t = decodeURIComponent(gc('accessToken') || '')
  const r = await fetch('https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/connections/0b67bf6c-78e9-4dbe-8bf1-1c04c5cd6a64/key',
    { headers: { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + t } })
  const j = await r.json().catch(() => ({}))
  return { key: j?.data?.apiKey || '' }
})
await b.close()
const base = 'https://integrate.api.nvidia.com/v1'

async function probe(model, maxTokens, timeoutMs = 35000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: maxTokens, stream: false }),
      signal: ac.signal
    })
    const text = await r.text()
    clearTimeout(t)
    let j = null; try { j = JSON.parse(text) } catch {}
    const ch = j?.choices?.[0]
    return { model, ms: Date.now() - t0, status: r.status, finish: ch?.finish_reason, content: ch?.message?.content ?? null, reasoningLen: (ch?.message?.reasoning_content || '').length, err: j?.error?.message || (r.ok ? null : text.slice(0, 90)) }
  } catch (e) {
    clearTimeout(t)
    return { model, ms: Date.now() - t0, status: 0, finish: null, content: null, reasoningLen: 0, err: e.name === 'AbortError' ? 'TIMEOUT' : String(e.message) }
  }
}

const list = [
  ['z-ai/glm-5.3-flash', 512],
  ['minimaxai/minimax-m3.1-flash', 64],
  ['google/gemma-4-31b-it', 64],
  ['nvidia/nemotron-3.5-lightning-30b-a3b', 64],
  ['mistralai/mistral-large-2-instruct', 64],
  ['deepseek-ai/deepseek-v4.1-flash', 64]
]
for (const [m, mt] of list) {
  const r = await probe(m, mt)
  console.log(`${r.status === 200 && r.content ? 'OK  ' : 'FAIL'} ${String(r.ms).padStart(5)}ms finish=${r.finish} reasonLen=${r.reasoningLen} ${m}`)
  console.log(`      content=${JSON.stringify(r.content).slice(0, 120)}${r.err ? ' err=' + r.err : ''}`)
}
