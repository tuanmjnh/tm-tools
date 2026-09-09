<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { z } from 'zod'
import type { ToolTask, PlaylistVideo, YoutubeFormat, YoutubeConfig, YoutubeHistory, ToolUpdateInfo, ToolUpdateProgress } from '~/types'
import type { GridColumn } from '~/components/gridList/Index.vue'

const { t } = useI18n()
const toast = useToast()

const { pickFolder } = useFileSystem()

async function pickOutputFolder() {
  const folder = await pickFolder({ title: t('tools.output') })
  if (folder) state.outputPath = folder
}

const taskManager = useToolTaskManager('youtube')

// Unified Form state
const STORAGE_KEY = 'tools:download:settings'
const savedSettings = import.meta.client ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') : {}

const state = reactive({
  downloadMode: (savedSettings.downloadMode || 'single') as 'single' | 'multiple',
  singleUrl: savedSettings.singleUrl || '',
  urlText: savedSettings.urlText || '',
  outputPath: savedSettings.outputPath || '',
  threads: savedSettings.threads || 4,
  selectedFormatId: savedSettings.selectedFormatId || '',
  selectedConfigId: savedSettings.selectedConfigId || '',
  advancedOpen: false,
  fileName: savedSettings.fileName || '%(title)s.%(ext)s',
  restrict: savedSettings.restrict === true,
  overwrite: savedSettings.overwrite !== false,
  encoding: savedSettings.encoding || 'utf-8',
  autoFetchFormat: savedSettings.autoFetchFormat !== false
})

if (import.meta.client) {
  watch(
    () => ({
      downloadMode: state.downloadMode,
      singleUrl: state.singleUrl,
      urlText: state.urlText,
      outputPath: state.outputPath,
      threads: state.threads,
      selectedFormatId: state.selectedFormatId,
      selectedConfigId: state.selectedConfigId,
      fileName: state.fileName,
      restrict: state.restrict,
      overwrite: state.overwrite,
      encoding: state.encoding,
      autoFetchFormat: state.autoFetchFormat
    }),
    (newVal) => {
      // console.log(newVal)
      delete newVal.singleUrl
      delete newVal.urlText
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal))
    },
    { deep: true }
  )
}

// Playlist
const isPlaylist = ref(false)
const playlistVideos = ref<PlaylistVideo[]>([])
const selectedVideos = ref<Set<string>>(new Set())
const loadingPlaylist = ref(false)
const showPlaylistPreview = ref(false)

// Data
const formats = ref<YoutubeFormat[]>([])
const configs = ref<YoutubeConfig[]>([])
const historyState = useCursorPagination<YoutubeHistory>({
  fetch: (cursor, limit) => taskManager.api!.listHistoryCursor({ cursor, limit }),
  limit: 30
})
const { items: history, loading: loadingHistory, refresh: loadHistory, loadMore: loadMoreHistory, hasMore: hasMoreHistory, reset: resetHistory } = historyState
const showHistorySlideover = ref(false)

function statusColor(h: YoutubeHistory): 'success' | 'error' | 'warning' {
  return h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'warning'
}

function formatHistoryFormat(h: YoutubeHistory): string {
  if (h.format_title) return h.format_title
  const f = formats.value.find(f2 => f2.id === h.format_id)
  return f?.title || h.format_id || '-'
}

function formatHistorySize(h: YoutubeHistory): string {
  const f = formats.value.find(f2 => f2.id === h.format_id)
  if (f?.w && f?.h) return `${f.w}×${f.h}`
  if (h.file_size) return formatBytes(h.file_size)
  return '-'
}

const historyColumns = computed<GridColumn[]>(() => [
  { key: 'title', label: t('tools.title') },
  { key: 'url', label: t('tools.url') },
  { key: 'format', label: t('tools.format') },
  { key: 'size', label: t('tools.size') },
  { key: 'status', label: t('tools.status') }
  // { key: 'actions', label: '#' }
])
const exeState = ref<'unknown' | 'ok' | 'missing'>('unknown')
const showVersionSlideover = ref(false)
const ytdlpVersion = ref('')
const loadingVersion = ref(false)

// Dynamic single video URL & formats
const fetchingFormats = ref(false)
const dynamicFormats = ref<YoutubeFormat[]>([])
const singleVideoTitle = ref('')
const singleVideoDuration = ref(0)

const activeFormats = computed(() => {
  if (state.downloadMode === 'single' && dynamicFormats.value.length > 0) {
    return dynamicFormats.value
  }
  return formats.value
})

const schema = computed(() => {
  return z.object({
    downloadMode: z.enum(['single', 'multiple']),
    singleUrl: z.string().superRefine((val, ctx) => {
      if (state.downloadMode === 'single' && !val.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('tools.pleaseEnterUrl')
        })
      }
    }),
    urlText: z.string().superRefine((val, ctx) => {
      if (state.downloadMode === 'multiple' && !val.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('tools.pleaseEnterUrl')
        })
      }
    }),
    outputPath: z.string().min(1, t('tools.outputFolderRequired')),
    threads: z.number().min(1).max(8),
    selectedFormatId: z.string().min(1, t('tools.selectFormat'))
  })
})

watch(activeFormats, (newVal) => {
  if (newVal.length > 0) {
    if (!state.selectedFormatId || !newVal.some(f => f.id === state.selectedFormatId)) {
      state.selectedFormatId = newVal[0]?.id || ''
    }
  }
})

let fetchTimeout: NodeJS.Timeout | null = null
watch(() => state.singleUrl, (newUrl) => {
  if (fetchTimeout) clearTimeout(fetchTimeout)
  const url = newUrl.trim()
  if (state.autoFetchFormat && url.startsWith('http') && url.length > 10) {
    fetchTimeout = setTimeout(() => {
      fetchDynamicFormats()
    }, 800)
  }
})

watch(() => state.autoFetchFormat, (val) => {
  if (!val) {
    dynamicFormats.value = []
    state.selectedFormatId = formats.value[0]?.id || ''
  }
})

function applyConfig(cfg: YoutubeConfig | undefined) {
  if (!cfg) return
  state.outputPath = cfg.out_path
  state.threads = cfg.threads
  state.selectedFormatId = cfg.format_id
  state.fileName = cfg.file_name || '%(title)s.%(ext)s'
  state.restrict = cfg.restrict === 1
  state.overwrite = cfg.overwrite === undefined ? true : cfg.overwrite === 1
  state.encoding = cfg.encoding || 'utf-8'
}

