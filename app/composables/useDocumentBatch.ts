import type { MaybeRefOrGetter, Ref } from 'vue'
import type { DocumentArtifactView, DocumentOperationDefinition } from '#shared/types/document'
import type { DocumentErrorPayload } from './useDocumentApi'
import type { PoolItem, PoolItemStatus } from '~/utils/batchPool'
import { runBatchPool } from '~/utils/batchPool'
import { runSingleDocumentJob } from './useDocumentRun'

export type BatchStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'done' | 'partial'

export interface BatchItem extends PoolItem {
  name: string
  size: number
  jobId?: string
  progress: number
  artifacts: DocumentArtifactView[]
  error?: DocumentErrorPayload
}

/** Plain, unwrapped snapshot the operation shell renders as its batch prop. */
export interface BatchViewModel {
  items: BatchItem[]
  status: BatchStatus
  concurrency: number
  pauseMs: number
  maxRetry: number
  concurrencyCap: number
  total: number
  done: number
  overallProgress: number
  failed: number
  waiting: number
  runningCount: number
}

interface BatchRunOptions {
  directUpload?: boolean
  inline?: boolean
}

interface BatchState {
  items: Ref<BatchItem[]>
  concurrency: Ref<number>
  pauseMs: Ref<number>
  maxRetry: Ref<number>
  status: Ref<BatchStatus>
  blobs: Map<string, File>
  keys: Map<string, string>
  controllers: Map<string, AbortController>
  cancelledIds: Set<string>
  poll: ReturnType<typeof setInterval> | null
  config: Record<string, unknown>
  options: BatchRunOptions
}

/** Per-operation state survives navigation so a running batch keeps its progress. */
const states = new Map<string, BatchState>()

