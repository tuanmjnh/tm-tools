const { chromium } = require('playwright-core')
;(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
  const out = await page.evaluate(async () => {
    const getCookie = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
    const token = decodeURIComponent(getCookie('accessToken') || '')
    const r = await fetch('https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai/models?provider=nvidia', {
      headers: { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + token }
    })
    const j = await r.json().catch(() => ({}))
    const ids = (j.data || []).filter(m => m.isEnabled !== false).map(m => m.modelId)
    const api = window.electronAPI.tools.aiGateway
    const probe = async (m) => {
      try {
        const res = await api.complete({ task: 'plan', model: m, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 8 })
        return { model: m, ok: res.ok, ms: res.data && res.data.latencyMs, detail: res.ok ? String(res.data.content).slice(0, 12) : String(res.error).slice(0, 55) }
      } catch (e) { return { model: m, ok: false, detail: String(e.message).slice(0, 55) } }
    }
    const working = []
    const batch = ids.slice(24, 52)
    for (let i = 0; i < batch.length; i += 2) {
      const results = await Promise.all(batch.slice(i, i + 2).map(probe))
      for (const x of results) if (x.ok) working.push(x)
      if (working.length >= 4) break
    }
    return { probed: batch.length, working }
  })
  console.log(JSON.stringify(out, null, 1).slice(0, 1800))
  await b.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