watch(() => state.selectedConfigId, (newId) => {
  if (newId) {
    applyConfig(configs.value.find(c => c.id === newId))
  }
})

// Config slideover
const showConfigSlideover = ref(false)
const editingConfig = ref<YoutubeConfig | null>(null)
const savingConfig = ref(false)

// Confirm modals
const showClearHistoryModal = ref(false)
const clearingHistory = ref(false)
const showDeleteConfigModal = ref(false)
const deleteConfigTarget = ref<YoutubeConfig | null>(null)
const deletingConfig = ref(false)

// Computed
const isProcessing = computed(() => taskManager.processing.value)
const isPaused = computed(() => taskManager.paused.value)
const controlsDisabled = computed(() => exeState.value === 'missing' || isProcessing.value || isPaused.value)

async function refreshExe() {
  const rs = await taskManager.checkExecutable()
  exeState.value = rs?.status ? 'ok' : rs ? 'missing' : 'unknown'
}

async function loadFormats() {
  formats.value = await taskManager.api!.listFormats?.() || []
  if (formats.value.length && !state.selectedFormatId) {
    state.selectedFormatId = formats.value[0]?.id || ''
  }
}

async function loadConfigs() {
  configs.value = await taskManager.api!.listConfigs?.() || []
  if (configs.value.length && !state.selectedConfigId) {
    state.selectedConfigId = configs.value[0]?.id || ''
  }
  applyConfig(configs.value.find(c => c.id === state.selectedConfigId))
}

// History selection state
const selectedHistory = ref<YoutubeHistory[]>([])

function isHistorySelected(item: YoutubeHistory): boolean {
  return selectedHistory.value.some(i => i.id === item.id)
}

function toggleHistorySelect(item: YoutubeHistory, val: boolean | 'indeterminate') {
  if (val === true) {
    if (!isHistorySelected(item)) {
      selectedHistory.value = [...selectedHistory.value, item]
    }
  } else {
    selectedHistory.value = selectedHistory.value.filter(i => i.id !== item.id)
  }
}

function toggleSelectAllHistory() {
  if (selectedHistory.value.length === history.value.length) {
    selectedHistory.value = []
  } else {
    selectedHistory.value = [...history.value]
  }
}

// History deletion state
const showDeleteHistoryConfirm = ref(false)
const deleteHistoryTargets = ref<YoutubeHistory[]>([])
const deletingHistory = ref(false)

const confirmHistoryTitle = computed(() => {
  return deleteHistoryTargets.value.length > 1
    ? t('tools.confirmBatchDeleteHistoryTitle')
    : t('tools.confirmDeleteHistoryTitle')
})

const confirmHistoryDesc = computed(() => {
  return deleteHistoryTargets.value.length > 1
    ? t('tools.confirmBatchDeleteHistoryDesc', { count: deleteHistoryTargets.value.length })
    : t('tools.confirmDeleteHistoryDesc')
})

function confirmDeleteHistory(item: YoutubeHistory) {
  deleteHistoryTargets.value = [item]
  showDeleteHistoryConfirm.value = true
}

function confirmBatchDeleteHistory() {
  if (!selectedHistory.value.length) return
  deleteHistoryTargets.value = [...selectedHistory.value]
  showDeleteHistoryConfirm.value = true
}

