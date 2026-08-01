import type { TaskStatus, ToolTask, ToolsNamespace, YoutubeDownloadResponse, FfmpegRenderResponse } from '~/types'

export type ToolKind = 'youtube' | 'ffmpeg'

export interface ToolTaskItem {
  key: number
  task: ToolTask
  status: string
  retry: number
  progress: number
  speed: string
  downloaded: string
  error?: string
}

function getNamespace(kind: ToolKind): ToolsNamespace | undefined {
  return window.electronAPI?.tools[kind]
}

function parsePercent(value: number | undefined): number {
  return typeof value === 'number' && !Number.isNaN(value) ? Math.min(100, Math.max(0, value)) : 0
}

export function useToolTaskManager(kind: ToolKind) {
  const api = getNamespace(kind)
  const isElectron = computed(() => !!window.electronAPI)
  const exeCheck = ref<{ status: boolean, data: unknown } | null>(null)
  const status = ref<TaskStatus | null>(null)
  const tasks = ref<Record<number, ToolTaskItem>>({})
  const allDone = ref(0)
  const logs = ref<string[]>([])

  const processing = computed(() => status.value?.isProcessing ?? false)
  const paused = computed(() => status.value?.isPaused ?? false)
  const total = computed(() => status.value?.total ?? 0)
  const done = computed(() => status.value?.done ?? 0)
  const running = computed(() => status.value?.running ?? 0)
  const globalRetryCount = computed(() => status.value?.globalRetryCount ?? 0)
  const taskList = computed(() => Object.values(tasks.value).sort((a, b) => a.key - b.key))

  function pushLog(msg: string) {
    logs.value.push(msg)
    if (logs.value.length > 200) logs.value.splice(0, logs.value.length - 200)
  }

  async function checkExecutable() {
    if (!api) return null
    exeCheck.value = await api.checkExecutable()
    return exeCheck.value
  }

  async function refreshStatus() {
    if (!api) return
    status.value = await api.getStatus()
  }

  async function initManager(args: { threads?: number, delay?: number, delayUI?: number, maxRetry?: number, timeout?: number } = {}) {
    if (!api) return
    await api.initTaskManager(args)
  }

  async function setTasks(items: ToolTask[]) {
    if (!api) return
    tasks.value = {}
    allDone.value = 0
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue
      tasks.value[i] = { key: i, task: item, status: 'waiting', retry: 0, progress: 0, speed: '0', downloaded: '' }
    }
    await api.setTasks(items)
  }

  async function start() {
    if (!api) return
    await api.startTasks()
  }

  async function pause() {
    if (!api) return
    status.value = await api.pauseTasks()
  }

  async function resume() {
    if (!api) return
    status.value = await api.continueTasks()
  }

  async function stopTask(key: number) {
    if (!api) return
    status.value = await api.stopTask(key)
  }

  async function stopAll() {
    if (!api) return
    status.value = await api.stopTasks()
  }

  function updateTask(key: number, patch: Partial<ToolTaskItem>) {
    if (!tasks.value[key]) return
    tasks.value[key] = { ...tasks.value[key], ...patch }
  }

  function onBeforeRunTask(data: YoutubeDownloadResponse | FfmpegRenderResponse) {
    if (typeof data.taskKey === 'number') {
      updateTask(data.taskKey, { status: 'running', progress: 0, speed: data.speed || '0', downloaded: data.downloaded || '' })
    }
  }

  function onProgress(data: YoutubeDownloadResponse | FfmpegRenderResponse) {
    if (typeof data.taskKey === 'number') {
      const item = tasks.value[data.taskKey]
      if (!item) return
      const done = data.done === true && (data.code === 0 || data.code === undefined)
      const meta = {
        ...item.task.meta,
        fileName: data.fileName ?? item.task.meta?.fileName,
        output: data.output ?? item.task.meta?.output,
        outPath: data.outPath ?? item.task.meta?.outPath
      }
      updateTask(data.taskKey, {
        task: { ...item.task, meta },
        status: done ? 'done' : 'running',
        progress: done ? 100 : parsePercent(data.percent),
        speed: data.speed || '0',
        downloaded: data.downloaded || ''
      })
    }
  }

  function onError(data: YoutubeDownloadResponse | FfmpegRenderResponse) {
    if (typeof data.taskKey === 'number') {
      updateTask(data.taskKey, { status: 'failed', error: data.message })
      pushLog(`Task ${data.taskKey} failed: ${data.message}`)
    }
  }

  function onRetry(data: { taskKey: number, retryCount: number }) {
    updateTask(data.taskKey, { status: 'retrying', retry: data.retryCount })
    pushLog(`Task ${data.taskKey} retrying (${data.retryCount})`)
  }

  function onTimeout(data: { taskKey: number }) {
    updateTask(data.taskKey, { status: 'timeout' })
    pushLog(`Task ${data.taskKey} timed out`)
  }

  function onDone(data: { total: number }) {
    allDone.value = data.total
    refreshStatus()
  }

  function onStopped(data: boolean) {
    if (data) refreshStatus()
  }

  function setupListeners() {
    if (!api) return
    const unsubs: ReturnType<typeof api.onProgressTask>[] = []
    unsubs.push(api.onBeforeRunTask(onBeforeRunTask))
    unsubs.push(api.onProgressTask(onProgress))
    unsubs.push(api.onErrorTask(onError))
    unsubs.push(api.onTaskRetry(onRetry))
    unsubs.push(api.onTaskTimeout(onTimeout))
    unsubs.push(api.onAllTasksDone(onDone))
    unsubs.push(api.onStoppedTask(onStopped))
    unsubs.push(api.onStoppedTasks(onStopped))
    return () => unsubs.forEach(unsub => unsub())
  }

  return {
    api,
    isElectron,
    exeCheck,
    status,
    tasks,
    taskList,
    logs,
    processing,
    paused,
    total,
    done,
    running,
    globalRetryCount,
    allDone,
    checkExecutable,
    refreshStatus,
    initManager,
    setTasks,
    start,
    pause,
    resume,
    stopTask,
    stopAll,
    setupListeners
  }
}
