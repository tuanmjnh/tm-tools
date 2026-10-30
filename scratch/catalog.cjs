const { chromium } = require('playwright-core')
;(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
  const out = await page.evaluate(async () => {
    const getCookie = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]
    const token = decodeURIComponent(getCookie('accessToken') || '')
    const base = 'https://tm-hub-app.vercel.app/api/v1/apps/tm-tools_bbx58v/ai'
    const H = { 'X-App-Id': 'tm-tools_bbx58v', Authorization: 'Bearer ' + token }
    const prov = await (await fetch(base + '/providers', { headers: H })).json()
    const items = prov.data || []
    const nv = items.find(i => i.definition?.key === 'nvidia' || i.definition?.name?.toLowerCase().includes('nvidia'))
    const amd = items.find(i => /amd/i.test(i.definition?.key || '') || /amd/i.test(i.definition?.name || ''))
    const conns = []
    for (const it of items) {
      for (const c of it.connections || []) {
        if (c.status === 'connected' && c.hasSecrets && c.isEnabled !== false) {
          conns.push({ provider: it.definition.key, name: it.definition.name, id: c.id, baseUrl: c.baseUrlOverride || it.definition.base_url_default, config: c.config })
        }
      }
    }
    const models = await (await fetch(base + '/models', { headers: H })).json()
    const enabled = (models.data || []).filter(m => m.isEnabled !== false)
    return {
      connected: conns,
      providers: items.map(i => ({ key: i.definition.key, name: i.definition.name, conns: (i.connections || []).length })),
      nvidiaEnabled: enabled.filter(m => m.provider === 'nvidia').map(m => m.modelId),
      amdEnabled: enabled.filter(m => /amd/.test(m.provider)).map(m => m.modelId),
      allProviders: [...new Set(enabled.map(m => m.provider))]
    }
  })
  console.log(JSON.stringify(out, null, 1))
  await b.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