async function doDeleteHistory() {
  if (!deleteHistoryTargets.value.length) return
  deletingHistory.value = true
  try {
    const ids = deleteHistoryTargets.value.map(i => i.id)
    const rs = await taskManager.api!.deleteHistory(ids)
    if (rs && rs.status) {
      toast.add({ title: t('global.success'), description: t('tools.historyDeleted'), color: 'success' })
      selectedHistory.value = selectedHistory.value.filter(s => !ids.includes(s.id))
      resetHistory()
      await loadHistory()
    } else {
      toast.add({ title: t('global.error'), description: t('tools.deleteHistoryFailed'), color: 'error' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: msg, color: 'error' })
  } finally {
    deletingHistory.value = false
    showDeleteHistoryConfirm.value = false
    deleteHistoryTargets.value = []
  }
}

async function openHistory() {
  showHistorySlideover.value = true
  selectedHistory.value = []
  resetHistory()
  await loadHistory()
}

async function clearAllHistory() {
  clearingHistory.value = true
  try {
    const rs = await taskManager.api!.deleteHistory()
    if (rs && rs.status) {
      toast.add({ title: t('global.success'), description: t('tools.historyCleared'), color: 'success' })
      selectedHistory.value = []
      resetHistory()
      await loadHistory()
    } else {
      toast.add({ title: t('global.error'), description: t('tools.clearHistoryFailed'), color: 'error' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: msg, color: 'error' })
  } finally {
    clearingHistory.value = false
    showClearHistoryModal.value = false
  }
}

async function fetchVersion() {
  loadingVersion.value = true
  try {
    const rs = await taskManager.api!.getVersion()
    if (rs && rs.status && rs.data) {
      ytdlpVersion.value = rs.data
    } else {
      ytdlpVersion.value = rs?.message || 'Failed to get version'
    }
  } catch (err) {
    ytdlpVersion.value = err instanceof Error ? err.message : String(err)
  } finally {
    loadingVersion.value = false
  }
}

const checkingUpdate = ref(false)
const updating = ref(false)
const updateInfo = ref<ToolUpdateInfo | null>(null)
const cleanTemp = ref(true)
const updateProgress = ref<ToolUpdateProgress>({ percent: 0, message: '', stage: undefined })
const updateProgressMsg = ref('')

async function checkUpdate() {
  if (checkingUpdate.value || updating.value || !taskManager.api?.checkUpdate) return
  checkingUpdate.value = true
  updateInfo.value = null
  try {
    const rs = await taskManager.api.checkUpdate()
    if (rs && rs.status && rs.data) {
      updateInfo.value = rs.data
      if (!rs.data.hasUpdate) {
        toast.add({ title: t('tools.upToDate'), color: 'success' })
      }
    } else {
      toast.add({ title: rs?.message || t('tools.updateFailed'), color: 'error' })
    }
  } catch (err: unknown) {
    toast.add({ title: err instanceof Error ? err.message : String(err), color: 'error' })
  } finally {
    checkingUpdate.value = false
  }
}

async function performUpdate() {
  if (updating.value || !taskManager.api?.performUpdate) return
  updating.value = true
  updateProgress.value = { stage: 'downloading', percent: 0, message: t('tools.startingUpdate') }
  updateProgressMsg.value = t('tools.startingUpdate')
  try {
    const rs = await taskManager.api.performUpdate({
      cleanTemp: cleanTemp.value,
      downloadUrl: updateInfo.value?.downloadUrl
    })
    if (rs && rs.status) {
      toast.add({ title: t('tools.updateSuccess'), color: 'success' })
      updateInfo.value = null
      await fetchVersion()
      await checkUpdate()
    } else {
      toast.add({ title: rs?.message || t('tools.updateFailed'), color: 'error' })
    }
  } catch (err: unknown) {
    toast.add({ title: err instanceof Error ? err.message : String(err), color: 'error' })
  } finally {
    updating.value = false
    updateProgressMsg.value = ''
  }
}

async function openVersionInfo() {
  showVersionSlideover.value = true
  if (updating.value) return
  updateInfo.value = null
  await fetchVersion()
}

onMounted(() => {
  if (taskManager.api?.onUpdateProgress) {
    taskManager.api.onUpdateProgress((p) => {
      updateProgress.value = p
      if (p.message) updateProgressMsg.value = p.message
    })
  }
})

const electronPlatform = computed(() => window.electronAPI?.platform || 'Desktop')
const electronVersions = computed(() => window.electronAPI?.versions || { node: '', chrome: '', electron: '' })

function openFolder(path: string | null) {
  if (window.electronAPI?.openPath && path) {
    let normalizedPath = path
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    // console.log(`[FE:openFolder] sending=${JSON.stringify(normalizedPath)}`)
    window.electronAPI.openPath(normalizedPath).then(() => {
      // console.log(`[FE:openFolder] result=ok`)
    }).catch((e: unknown) => console.log('[FE:openFolder] rejected:', e))
  }
}

function openFile(folder: string | null, fileName: string | null) {
  if (window.electronAPI?.openPath && folder && fileName) {
    let fullPath = `${folder}/${fileName}`.replace(/\/+/g, '/')
    if (window.electronAPI.platform === 'win32') {
      fullPath = fullPath.replace(/\//g, '\\')
    }
    // console.log(`[2]openFile folder=${JSON.stringify(folder)} fileName=${JSON.stringify(fileName)} full=${JSON.stringify(fullPath)}`)
    window.electronAPI.openPath(fullPath).then(() => {
      // console.log(`[2]openFile result=ok`)
    }).catch((e: unknown) => console.log('[2]openFile rejected:', e))
  }
}

function showInFolder(fullPath: string) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    let normalizedPath = fullPath
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    // console.log(`[2]showInFolder path=${JSON.stringify(normalizedPath)}`)
    window.electronAPI.showItemInFolder(normalizedPath).then(() => {
      // console.log(`[2]showInFolder result=ok`)
    }).catch((e: unknown) => console.log('[2]showInFolder rejected:', e))
  }
}

function openFileFullPath(fullPath: string) {
  if (window.electronAPI?.openPath && fullPath) {
    let normalizedPath = fullPath
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    // console.log(`[2]openFileFullPath path=${JSON.stringify(normalizedPath)}`)
    window.electronAPI.openPath(normalizedPath).then(() => {
      // console.log(`[2]openFileFullPath result=ok`)
    }).catch((e: unknown) => console.log('[2]openFileFullPath rejected:', e))
  }
}

async function fetchDynamicFormats() {
  const url = state.singleUrl.trim()
  if (!url) {
    toast.add({ title: t('global.error'), description: t('tools.pleaseEnterUrl'), color: 'error' })
    return
  }
  fetchingFormats.value = true
  try {
    const rs = await taskManager.api!.getFormats?.(url)
    if (rs && rs.status && rs.data) {
      dynamicFormats.value = rs.data.formats
      singleVideoTitle.value = rs.data.title || ''
      singleVideoDuration.value = rs.data.duration || 0
      toast.add({ title: t('global.success'), description: t('tools.formatsFetched'), color: 'success' })
    } else {
      toast.add({ title: t('global.error'), description: rs?.message || t('tools.fetchFormatsFailed'), color: 'error' })
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('global.error'), description: errorMsg || t('tools.fetchFormatsFailed'), color: 'error' })
  } finally {
    fetchingFormats.value = false
  }
}

async function detectPlaylist() {
  const urls = state.urlText.trim().split('\n').filter(Boolean)
  isPlaylist.value = urls.some((u: string) => u.includes('playlist') || u.includes('channel') || u.includes('@'))
}

async function crawlPlaylist() {
  const urls = state.urlText.trim().split('\n').filter(Boolean)
  if (!urls.length) return
  loadingPlaylist.value = true
  try {
    const firstUrl = urls[0]
    if (!firstUrl) return
    const rs = await taskManager.api!.crawlPlaylist?.(firstUrl)
    if (rs?.status && rs.data) {
      playlistVideos.value = rs.data
      selectedVideos.value = new Set(rs.data.map(v => v.id))
      showPlaylistPreview.value = true
      toast.add({ title: t('tools.playlistLoaded', { count: rs.data.length }), color: 'success' })
    } else {
      toast.add({ title: rs?.message || t('tools.playlistLoadFailed'), color: 'error' })
    }
  } finally {
    loadingPlaylist.value = false
  }
}

function toggleSelectAll() {
  if (selectedVideos.value.size === playlistVideos.value.length) {
    selectedVideos.value.clear()
  } else {
    selectedVideos.value = new Set(playlistVideos.value.map(v => v.id))
  }
}

function getFormatArgs(): string[] {
  const fmt = activeFormats.value.find(f => f.id === state.selectedFormatId)
  if (fmt) {
    try {
      const opt = typeof fmt.opt === 'string' ? JSON.parse(fmt.opt) : fmt.opt
      if (Array.isArray(opt)) return opt
    } catch {
      // ignore
    }
  }
  return ['-f', 'bestvideo+bestaudio/best', '--newline', '--no-progress', '--console-title']
}

