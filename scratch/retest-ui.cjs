const { chromium } = require('playwright-core')
;(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('localhost:4002'))
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message.slice(0, 160))
  )

  // 1) tmcut pages smoke
  for (const r of ['/tmcut', '/tmcut/templates', '/tmcut/autocut', '/tmcut/factory', '/tmcut/editor']) {
    errors.length = 0
    await page.goto('http://localhost:4002' + r + '?dev-bypass=1', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3500)
    const info = await page.evaluate(() => ({
      h: [...document.querySelectorAll('h1,h2')].map(e => e.textContent.trim()).slice(0, 1),
      len: document.body.innerText.length
    }))
    console.log(`ROUTE ${r} -> ${JSON.stringify(info)} errors=${errors.length ? errors.slice(0,2) : 'none'}`)
  }

  // 2) AI script modal + picker + Test
  await page.goto('http://localhost:4002/tmcut/editor?dev-bypass=1', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await page.evaluate(() => document.querySelector('[title^="AI Scriptwriter"]')?.click())
  await page.waitForTimeout(4500)

  const modalInfo = await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    if (!m) return { error: 'modal not found' }
    const s = [...m.querySelectorAll('select')].map(x => ({ disabled: x.disabled, options: [...x.options].map(o => o.textContent.trim()).slice(0, 12) }))
    return {
      connectionFormGone: !/Base URL|API key|AI connection/i.test(m.textContent),
      hasPicker: /Model/i.test(m.textContent),
      select: s,
      note: (m.textContent.match(/Sign in to TM Hub[^A-Z]{0,25}|No connected model[^.]{0,25}|Only models from providers[^.]{0,45}/g) || []).slice(0, 2),
      testBtn: [...m.querySelectorAll('button')].some(x => (x.textContent || '').trim() === 'Test'),
      badge: (m.textContent.match(/[\w ]+ · [\w.\-\/]+/g) || []).slice(0, 2)
    }
  })
  console.log('MODAL:', JSON.stringify(modalInfo, null, 1).slice(0, 1800))

  // Test button with no stored key -> must fail fast & honestly
  const t0 = Date.now()
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    const btn = [...m.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Test')
    if (btn) btn.click()
  })
  await page.waitForTimeout(9000)
  const testMsg = await page.evaluate(() => {
    const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(d => /AI Scriptwriter & Storyboard/.test(d.textContent || ''))
    return (m.textContent.match(/Model OK — [^\s]+ answered in \d+ms|no-key[^A-Z]{0,40}|Missing API key[^.]{0,40}|failed[^\n]{0,50}/g) || []).slice(0, 3)
  })
  console.log(`TEST RESULT (${Date.now() - t0}ms):`, JSON.stringify(testMsg))
  console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none')
  await b.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
