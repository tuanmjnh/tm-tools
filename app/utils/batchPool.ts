export type PoolItemStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'

export interface PoolItem {
  id: string
  status: PoolItemStatus
  retry: number
}

export interface BatchPoolOptions<T extends PoolItem> {
  concurrency: () => number
  pauseMs: () => number
  maxRetry: () => number
  isPaused: () => boolean
  isStopping: () => boolean
  run: (item: T) => Promise<void>
  delay?: (ms: number) => Promise<void>
  tickMs?: number
}

export interface BatchPoolResult {
  done: number
  failed: number
  cancelled: number
}

const realDelay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function runBatchPool<T extends PoolItem>(items: T[], opts: BatchPoolOptions<T>): Promise<BatchPoolResult> {
  const delay = opts.delay ?? realDelay
  const tick = opts.tickMs ?? 200
  let active = 0

  const launch = (item: T) => {
    item.status = 'running'
    active++
    void (async () => {
      try {
        await opts.run(item)
        item.status = 'done'
      } catch {
        if (item.retry < opts.maxRetry()) {
          item.retry++
          item.status = 'waiting'
        } else {
          item.status = 'failed'
        }
      } finally {
        active--
      }
    })()
  }

  const nextWaiting = () => items.find(item => item.status === 'waiting')
  const pending = () => items.some(item => item.status === 'waiting' || item.status === 'running')

  while (pending()) {
    if (opts.isStopping()) {
      for (const item of items) if (item.status === 'waiting') item.status = 'cancelled'
      if (active === 0) break
      await delay(tick)
      continue
    }
    if (opts.isPaused()) {
      await delay(tick)
      continue
    }
    let launched = 0
    while (active < opts.concurrency()) {
      const item = nextWaiting()
      if (!item) break
      launch(item)
      launched++
    }
    await delay(launched > 0 ? opts.pauseMs() : tick)
  }

  return {
    done: items.filter(item => item.status === 'done').length,
    failed: items.filter(item => item.status === 'failed').length,
    cancelled: items.filter(item => item.status === 'cancelled').length
  }
}