function getTasks(): ToolTask[] {
  let urls: string[] = []
  if (state.downloadMode === 'single') {
    const url = state.singleUrl.trim()
    if (url) urls.push(url)
  } else if (showPlaylistPreview.value && selectedVideos.value.size > 0) {
    urls = playlistVideos.value.filter(v => selectedVideos.value.has(v.id)).map(v => v.url)
  } else {
    urls = state.urlText.split('\n').map((u: string) => u.trim()).filter(Boolean)
  }

  const cfg = configs.value.find(c => c.id === state.selectedConfigId)
  const outPath = state.outputPath || cfg?.out_path || ''
  const fileName = state.fileName || cfg?.file_name || '%(title)s.%(ext)s'

  const extraArgs: string[] = []
  if (state.restrict) {
    extraArgs.push('--restrict-filenames')
  }
  if (!state.overwrite) {
    extraArgs.push('--no-overwrites')
  }
  if (state.encoding) {
    extraArgs.push('--encoding', state.encoding)
  }

  return urls.map((url, i) => ({
    args: [...getFormatArgs(), ...extraArgs, url],
    options: {},
    meta: {
      taskId: `yt-${Date.now()}-${i}`,
      input: url,
      output: '',
      outPath,
      fileName,
      title: state.downloadMode === 'single' ? singleVideoTitle.value : '',
      duration: state.downloadMode === 'single' ? singleVideoDuration.value : 0,
      formatId: state.selectedFormatId,
      formatTitle: activeFormats.value.find(f => f.id === state.selectedFormatId)?.title ?? '',
      configId: state.selectedConfigId,
      configTitle: configs.value.find(c => c.id === state.selectedConfigId)?.title ?? '',
      threads: state.threads,
      startedAt: new Date().toISOString()
    }
  }))
}

async function onSubmit() {
  if (exeState.value === 'missing') {
    toast.add({ title: t('tools.executableMissing'), color: 'error' })
    return
  }
  if (isProcessing.value || isPaused.value) return

  const tasks = getTasks()
  if (!tasks.length) {
    toast.add({ title: t('tools.noUrls'), color: 'error' })
    return
  }
  await taskManager.initManager({ threads: state.threads, maxRetry: 3, timeout: 10 * 60 * 1000, delayUI: 500 })
  await taskManager.setTasks(tasks)
  await taskManager.start()
  await taskManager.refreshStatus()
}

async function saveConfig(data: Partial<YoutubeConfig>) {
  savingConfig.value = true
  try {
    const rs = await taskManager.api!.createConfig?.({ ...data, flag: 1 })
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      await loadConfigs()
      state.selectedConfigId = rs.data?.id ?? (configs.value[0]?.id || '')
    } else {
      toast.add({ title: t('tools.configSaveFailed'), color: 'error' })
    }
  } finally {
    savingConfig.value = false
    showConfigSlideover.value = false
  }
}

async function updateConfig(data: Partial<YoutubeConfig>) {
  if (!editingConfig.value?.id) return
  savingConfig.value = true
  try {
    const rs = await taskManager.api!.updateConfig?.({ id: editingConfig.value.id, data })
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      const currentId = state.selectedConfigId
      state.selectedConfigId = ''
      await loadConfigs()
      nextTick(() => {
        state.selectedConfigId = currentId
      })
    } else {
      toast.add({ title: t('tools.configSaveFailed'), color: 'error' })
    }
  } finally {
    savingConfig.value = false
    showConfigSlideover.value = false
  }
}

function openCreateConfig() {
  editingConfig.value = null
  showConfigSlideover.value = true
}

function openEditConfig(cfg: YoutubeConfig) {
  editingConfig.value = cfg
  showConfigSlideover.value = true
}

function onSaveConfig(data: Partial<YoutubeConfig>) {
  if (editingConfig.value?.id) updateConfig(data)
  else saveConfig(data)
}

function onEditSelectedConfig() {
  const cfg = configs.value.find(c => c.id === state.selectedConfigId)
  if (cfg) openEditConfig(cfg)
}

function onDeleteSelectedConfig() {
  const cfg = configs.value.find(c => c.id === state.selectedConfigId)
  if (cfg) openDeleteConfig(cfg)
}

function openDeleteConfig(cfg: YoutubeConfig) {
  deleteConfigTarget.value = cfg
  showDeleteConfigModal.value = true
}

