const { chromium } = require('playwright-core')
;(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
  const out = await page.evaluate(async () => {
    // Full NVIDIA list from the hub (session works again)
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
        return { model: m, ok: res.ok, detail: res.ok ? String(res.data.content).slice(0, 20) : String(res.error).slice(0, 70) }
      } catch (e) { return { model: m, ok: false, detail: String(e.message).slice(0, 70) } }
    }
    const working = []
    const failures = {}
    // Probe 24 models with small concurrency
    const batch = ids.slice(0, 24)
    for (let i = 0; i < batch.length; i += 4) {
      const results = await Promise.all(batch.slice(i, i + 4).map(probe))
      for (const x of results) {
        if (x.ok) working.push(x)
        else { const key = x.detail.replace(/\d+/g, '#').slice(0, 50); failures[key] = (failures[key] || 0) + 1 }
      }
      if (working.length >= 3) break
    }
    return { totalListed: ids.length, probed: Math.min(24, ids.length), working, failureShapes: failures }
  })
  console.log(JSON.stringify(out, null, 1).slice(0, 2600))
  await b.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
