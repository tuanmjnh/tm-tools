async (page) => {
  await page.setViewportSize({ width: 1600, height: 950 })
  await page.goto('http://localhost:4002/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  const token = await page.evaluate(async () => {
    try {
      const r = await fetch('https://tm-hub-app.vercel.app/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Id': 'tm-tools_bbx58v' },
        body: JSON.stringify({ appId: 'tm-tools_bbx58v', email: 'tools-root@example.com', password: 'b15@bE&B' })
      })
      const j = await r.json()
      return (j && j.data && (j.data.accessToken || j.data.access_token)) || ''
    } catch (e) { return 'FETCH-FAIL ' + String(e).slice(0, 120) }
  })
  if (!token || token.startsWith('FETCH-FAIL')) return { tokenError: token }
  await page.context().addCookies([{ name: 'accessToken', value: token, domain: 'localhost', path: '/' }])
  await page.goto('http://localhost:4002/tmcut/editor', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim().startsWith('AI Script'))
    if (btn) { btn.click(); return true }
    return false
  })
  await page.waitForTimeout(7000)
  const state = await page.evaluate(() => {
    const txt = document.body.innerText
    const pick = (re) => ((txt.match(re) || [''])[0].trim().slice(0, 200))
    return {
      path: location.pathname,
      hasDialog: !!document.querySelector('[role=dialog]'),
      noKeyBadge: /No AI key configured/i.test(txt),
      gatewayOnline: /AI Gateway Online/i.test(txt),
      textAroundModel: pick(/AI[ -]?Model[^\n]*\n?[^\n]*/i),
      errLine: pick(/[^\n]*(rate-limited|relay|unauthorized|failed|exhausted)[^\n]*/i)
    }
  })
  return { tokenLen: token.length, clicked, ...state }
}