async function doDeleteConfig() {
  if (!deleteConfigTarget.value) return
  const id = deleteConfigTarget.value.id
  deletingConfig.value = true
  try {
    const rs = await taskManager.api!.deleteConfig?.(id)
    if (rs?.status) {
      toast.add({ title: t('tools.configDeleted'), color: 'success' })
      await loadConfigs()
      if (state.selectedConfigId === id) state.selectedConfigId = configs.value[0]?.id || ''
    }
  } finally {
    deletingConfig.value = false
    showDeleteConfigModal.value = false
    deleteConfigTarget.value = null
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDuration(sec: number | null): string {
  if (!sec) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`
}

onMounted(async () => {
  await refreshExe()
  await taskManager.refreshStatus()
  await loadFormats()
  await loadConfigs()
  taskManager.setupListeners()
})

watch(() => state.urlText, detectPlaylist, { deep: true })
</script>

<template>
  <BasePage id="tools-download" :title="t('nav.download')">
    <UForm id="download-form" :schema="schema" :state="state"
      class="flex flex-col flex-1 min-h-0 p-4 overflow-hidden gap-4 h-full" @submit="onSubmit">
      <!-- Alerts -->
      <div v-if="exeState === 'missing' || !taskManager.isElectron.value" class="space-y-2 shrink-0">
        <UAlert v-if="exeState === 'missing'" icon="i-lucide-alert-triangle" color="error" variant="subtle">
          <template #title>
            {{ t('tools.executableMissing') }}
          </template>
          <template #description>
            <div class="mt-2">
              <UButton size="xs" color="error" variant="soft" to="/system/config?tab=tools">
                {{ t('nav.goTo') }} {{ t('nav.config') }}
              </UButton>
            </div>
          </template>
        </UAlert>
        <UAlert v-if="!taskManager.isElectron.value" icon="i-lucide-monitor" color="warning" variant="subtle"
          :title="t('tools.noElectron')" />
      </div>

      <!-- Two-Column Responsive Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden w-full">
        <!-- Left Column: Source URL Input, Tasks & History -->
        <div class="lg:col-span-2 lg:h-full lg:min-h-0 flex flex-col">
          <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
            <div class="space-y-6">
              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-list-todo" class="text-primary size-5" />
                      <p class="font-semibold">
                        {{ t('tools.downloadForm') }}
                      </p>
                    </div>
                    <div class="flex gap-1">
                      <UButton icon="i-lucide-info" color="info" variant="ghost" size="sm"
                        :title="t('tools.versionInfo')" @click="openVersionInfo" />
                      <UButton icon="i-lucide-history" color="warning" variant="ghost" size="sm"
                        :title="t('tools.history')" @click="openHistory" />
                    </div>
                  </div>
                </template>

                <!-- URL Input Area -->
                <div class="mb-4 space-y-4 border-b pb-4 border-gray-100 dark:border-gray-800">
                  <UFormField name="downloadMode" :label="t('tools.downloadMode')">
                    <URadioGroup v-model="state.downloadMode" :items="[
                      { label: t('tools.singleVideo'), value: 'single' },
                      { label: t('tools.multipleVideos'), value: 'multiple' }
                    ]" class="flex gap-4" :disabled="controlsDisabled" />
                  </UFormField>

                  <div v-if="state.downloadMode === 'single'">
                    <UFormField name="singleUrl" :label="t('tools.url')">
                      <div class="flex gap-2 w-full">
                        <UInput v-model="state.singleUrl" placeholder="https://www.youtube.com/watch?v=..."
                          class="flex-1" :loading="fetchingFormats" :disabled="controlsDisabled || fetchingFormats" />
                      </div>
                    </UFormField>
                  </div>

                  <div v-else>
                    <UFormField name="urlText" :label="t('tools.urls')">
                      <UTextarea v-model="state.urlText" :rows="4" class="w-full"
                        placeholder="https://www.youtube.com/watch?v=...&#10;https://www.youtube.com/playlist?list=..."
                        :disabled="controlsDisabled" />
                      <template #hint>
                        <div class="flex items-center gap-2 text-xs text-muted">
                          <span v-if="isPlaylist" class="text-primary font-medium">{{ t('tools.playlistDetected')
                            }}</span>
                          <UButton v-if="isPlaylist && !loadingPlaylist" size="xs" variant="soft"
                            :loading="loadingPlaylist" :disabled="controlsDisabled" @click="crawlPlaylist">
                            {{ t('tools.getPlaylistInfo') }}
                          </UButton>
                        </div>
                      </template>
                    </UFormField>
                  </div>
                </div>

                <!-- Playlist Preview -->
                <div v-if="showPlaylistPreview && playlistVideos.length" class="mb-4 p-4 border rounded-lg bg-muted/50">
                  <div class="flex items-center justify-between mb-2">
                    <p class="font-medium">
                      {{ t('tools.playlistPreview', { count: playlistVideos.length }) }}
                    </p>
                    <div class="flex gap-2">
                      <UButton size="xs" variant="ghost" @click="toggleSelectAll">
                        {{ selectedVideos.size === playlistVideos.length ? t('tools.deselectAll') : t('tools.selectAll')
                        }}
                      </UButton>
                      <UButton size="xs" variant="ghost" @click="showPlaylistPreview = false">
                        {{ t('tools.hidePreview') }}
                      </UButton>
                    </div>
                  </div>
                  <div class="max-h-64 overflow-y-auto space-y-1">
                    <div v-for="video in playlistVideos" :key="video.id"
                      class="flex items-center gap-2 p-1 hover:bg-muted/50 rounded">
                      <UCheckbox v-model="selectedVideos" :value="video.id" />
                      <div class="flex-1 min-w-0">
                        <p class="text-sm truncate font-medium">
                          {{ video.title }}
                        </p>
                        <p class="text-xs text-muted">
                          {{ formatDuration(video.duration) }} · {{ video.uploader }} · {{
                            video.viewCount.toLocaleString() }} views
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </UCard>

              <!-- Task Manager Panel -->
              <ToolsTaskManagerPanel v-if="taskManager.taskList.value.length" :items="taskManager.taskList.value"
                :total="taskManager.total.value" :done="taskManager.done.value" :running="taskManager.running.value"
                :processing="taskManager.processing.value" :paused="taskManager.paused.value"
                :retries="taskManager.globalRetryCount.value" :can-start="true" @start="onSubmit"
                @refresh="taskManager.refreshStatus()" @pause="taskManager.pause()" @resume="taskManager.resume()"
                @stop-all="taskManager.stopAll()" @stop-task="(key) => taskManager.stopTask(key)"
                @open-item="showInFolder" @open-file="openFileFullPath" />
            </div>
          </UScrollArea>
        </div>

        <!-- Right Column: Settings & Configuration Presets -->
        <div class="lg:h-full lg:min-h-0 flex flex-col">
          <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
            <div class="space-y-6">
              <!-- Download Settings Card -->
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-settings" class="text-primary size-5" />
                    <p class="font-semibold">
                      {{ t('nav.settings') }}
                    </p>
                  </div>
                </template>

                <div class="space-y-4">
                  <!-- Preset Select Settings -->
                  <UFormField name="selectedConfigId" :label="t('tools.configPreset')">
                    <div class="flex gap-2 w-full">
                      <USelectMenu v-model="state.selectedConfigId" clear
                        :items="configs.map(c => ({ label: c.title, value: c.id }))"
                        :placeholder="t('tools.selectPreset')" :search-input="{ placeholder: t('global.search') }"
                        value-key="value" class="flex-1" :disabled="controlsDisabled">
                        <template #empty>
                          {{ t('tools.noPresets') }}
                        </template>
                      </USelectMenu>
                      <UButton v-if="state.selectedConfigId" icon="i-lucide-pencil" size="md" color="info"
                        variant="soft" :disabled="controlsDisabled || fetchingFormats" :title="t('global.edit')"
                        @click="onEditSelectedConfig" />
                      <UButton v-if="state.selectedConfigId" icon="i-lucide-trash-2" size="md" color="error"
                        variant="soft" :disabled="controlsDisabled || fetchingFormats" :title="t('global.delete')"
                        @click="onDeleteSelectedConfig" />
                      <UButton icon="i-lucide-plus" variant="soft" size="md"
                        :disabled="controlsDisabled || fetchingFormats" :title="t('global.create')"
                        @click="openCreateConfig" />
                    </div>
                  </UFormField>

                  <!-- Output Folder Settings -->
                  <UFormField name="outputPath" :label="t('tools.output')">
                    <UInput v-model="state.outputPath" placeholder="D:/Downloads/YouTube"
                      :ui="{ base: 'pr-16.5', trailing: 'pe-0.5' }" class="w-full" :disabled="controlsDisabled">
                      <template #trailing>
                        <div class="flex items-center gap-1">
                          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-external-link"
                            :title="t('tools.openFolder')" :aria-label="t('tools.openFolder')"
                            :disabled="!state.outputPath || !taskManager.isElectron.value"
                            @click="openFolder(state.outputPath)" />
                          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-folder-open"
                            :title="t('tools.browse')" :aria-label="t('tools.browse')"
                            :disabled="!taskManager.isElectron.value || controlsDisabled" @click="pickOutputFolder" />
                        </div>
                      </template>
                    </UInput>
                  </UFormField>

                  <!-- Threads Settings (multiple mode only) -->
                  <UFormField v-if="state.downloadMode === 'multiple'" name="threads" :label="t('tools.threads')">
                    <UInput v-model.number="state.threads" type="number" min="1" max="8" class="w-full"
                      :disabled="controlsDisabled" />
                  </UFormField>

                  <!-- Format Settings -->
                  <UFormField name="selectedFormatId" :label="t('tools.format')">
                    <USelectMenu v-model="state.selectedFormatId"
                      :items="activeFormats.map(f => ({ label: f.title, value: f.id }))"
                      :placeholder="t('tools.selectFormat')" :search-input="{ placeholder: t('global.search') }"
                      value-key="value" class="w-full" :disabled="controlsDisabled || fetchingFormats"
                      :loading="fetchingFormats">
                      <template #empty>
                        {{ t('tools.noFormats') }}
                      </template>
                    </USelectMenu>
                  </UFormField>

                  <UCheckbox v-if="state.downloadMode === 'single'" v-model="state.autoFetchFormat"
                    :label="t('tools.autoFetchFormat')" :disabled="controlsDisabled" />

                  <!-- Advanced Settings -->
                  <UCollapsible v-model:open="state.advancedOpen">
                    <UButton block :trailing-icon="state.advancedOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      color="neutral" variant="ghost" size="sm" :label="t('tools.advanced')" />
                    <template #content>
                      <div class="mt-3 space-y-4">
                        <UFormField name="fileName" :label="t('tools.fileName')">
                          <UInput v-model="state.fileName" placeholder="%(title)s.%(ext)s" class="w-full"
                            :disabled="controlsDisabled" />
                        </UFormField>

                        <div class="space-y-3">
                          <UCheckbox v-model="state.restrict" :label="t('tools.restrictNames')"
                            :disabled="controlsDisabled" />
                          <UCheckbox v-model="state.overwrite" :label="t('tools.overwriteFiles')"
                            :disabled="controlsDisabled" />
                        </div>

                        <UFormField name="encoding" :label="t('tools.encoding')">
                          <USelectMenu v-model="state.encoding" :items="['utf-8', 'ascii', 'latin-1']"
                            :placeholder="t('tools.encoding')" :search-input="{ placeholder: t('global.search') }"
                            class="w-full" :disabled="controlsDisabled" />
                        </UFormField>
                      </div>
                    </template>
                  </UCollapsible>
                </div>

                <template #footer>
                  <div class="flex justify-end gap-2 w-full">
                    <!-- <UButton v-if="isProcessing && !isPaused" icon="i-lucide-pause" :label="t('tools.pause')"
                    color="warning" variant="subtle" @click="taskManager.pause()" />
                  <UButton v-if="isPaused" icon="i-lucide-play" :label="t('tools.resume')" color="success"
                    variant="solid" @click="taskManager.resume()" />
                  <UButton v-if="isProcessing || isPaused" icon="i-lucide-square" :label="t('tools.stopAll')"
                    color="error" variant="subtle" @click="taskManager.stopAll()" /> -->
                    <UButton icon="i-lucide-download" :label="t('tools.start')" color="primary" variant="soft"
                      type="submit" :disabled="controlsDisabled || fetchingFormats"
                      :loading="isProcessing && !isPaused" />
                  </div>
                </template>
              </UCard>
            </div>
          </UScrollArea>
        </div>
      </div>

      <!-- Config Creation / Edit Slideover -->
      <ToolsDownloadConfigSlideover v-model:open="showConfigSlideover" :config="editingConfig" :formats="formats"
        :loading="savingConfig" @save="onSaveConfig" />

      <!-- Confirm modals -->
      <LazyBaseConfirmModal v-model:open="showDeleteConfigModal" :title="t('tools.confirmDeleteConfigTitle')"
        :description="t('tools.confirmDeleteConfigDesc', { name: deleteConfigTarget?.title || '' })"
        confirm-icon="i-lucide-trash-2" :loading="deletingConfig" @confirm="doDeleteConfig" />

      <LazyBaseConfirmModal v-model:open="showClearHistoryModal" :title="t('tools.confirmClearHistoryTitle')"
        :description="t('tools.confirmClearHistory')" confirm-icon="i-lucide-trash-2" :loading="clearingHistory"
        @confirm="clearAllHistory" />

      <!-- Confirm delete history (single/batch) modal -->
      <LazyBaseConfirmModal v-model:open="showDeleteHistoryConfirm" :title="confirmHistoryTitle"
        confirm-icon="i-lucide-trash-2" color="error" :loading="deletingHistory" @confirm="doDeleteHistory">
        <template #body>
          <div class="space-y-3 py-1">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-alert-triangle" class="text-xl shrink-0 mt-0.5 text-error" />
              <p class="text-sm text-muted">
                {{ confirmHistoryDesc }}
              </p>
            </div>

            <!-- Targeted items list -->
            <div v-if="deleteHistoryTargets.length > 0"
              class="max-h-36 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-2 space-y-1 text-xs font-mono">
              <div v-for="item in deleteHistoryTargets" :key="item.id"
                class="flex items-center gap-2 truncate text-neutral-700 dark:text-neutral-300">
                <UIcon name="i-simple-icons-youtube" class="size-3.5 shrink-0 text-red-600" />
                <span class="truncate">{{ item.title || item.url }}</span>
              </div>
            </div>
          </div>
        </template>
      </LazyBaseConfirmModal>

      <!-- History Slideover -->
      <BaseResponsiveSlideover v-model:open="showHistorySlideover" :title="t('tools.history')" icon="i-lucide-history"
        side="right" :ui="{ content: 'w-screen max-w-4xl' }">
        <template #body>
          <div class="h-[60vh]">
            <LazyGridList v-model:selected="selectedHistory" :items="history" :columns="historyColumns" item-key="id"
              selectable :loading="loadingHistory" :can-load-more="hasMoreHistory" storage-key="tools-youtube-history"
              @refresh="loadHistory" @load-more="loadMoreHistory">
              <template #empty>
                <UEmpty icon="i-lucide-clock" :title="t('tools.noHistory')" :description="t('tools.noHistoryDesc')" />
              </template>

              <template #mobile-content="{ item: h }">
                <div class="flex items-start justify-between gap-2 min-w-0">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <UCheckbox :model-value="isHistorySelected(h)"
                      @update:model-value="(val) => toggleHistorySelect(h, val)" @click.stop />
                    <p class="text-sm font-semibold truncate flex-1" :title="h.title || h.url">
                      {{ h.title || h.url }}
                    </p>
                  </div>
                  <UBadge :color="statusColor(h)" variant="soft" size="sm" class="shrink-0">
                    {{ t(`global.${h.status}`) }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between gap-2 min-w-0 pl-6">
                  <div class="flex flex-col">
                    <p v-if="h.title" class="mt-1 text-xs text-muted truncate min-w-0 font-mono">
                      {{ h.url }}
                    </p>
                    <div class="mt-2 flex items-center gap-3 text-xs text-muted">
                      <span>{{ formatHistoryFormat(h) }}</span>
                      <span>{{ formatHistorySize(h) }}</span>
                      <span>{{ formatDuration(h.duration) }}</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-center gap-1">
                    <UButton v-if="h.status === 'completed' && h.file_name && taskManager.isElectron.value"
                      icon="i-lucide-play" size="xs" variant="ghost" color="primary" :title="t('tools.openFile')"
                      @click="openFile(h.out_path, h.file_name)" />
                    <UButton v-if="h.out_path && taskManager.isElectron.value" icon="i-lucide-folder" size="xs"
                      variant="ghost" color="neutral" :title="t('tools.openFolder')"
                      @click="h.file_name ? showInFolder(`${h.out_path}/${h.file_name}`) : openFolder(h.out_path)" />
                    <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error" :title="t('global.delete')"
                      @click="confirmDeleteHistory(h)" />
                  </div>
                </div>
              </template>

              <template #title="{ item: h }">
                <p class="text-sm font-semibold truncate" :title="h.title || h.url">
                  {{ h.title || h.url }}
                </p>
              </template>

              <template #url="{ item: h }">
                <p class="truncate text-xs text-muted font-mono">
                  {{ h.url }}
                </p>
              </template>

              <template #format="{ item: h }">
                <span class="text-xs">{{ formatHistoryFormat(h) }}</span>
              </template>

              <template #size="{ item: h }">
                <span class="text-xs">{{ formatHistorySize(h) }}</span>
              </template>

              <template #status="{ item: h }">
                <UBadge :color="statusColor(h)" variant="soft" size="sm">
                  {{ t(`global.${h.status}`) }}
                </UBadge>
              </template>

              <template #actions="{ item: h }">
                <div class="flex items-center justify-center gap-1 pr-3">
                  <UButton v-if="h.status === 'completed' && h.file_name && taskManager.isElectron.value"
                    icon="i-lucide-play" size="xs" variant="ghost" color="primary" :title="t('tools.openFile')"
                    @click="openFile(h.out_path, h.file_name)" />
                  <UButton v-if="h.out_path && taskManager.isElectron.value" icon="i-lucide-folder" size="xs"
                    variant="ghost" color="neutral" :title="t('tools.openFolder')"
                    @click="h.file_name ? showInFolder(`${h.out_path}/${h.file_name}`) : openFolder(h.out_path)" />
                  <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error" :title="t('global.delete')"
                    @click="confirmDeleteHistory(h)" />
                </div>
              </template>
            </LazyGridList>
          </div>
        </template>
        <template #footer>
          <div class="flex items-center justify-between w-full gap-2">
            <div class="flex items-center gap-2">
              <UButton variant="ghost" color="neutral" :label="t('global.cancel')"
                @click="showHistorySlideover = false" />
              <UButton v-if="selectedHistory.length" icon="i-lucide-trash" color="error" variant="subtle"
                :loading="deletingHistory" @click="confirmBatchDeleteHistory">
                {{ t('global.delete') }}
                <template #trailing>
                  <UKbd>{{ selectedHistory.length }}</UKbd>
                </template>
              </UButton>
            </div>
            <div class="flex items-center gap-2">
              <UButton v-if="history.length > 0" size="xs" variant="ghost" color="neutral"
                @click="toggleSelectAllHistory">
                {{ selectedHistory.length === history.length ? t('tools.deselectAll') : t('tools.selectAll') }}
              </UButton>
              <UButton v-if="history.length > 0" icon="i-lucide-trash-2" :label="t('tools.clearHistory')" color="error"
                variant="soft" @click="showClearHistoryModal = true" />
              <UButton icon="i-lucide-refresh-cw" :label="t('tools.refresh')" variant="soft" :loading="loadingHistory"
                @click="loadHistory" />
            </div>
          </div>
        </template>
      </BaseResponsiveSlideover>

      <!-- Version Info Slideover -->
      <BaseResponsiveSlideover v-model:open="showVersionSlideover" :title="t('tools.versionInfo')" icon="i-lucide-info"
        side="right" :dismissible="!updating" :close="!updating">
        <template #body>
          <div v-if="loadingVersion" class="flex justify-center py-8">
            <UIcon name="i-lucide-loader-circle" class="size-8 text-muted animate-spin" />
          </div>
          <div v-else class="space-y-4">
            <!-- Update Info / Action Card -->
            <div v-if="updateInfo" class="space-y-3">
              <div v-if="updateInfo.hasUpdate"
                class="p-3.5 rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 space-y-2.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-arrow-up-circle" class="size-5 text-primary" />
                    <span class="font-semibold text-xs text-primary">{{ t('tools.updateAvailable') }}</span>
                  </div>
                  <UBadge color="primary" variant="subtle" size="xs">
                    {{ updateInfo.latestVersion }}
                  </UBadge>
                </div>
                <div class="text-xs text-muted space-y-1">
                  <p>
                    {{ t('tools.latestVersion') }}: <span class="font-mono text-default font-semibold">
                      {{ updateInfo.latestVersion }}
                    </span>
                  </p>
                  <p v-if="updateInfo.downloadUrl" class="truncate text-[11px]">
                    Link: <span class="font-mono text-muted select-all">{{ updateInfo.downloadUrl }}</span>
                  </p>
                </div>
                <div class="pt-1">
                  <UCheckbox v-model="cleanTemp" :disabled="updating" :label="t('tools.cleanTemp')" class="text-xs" />
                </div>
                <div v-if="updating" class="space-y-1.5 pt-2 border-t border-primary/20">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-primary font-medium flex items-center gap-1.5 truncate max-w-70">
                      <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin shrink-0" />
                      {{ updateProgress.message || updateProgressMsg || t('tools.updating') }}
                    </span>
                    <span class="font-mono text-primary font-semibold shrink-0">
                      {{ updateProgress.percent || 0 }}%
                    </span>
                  </div>
                  <UProgress :model-value="updateProgress.percent || 0" color="primary" size="sm" />
                </div>
                <div class="pt-2 flex items-center gap-2">
                  <UButton icon="i-lucide-download-cloud" color="primary" variant="soft" block class="flex-1"
                    :loading="updating" :disabled="updating"
                    :label="updating ? (updateProgressMsg || t('tools.updating')) : t('tools.updateNow')"
                    @click="performUpdate" />
                  <!-- <UButton v-if="updating" icon="i-lucide-minimize-2" color="neutral" variant="ghost" size="sm"
                    :title="t('tools.minimize')" @click="showVersionSlideover = false" /> -->
                </div>
              </div>
              <div v-else
                class="p-3 rounded-xl border border-success/30 bg-success/5 dark:bg-success/10 flex items-center gap-2 text-xs text-success font-medium">
                <UIcon name="i-lucide-check-circle" class="size-4 shrink-0" />
                <span>{{ t('tools.upToDate') }} ({{ updateInfo.latestVersion }})</span>
              </div>
            </div>

            <div class="p-4 border border-primary/30 rounded-lg bg-muted/20">
              <div class="flex items-center gap-2 mb-2 font-semibold">
                <UIcon name="i-simple-icons-youtube" class="text-red-600 size-5" />
                <span>yt-dlp version</span>
              </div>
              <p class="text-sm font-mono bg-black/5 dark:bg-white/5 p-3 rounded select-all break-all">
                {{ ytdlpVersion || 'Unknown version' }}
              </p>
            </div>

            <!-- Runtime Environment Card -->
            <div
              class="p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <UIcon name="i-lucide-cpu" class="size-4 text-primary" />
                  {{ t('tools.runtimeEnvironment') }}
                </span>
                <UBadge color="neutral" variant="subtle" size="xs">
                  Desktop
                </UBadge>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div
                  class="p-2.5 rounded-lg bg-white dark:bg-neutral-800/80 border border-neutral-200/70 dark:border-neutral-700/60 flex items-center justify-between gap-2 shadow-xs">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <UIcon name="i-lucide-monitor" class="size-3.5 text-primary shrink-0" />
                    <span class="text-muted text-[11px]">Platform</span>
                  </div>
                  <span class="font-mono font-semibold text-default truncate">{{ electronPlatform }}</span>
                </div>
                <div
                  class="p-2.5 rounded-lg bg-white dark:bg-neutral-800/80 border border-neutral-200/70 dark:border-neutral-700/60 flex items-center justify-between gap-2 shadow-xs">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <UIcon name="i-lucide-atom" class="size-3.5 text-cyan-500 shrink-0" />
                    <span class="text-muted text-[11px]">Electron</span>
                  </div>
                  <span class="font-mono font-semibold text-default truncate">
                    {{ electronVersions.electron || '-' }}
                  </span>
                </div>
                <div
                  class="p-2.5 rounded-lg bg-white dark:bg-neutral-800/80 border border-neutral-200/70 dark:border-neutral-700/60 flex items-center justify-between gap-2 shadow-xs">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <UIcon name="i-lucide-server" class="size-3.5 text-emerald-500 shrink-0" />
                    <span class="text-muted text-[11px]">Node.js</span>
                  </div>
                  <span class="font-mono font-semibold text-default truncate">
                    {{ electronVersions.node || '-' }}
                  </span>
                </div>
                <div
                  class="p-2.5 rounded-lg bg-white dark:bg-neutral-800/80 border border-neutral-200/70 dark:border-neutral-700/60 flex items-center justify-between gap-2 shadow-xs">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <UIcon name="i-lucide-globe" class="size-3.5 text-amber-500 shrink-0" />
                    <span class="text-muted text-[11px]">Chrome</span>
                  </div>
                  <span class="font-mono font-semibold text-default truncate">
                    {{ electronVersions.chrome || '-' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex items-center justify-between w-full gap-2">
            <UButton variant="ghost" color="neutral" :disabled="updating" :label="t('global.cancel')"
              @click="showVersionSlideover = false" />
            <div class="flex items-center gap-1.5">
              <UButton icon="i-lucide-refresh-cw" :label="t('tools.refresh')" variant="soft" color="neutral"
                :loading="loadingVersion" :disabled="updating || loadingVersion" @click="fetchVersion" />
              <UButton icon="i-lucide-sparkles" :label="t('tools.checkUpdate')" variant="soft" color="primary"
                :loading="checkingUpdate" :disabled="updating || checkingUpdate" @click="checkUpdate" />
            </div>
          </div>
        </template>
      </BaseResponsiveSlideover>

      <!-- Floating Mini Update Progress Widget -->
      <Transition enter-active-class="transition duration-300 ease-out"
        enter-from-class="transform translate-y-4 opacity-0 scale-95"
        enter-to-class="transform translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="transform translate-y-0 opacity-100 scale-100"
        leave-to-class="transform translate-y-4 opacity-0 scale-95">
        <div v-if="updating && !showVersionSlideover"
          class="fixed bottom-5 right-5 z-50 p-3.5 rounded-2xl border border-primary/40 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md shadow-2xl w-80 space-y-2.5 cursor-pointer hover:border-primary transition-all duration-200 ring-1 ring-primary/20"
          @click="showVersionSlideover = true">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon name="i-simple-icons-youtube" class="size-4 text-red-600 shrink-0" />
              <span class="font-semibold text-xs text-neutral-800 dark:text-neutral-200 truncate">yt-dlp</span>
            </div>
            <UBadge color="primary" variant="subtle" size="xs">
              {{ updateProgress.percent || 0 }}%
            </UBadge>
          </div>
          <UProgress :model-value="updateProgress.percent || 0" color="primary" size="xs" />
          <div class="flex items-center justify-between text-[11px] text-muted">
            <span class="truncate max-w-47.5">
              {{ updateProgress.message || updateProgressMsg || t('tools.updating') }}
            </span>
            <span class="text-primary hover:underline font-medium shrink-0 flex items-center gap-0.5">
              {{ t('tools.viewDetails') }}
              <UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </span>
          </div>
        </div>
      </Transition>
    </UForm>
  </BasePage>
</template>
