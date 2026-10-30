import { chromium } from 'playwright-core'

const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
const { token, key, baseUrl } = await page.evaluate(async () => {
  const gc = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
  const t = decodeURIComponent(gc('accessToken') || '')
  const H = { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + t }
  const r = await fetch('https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/connections/0b67bf6c-78e9-4dbe-8bf1-1c04c5cd6a64/key', { headers: H })
  const j = await r.json().catch(() => ({}))
  return { token: t, key: j?.data?.apiKey || '', baseUrl: j?.data?.baseUrl || 'https://integrate.api.nvidia.com/v1' }
})
await b.close()
if (!key) { console.log('NO KEY', JSON.stringify(key)); process.exit(1) }

const candidates = [
  'deepseek-ai/deepseek-v4.1-flash',
  'z-ai/glm-5.3-flash',
  'z-ai/glm-5.3',
  'moonshotai/kimi-k2.6',
  'minimaxai/minimax-m3.1-flash',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'google/gemma-4-31b-it',
  'stepfun-ai/step-5-preview',
  'poolside/laguna-xs-2.1',
  'mistralai/mistral-large-2-instruct',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  '01-ai/yi-large'
]

async function probe(model) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 15000)
  const t0 = Date.now()
  try {
    const r = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8, stream: false }),
      signal: ac.signal
    })
    const text = await r.text()
    clearTimeout(t)
    let j = null; try { j = JSON.parse(text) } catch {}
    const content = j?.choices?.[0]?.message?.content
    return { model, ok: r.ok && !!content, ms: Date.now() - t0, status: r.status, detail: (content || j?.error?.message || text).slice(0, 70) }
  } catch (e) {
    clearTimeout(t)
    return { model, ok: false, ms: Date.now() - t0, detail: e.name === 'AbortError' ? 'TIMEOUT 15s' : String(e.message).slice(0, 60) }
  }
}

const results = []
for (let i = 0; i < candidates.length; i += 4) {
  const chunk = await Promise.all(candidates.slice(i, i + 4).map(probe))
  results.push(...chunk)
  for (const r of chunk) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${String(r.ms).padStart(5)}ms  ${r.model}  ->  ${r.detail}`)
}
console.log('\nWORKING:', results.filter(r => r.ok).map(r => r.model).join(', ') || '(none)')
