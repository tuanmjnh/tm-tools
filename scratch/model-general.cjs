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
    const ids = (j.data || []).map(m => m.modelId)
    const wanted = ['qwen/qwen3-32b', 'qwen/qwen3-235b-a22b', 'deepseek-ai/deepseek-r1', 'deepseek-ai/deepseek-v3.1',
      'deepseek-ai/deepseek-v3', 'moonshotai/kimi-k2-instruct', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b',
      'ibm/granite-4.0-h-small', 'zai-org/glm-4.6', 'zai-org/glm-4.5', 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
      'mistralai/mistral-nemo', 'nvidia/nemotron-nano-9b-v2', 'ai/mistral-small-3.2-24b-instruct-2506']
    const present = wanted.filter(m => ids.includes(m))

    const api = window.electronAPI.tools.aiGateway
    const probe = async (m) => {
      try {
        const res = await api.complete({ task: 'plan', model: m, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 8 })
        return { model: m, ok: res.ok, ms: res.data && res.data.latencyMs, detail: res.ok ? String(res.data.content).slice(0, 12) : String(res.error).slice(0, 50) }
      } catch (e) { return { model: m, ok: false, detail: String(e.message).slice(0, 50) } }
    }
    const results = []
    for (const m of present) results.push(await probe(m))
    return { listed: ids.length, present, results }
  })
  console.log(JSON.stringify(out, null, 1).slice(0, 2400))
  await b.close()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
