const { chromium } = require('playwright-core')
;(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
  await page.goto('http://localhost:4002/tmcut/editor?dev-bypass=1', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  await page.evaluate(() => document.querySelector('[title^="AI Scriptwriter"]')?.click())
  await page.waitForTimeout(5000)

  const all = await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    const s = [...m.querySelectorAll('select')].find(x => [...x.options].length > 1)
    const opts = [...s.options].map(o => o.textContent.trim())
    const byProvider = {}
    for (const o of opts) {
      const p = o.split(' — ')[0]
      if (p) byProvider[p] = (byProvider[p] || 0) + 1
    }
    return { total: opts.length, byProvider, nvidia: opts.filter(o => /NVIDIA/i.test(o)).slice(0, 6) }
  })
  console.log('CATALOGUE:', JSON.stringify(all, null, 1))

  const picked = await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    const s = [...m.querySelectorAll('select')].find(x => [...x.options].length > 1)
    const opt = [...s.options].find(o => /NVIDIA NIM — 01-ai\/yi-large/.test(o.textContent)) || [...s.options].find(o => /NVIDIA/i.test(o.textContent))
    if (!opt) return 'no nvidia option'
    s.value = opt.value
    s.dispatchEvent(new Event('change', { bubbles: true }))
    return 'picked: ' + opt.textContent.trim()
  })
  console.log('PICK:', picked)
  await page.waitForTimeout(9000)

  const state = await page.evaluate(async () => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    const tasks = await window.electronAPI.tools.aiGateway.tasks()
    const plan = tasks.data.tasks.plan
    return {
      badge: (m.textContent.match(/[\w ]+ · [\w.\-\/]+/g) || []).slice(0, 2),
      toast: (document.body.innerText.match(/Model applied[^\n]{0,70}|Could not switch[^\n]{0,70}|hub returned no stored key[^\n]{0,40}/gi) || []).slice(0, 2),
      plan: { provider: plan.provider, baseUrl: plan.baseUrl, model: plan.model, customized: plan.customized, configured: plan.configured, hasKey: plan.hasKey }
    }
  })
  console.log('AFTER PICK:', JSON.stringify(state, null, 1).slice(0, 1400))

  // Real completion through the stored NVIDIA key
  const t0 = Date.now()
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    const btn = [...m.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Test')
    if (btn) btn.click()
  })
  await page.waitForTimeout(12000)
  const res = await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    return (m.textContent.match(/Model OK — answered in \d+ms|[^\n]{0,120}(?:no-key|api-error|timeout|Missing|401|403|404)[^\n]{0,80}/g) || []).slice(0, 3)
  })
  console.log(`TEST (${Date.now() - t0}ms):`, JSON.stringify(res))
  await b.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