export function useDocumentBatch(
  operationId: string,
  definition?: MaybeRefOrGetter<DocumentOperationDefinition | null | undefined>
) {
  const api = useDocumentApi()

  let state = states.get(operationId)
  if (!state) {
    state = {
      items: ref<BatchItem[]>([]),
      concurrency: ref(1),
      pauseMs: ref(300),
      maxRetry: ref(0),
      status: ref<BatchStatus>('idle'),
      blobs: new Map<string, File>(),
      keys: new Map<string, string>(),
      controllers: new Map<string, AbortController>(),
      cancelledIds: new Set<string>(),
      poll: null,
      config: {},
      options: {}
    }
    states.set(operationId, state)
  }
  const s = state

  const concurrencyCap = computed(() => toValue(definition)?.batch?.maxConcurrency ?? 10)

  const total = computed(() => s.items.value.length)
  const done = computed(() => s.items.value.filter(item => item.status === 'done').length)
  const failed = computed(() => s.items.value.filter(item => item.status === 'failed').length)
  const cancelled = computed(() => s.items.value.filter(item => item.status === 'cancelled').length)
  const waiting = computed(() => s.items.value.filter(item => item.status === 'waiting').length)
  const runningCount = computed(() => s.items.value.filter(item => item.status === 'running').length)
  const running = computed(() => s.status.value === 'running' || s.status.value === 'paused' || s.status.value === 'stopping')
  const overallProgress = computed(() => total.value ? Math.round((done.value / total.value) * 100) : 0)
  const artifacts = computed(() => s.items.value.flatMap(item => item.artifacts))

  const viewModel = computed<BatchViewModel>(() => ({
    items: s.items.value,
    status: s.status.value,
    concurrency: s.concurrency.value,
    pauseMs: s.pauseMs.value,
    maxRetry: s.maxRetry.value,
    concurrencyCap: concurrencyCap.value,
    total: total.value,
    done: done.value,
    overallProgress: overallProgress.value,
    failed: failed.value,
    waiting: waiting.value,
    runningCount: runningCount.value
  }))

  function stopPoll() {
    if (s.poll) {
      clearInterval(s.poll)
      s.poll = null
    }
  }

  function startPoll() {
    stopPoll()
    s.poll = setInterval(() => {
      const active = s.items.value.filter(item => item.status === 'running' && item.jobId)
      if (!active.length) return
      void Promise.allSettled(active.map(async (item) => {
        try {
          const view = await api.job(item.jobId!)
          const progress = view.progress
          if (progress.totalUnits > 0) {
            item.progress = Math.round((progress.completedUnits / progress.totalUnits) * 100)
          }
        } catch {
          // Keep the last known progress; a transient poll failure is not a job failure.
        }
      }))
    }, 1000)
  }

  async function runItem(item: BatchItem) {
    const file = s.blobs.get(item.id)
    if (!file) throw { code: 'DOCUMENT_INPUT_REQUIRED' }
    const controller = new AbortController()
    s.controllers.set(item.id, controller)
    item.error = undefined
    item.progress = 0
    // Always assign a fresh idempotency token per attempt to avoid 409 DOCUMENT_JOB_STATE_INVALID
    const key = crypto.randomUUID()
    s.keys.set(item.id, key)
    try {
      const result = await runSingleDocumentJob(api, {
        operationId,
        files: [file],
        config: s.config,
        directUpload: s.options.directUpload,
        inline: s.options.inline,
        idempotencyKey: key,
        signal: controller.signal,
        onJobId: (id) => { item.jobId = id }
      })
      item.artifacts = result.artifacts
      item.progress = 100
    } catch (caught) {
      item.error = caught as DocumentErrorPayload
      throw caught
    } finally {
      s.controllers.delete(item.id)
    }
  }

  function finalize() {
    stopPoll()
    if (s.items.value.length === 0) {
      s.status.value = 'idle'
      return
    }
    for (const item of s.items.value) {
      if (s.cancelledIds.has(item.id) && item.status !== 'done') item.status = 'cancelled'
    }
    const failedCount = s.items.value.filter(item => item.status === 'failed').length
    s.status.value = failedCount > 0 ? 'partial' : 'done'
  }

  function runPool() {
    void runBatchPool(s.items.value, {
      concurrency: () => Math.min(s.concurrency.value, concurrencyCap.value),
      pauseMs: () => s.pauseMs.value,
      maxRetry: () => s.maxRetry.value,
      isPaused: () => s.status.value === 'paused',
      isStopping: () => s.status.value === 'stopping',
      run: item => runItem(item)
    }).then(finalize)
  }

  function start(files: File[], config: Record<string, unknown>, options: BatchRunOptions = {}) {
    if (running.value) return
    s.config = config
    s.options = options
    s.blobs.clear()
    s.keys.clear()
    s.controllers.clear()
    s.cancelledIds.clear()
    s.items.value = files.map((file, index) => ({
      id: `batch-${index}-${file.name}`,
      name: file.name,
      size: file.size,
      status: 'waiting' as PoolItemStatus,
      retry: 0,
      progress: 0,
      artifacts: []
    }))
    s.items.value.forEach((item, index) => {
      s.blobs.set(item.id, files[index]!)
      s.keys.set(item.id, crypto.randomUUID())
    })
    s.status.value = 'running'
    startPoll()
    runPool()
  }

  function pause() {
    if (s.status.value === 'running') s.status.value = 'paused'
  }

  function resume() {
    if (s.status.value === 'paused') s.status.value = 'running'
  }

  async function stop() {
    if (s.status.value !== 'running' && s.status.value !== 'paused') return
    s.status.value = 'stopping'
    for (const [id, controller] of s.controllers) {
      s.cancelledIds.add(id)
      controller.abort()
      const item = s.items.value.find(entry => entry.id === id)
      if (item?.jobId) {
        try {
          await api.cancelJob(item.jobId)
        } catch {
          // Best effort: the client abort already halted the request.
        }
      }
    }
  }

  function retryItem(id: string) {
    const item = s.items.value.find(entry => entry.id === id)
    if (!item || (item.status !== 'failed' && item.status !== 'cancelled')) return
    item.status = 'waiting'
    item.progress = 0
    item.error = undefined
    s.cancelledIds.delete(id)
    s.keys.set(id, crypto.randomUUID())
    if (!running.value) {
      s.status.value = 'running'
      startPoll()
      runPool()
    }
  }

  function retryAllFailed() {
    const failedItems = s.items.value.filter(item => item.status === 'failed' || item.status === 'cancelled')
    if (!failedItems.length) return
    for (const item of failedItems) {
      item.status = 'waiting'
      item.progress = 0
      item.error = undefined
      s.cancelledIds.delete(item.id)
      s.keys.set(item.id, crypto.randomUUID())
    }
    if (!running.value) {
      s.status.value = 'running'
      startPoll()
      runPool()
    }
  }

  function updateConfig(config: Record<string, unknown>) {
    s.config = { ...s.config, ...config }
  }

  function clear() {
    stopPoll()
    for (const [id, controller] of s.controllers) {
      s.cancelledIds.add(id)
      controller.abort()
      const item = s.items.value.find(entry => entry.id === id)
      if (item?.jobId) {
        void api.cancelJob(item.jobId).catch(() => {})
      }
    }
    s.blobs.clear()
    s.keys.clear()
    s.controllers.clear()
    s.cancelledIds.clear()
    s.items.value = []
    s.status.value = 'idle'
  }

  function removeArtifact(artifactId: string) {
    for (const item of s.items.value) {
      item.artifacts = item.artifacts.filter(artifact => artifact.id !== artifactId)
    }
  }

  function setConcurrency(value: number) {
    s.concurrency.value = Math.max(1, Math.min(Math.round(value) || 1, concurrencyCap.value))
  }

  function setPauseMs(value: number) {
    s.pauseMs.value = Math.max(0, Math.round(value) || 0)
  }

  function setMaxRetry(value: number) {
    s.maxRetry.value = Math.max(0, Math.min(Math.round(value) || 0, 5))
  }

  return {
    items: s.items,
    concurrency: s.concurrency,
    pauseMs: s.pauseMs,
    maxRetry: s.maxRetry,
    status: s.status,
    total,
    done,
    failed,
    cancelled,
    waiting,
    runningCount,
    running,
    overallProgress,
    artifacts,
    viewModel,
    concurrencyCap,
    start,
    pause,
    resume,
    stop,
    retryItem,
    retryAllFailed,
    updateConfig,
    clear,
    removeArtifact,
    setConcurrency,
    setPauseMs,
    setMaxRetry
  }
}
