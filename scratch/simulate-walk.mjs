// Simulates the adopt probe walk against the REAL scan data (states + latencies)
// to size concurrency / limit / timeout before wiring them into the panel.
import { readFileSync } from 'node:fs'

const scan = JSON.parse(readFileSync('scratch/scan85.json', 'utf8'))
const byModel = Object.fromEntries(scan.map(r => [r.model, r]))
const order = JSON.parse(readFileSync('scratch/catalog-order.json', 'utf8'))

/** Model of the real probe: same verdicts, latency from the scan (timeouts use the configured budget). */
function verdictFor(model, timeoutMs) {
  const r = byModel[model]
  if (!r) return { state: 'missing', ms: 300 }
  if (r.state === 'ok') return { state: 'ok', ms: r.ms }
  if (r.state === 'timeout') return { state: 'timeout', ms: timeoutMs }
  if (r.state === 'no-content') return { state: 'missing', ms: r.ms }
  if (r.state.startsWith('http-')) return { state: Number(r.state.slice(5)) >= 500 ? 'missing' : 'missing', ms: r.ms }
  return { state: 'missing', ms: r.ms }
}

async function simulate({ concurrency, limit, timeoutMs, silentLimit = 3, candidates }) {
  const t0 = Date.now()
  let next = 0
  let tried = 0
  let timeouts = 0
  let fast = 0
  let last = { state: 'missing' }
  let stopped = null

  async function worker() {
    while (!stopped) {
      if (next >= candidates.length || tried >= limit) return
      const model = candidates[next++]
      tried++
      const v = verdictFor(model, timeoutMs)
      await new Promise(res => setTimeout(res, v.ms))
      last = v
      if (v.state === 'ok') { stopped = { model }; return }
      if (v.state === 'timeout') {
        timeouts++
        if (fast === 0 && timeouts >= silentLimit) { stopped = { reason: 'endpoint-silent' }; return }
      } else {
        fast++
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { ...stopped, tried, timeouts, wallMs: Date.now() - t0 }
}

const scenarios = [
  { name: 'NVIDIA c=6 limit=40 timeout=10s', concurrency: 6, limit: 40, timeoutMs: 10000, candidates: order },
  { name: 'NVIDIA c=8 limit=40 timeout=10s', concurrency: 8, limit: 40, timeoutMs: 10000, candidates: order },
  { name: 'NVIDIA c=6 limit=60 timeout=10s', concurrency: 6, limit: 60, timeoutMs: 10000, candidates: order },
  { name: 'NVIDIA c=4 limit=40 timeout=10s', concurrency: 4, limit: 40, timeoutMs: 10000, candidates: order },
  { name: 'AMD-like (all timeout) c=6 limit=40 timeout=10s', concurrency: 6, limit: 40, timeoutMs: 10000, candidates: order }
]

// AMD's endpoint hangs for EVERY model: model that with all-timeout verdicts.
const originalFor = verdictFor
for (const s of scenarios) {
  if (s.name.startsWith('AMD')) {
    // override: every candidate hangs
    const saved = byModel
    // emulate by using a dedicated run below
  }
}

for (const s of scenarios.slice(0, 4)) {
  const r = await simulate(s)
  console.log(`${s.name}\n   -> ${r.model ? 'ADOPT ' + r.model : 'REFUSED (' + r.reason + ')'}  tried=${r.tried} timeouts=${r.timeouts} wall=${r.wallMs}ms`)
}

// AMD: endpoint dead for every model
{
  const t0 = Date.now()
  const concurrency = 6, limit = 40, timeoutMs = 10000, silentLimit = 3
  let next = 0, tried = 0, timeouts = 0, fast = 0, stopped = null
  const cands = order
  async function worker() {
    while (!stopped) {
      if (next >= cands.length || tried >= limit) return
      next++; tried++
      await new Promise(res => setTimeout(res, timeoutMs))
      timeouts++
      if (fast === 0 && timeouts >= silentLimit) { stopped = { reason: 'endpoint-silent' }; return }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  console.log(`AMD-like all-hang c=6 limit=40 timeout=10s\n   -> REFUSED (${stopped?.reason})  tried=${tried} wall=${Date.now() - t0}ms`)
}
