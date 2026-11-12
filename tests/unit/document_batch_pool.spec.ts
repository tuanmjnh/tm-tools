import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { runBatchPool } = await import('../../app/utils/batchPool')

const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve()
  }
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), status: 'waiting' as const, retry: 0 }))
const base = { pauseMs: () => 0, maxRetry: () => 0, isPaused: () => false, isStopping: () => false, delay: async () => {}, tickMs: 0 }

describe('batch pool scheduling', () => {
  it('never exceeds the concurrency cap', async () => {
    const list = items(6)
    let active = 0, peak = 0
    const gates = new Map<string, () => void>()
    const run = (item: { id: string }) => {
      active++
      peak = Math.max(peak, active)
      return new Promise<void>((resolve) => {
        gates.set(item.id, () => {
          active--
          resolve()
        })
      })
    }
    const p = runBatchPool(list, { ...base, concurrency: () => 2, run })
    await flush()
    assert.equal(peak, 2)
    for (const [, open] of gates) {
      open()
      await flush()
    }
    const res = await p
    assert.equal(res.done, 6)
    assert.ok(peak <= 2)
  })

  it('continues past a failure and reports partial counts', async () => {
    const list = items(3)
    const run = async (item: { id: string }) => {
      if (item.id === '1') throw new Error('boom')
    }
    const res = await runBatchPool(list, { ...base, concurrency: () => 1, run })
    assert.equal(res.done, 2)
    assert.equal(res.failed, 1)
    assert.equal(list[1]!.status, 'failed')
  })

  it('retries a failed item up to maxRetry then succeeds', async () => {
    const list = items(1)
    let attempts = 0
    const run = async () => {
      attempts++
      if (attempts < 2) throw new Error('again')
    }
    const res = await runBatchPool(list, { ...base, concurrency: () => 1, maxRetry: () => 1, run })
    assert.equal(res.done, 1)
    assert.equal(list[0]!.retry, 1)
    assert.equal(attempts, 2)
  })

  it('cancels waiting items when stopping', async () => {
    const list = items(4)
    let stopping = false
    const gates: Array<() => void> = []
    const run = () => new Promise<void>((resolve) => {
      gates.push(() => resolve())
    })
    const p = runBatchPool(list, { ...base, concurrency: () => 1, isStopping: () => stopping, run })
    await flush()
    stopping = true
    await flush()
    for (const open of gates) {
      open()
      await flush()
    }
    const res = await p
    assert.equal(res.cancelled, 3)
    assert.equal(list.filter(i => i.status === 'cancelled').length, 3)
  })

  it('does not launch while paused', async () => {
    const list = items(2)
    let paused = true, launched = 0
    const run = async () => {
      launched++
    }
    const p = runBatchPool(list, { ...base, concurrency: () => 1, isPaused: () => paused, run })
    await flush()
    assert.equal(launched, 0)
    paused = false
    const res = await p
    assert.equal(res.done, 2)
  })
})
