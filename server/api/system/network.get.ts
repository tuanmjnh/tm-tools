interface NetworkCheck {
  online: boolean
  latencyMs: number
  checkedAt: string
  method: string
}

let lastCheck: NetworkCheck | null = null
let lastCheckedAt = 0
const CACHE_MS = 15000

export default defineEventHandler(async () => {
  const now = Date.now()
  if (lastCheck && now - lastCheckedAt < CACHE_MS) {
    return { success: true, data: lastCheck }
  }

  const endpoints = ['https://1.1.1.1', 'https://www.google.com', 'https://api.github.com']
  let online = false
  let latencyMs = -1

  for (const url of endpoints) {
    const start = Date.now()
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(5000)
      })
      latencyMs = Date.now() - start
      if (res.status < 500) {
        online = true
        break
      }
    } catch {
      // try next endpoint
    }
  }

  lastCheck = { online, latencyMs, checkedAt: new Date().toISOString(), method: 'outbound-fetch' }
  lastCheckedAt = now
  return { success: true, data: lastCheck }
})
