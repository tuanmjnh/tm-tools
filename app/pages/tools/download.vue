<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { z } from 'zod'
import type { ToolTask, PlaylistVideo, YoutubeFormat, YoutubeConfig, YoutubeHistory } from '~/types'

const { t } = useI18n()
const toast = useToast()

const { pickFolder } = useFileSystem()

async function pickOutputFolder() {
  const folder = await pickFolder({ title: t('tools.output') })
  if (folder) state.outputPath = folder
}

const taskManager = useToolTaskManager('youtube')

// Unified Form state
const state = reactive({
  downloadMode: 'single' as 'single' | 'multiple',
  singleUrl: '',
  urlText: '',
  outputPath: '',
  threads: 4,
  selectedFormatId: '',
  selectedConfigId: ''
})

// Playlist
const isPlaylist = ref(false)
const playlistVideos = ref<PlaylistVideo[]>([])
const selectedVideos = ref<Set<string>>(new Set())
const loadingPlaylist = ref(false)
const showPlaylistPreview = ref(false)

// Data
const formats = ref<YoutubeFormat[]>([])
const configs = ref<YoutubeConfig[]>([])
const history = ref<YoutubeHistory[]>([])
const loadingHistory = ref(false)
const showHistorySlideover = ref(false)
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
    if (!newVal.some(f => f.id === state.selectedFormatId)) {
      state.selectedFormatId = newVal[0]?.id || ''
    }
  } else {
    state.selectedFormatId = ''
  }
})

let fetchTimeout: NodeJS.Timeout | null = null
watch(() => state.singleUrl, (newUrl) => {
  if (fetchTimeout) clearTimeout(fetchTimeout)
  const url = newUrl.trim()
  if (url.startsWith('http') && url.length > 10) {
    fetchTimeout = setTimeout(() => {
      fetchDynamicFormats()
    }, 800)
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
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    history.value = await taskManager.api!.listHistory?.(100) || []
  } finally {
    loadingHistory.value = false
  }
}

async function openHistory() {
  showHistorySlideover.value = true
  await loadHistory()
}

async function clearAllHistory() {
  clearingHistory.value = true
  try {
    const rs = await taskManager.api!.deleteHistory()
    if (rs && rs.status) {
      toast.add({ title: t('global.success'), description: t('tools.historyCleared'), color: 'success' })
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

async function openVersionInfo() {
  showVersionSlideover.value = true
  await fetchVersion()
}

const electronPlatform = computed(() => window.electronAPI?.platform || 'Desktop')
const electronVersions = computed(() => window.electronAPI?.versions || { node: '', chrome: '', electron: '' })

function openFolder(path: string | null) {
  if (window.electronAPI?.openPath && path) {
    window.electronAPI.openPath(path)
  }
}

function openFile(folder: string | null, fileName: string | null) {
  if (window.electronAPI?.openPath && folder && fileName) {
    const path = `${folder}/${fileName}`.replace(/\/+/g, '/')
    window.electronAPI.openPath(path)
  }
}

function showInFolder(fullPath: string) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    window.electronAPI.showItemInFolder(fullPath)
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
  isPlaylist.value = urls.some(u => u.includes('playlist') || u.includes('channel') || u.includes('@'))
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
    urls = state.urlText.split('\n').map(u => u.trim()).filter(Boolean)
  }

  const cfg = configs.value.find(c => c.id === state.selectedConfigId)
  const outPath = state.outputPath || cfg?.out_path || ''
  const fileName = cfg?.file_name || ''

  return urls.map((url, i) => ({
    args: [...getFormatArgs(), url],
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
      await loadConfigs()
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

async function applyConfig(cfg: YoutubeConfig) {
  state.selectedConfigId = cfg.id
  state.selectedFormatId = cfg.format_id
  state.outputPath = cfg.out_path
  state.threads = cfg.threads
  toast.add({ title: t('tools.configApplied'), color: 'success' })
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
    <UForm
      id="download-form"
      :schema="schema"
      :state="state"
      class="flex flex-col flex-1 min-h-0"
      @submit="onSubmit"
    >
      <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-4 p-1' }">
        <!-- Alerts -->
        <div v-if="exeState === 'missing' || !taskManager.isElectron.value" class="space-y-2 mb-4">
          <UAlert
            v-if="exeState === 'missing'"
            icon="i-lucide-alert-triangle"
            color="error"
            variant="subtle"
            :title="t('tools.executableMissing')"
          />
          <UAlert
            v-if="!taskManager.isElectron.value"
            icon="i-lucide-monitor"
            color="warning"
            variant="subtle"
            :title="t('tools.noElectron')"
          />
        </div>

        <!-- Two-Column Responsive Layout -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <!-- Left Column: Source URL Input, Tasks & History -->
          <div class="lg:col-span-2 space-y-6">
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
                    <UButton
                      icon="i-lucide-info"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :title="t('tools.versionInfo')"
                      @click="openVersionInfo"
                    />
                    <UButton
                      icon="i-lucide-history"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :title="t('tools.history')"
                      @click="openHistory"
                    />
                  </div>
                </div>
              </template>

              <!-- URL Input Area -->
              <div class="mb-4 space-y-4 border-b pb-4 border-gray-100 dark:border-gray-800">
                <UFormField name="downloadMode" :label="t('tools.downloadMode')">
                  <URadioGroup
                    v-model="state.downloadMode"
                    :items="[
                      { label: t('tools.singleVideo'), value: 'single' },
                      { label: t('tools.multipleVideos'), value: 'multiple' }
                    ]"
                    class="flex gap-4"
                    :disabled="isProcessing || isPaused"
                  />
                </UFormField>

                <div v-if="state.downloadMode === 'single'">
                  <UFormField name="singleUrl" :label="t('tools.url')">
                    <div class="flex gap-2 w-full">
                      <UInput
                        v-model="state.singleUrl"
                        placeholder="https://www.youtube.com/watch?v=..."
                        class="flex-1"
                        :loading="fetchingFormats"
                        :disabled="isProcessing || isPaused || fetchingFormats"
                      />
                    </div>
                  </UFormField>
                </div>

                <div v-else>
                  <UFormField name="urlText" :label="t('tools.urls')">
                    <UTextarea
                      v-model="state.urlText"
                      :rows="4"
                      class="w-full"
                      placeholder="https://www.youtube.com/watch?v=...&#10;https://www.youtube.com/playlist?list=..."
                      :disabled="isProcessing || isPaused"
                    />
                    <template #hint>
                      <div class="flex items-center gap-2 text-xs text-muted">
                        <span v-if="isPlaylist" class="text-primary font-medium">{{ t('tools.playlistDetected')
                        }}</span>
                        <UButton
                          v-if="isPlaylist && !loadingPlaylist"
                          size="xs"
                          variant="soft"
                          :loading="loadingPlaylist"
                          :disabled="isProcessing || isPaused"
                          @click="crawlPlaylist"
                        >
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
                  <div
                    v-for="video in playlistVideos"
                    :key="video.id"
                    class="flex items-center gap-2 p-1 hover:bg-muted/50 rounded"
                  >
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
            <ToolsTaskManagerPanel
              v-if="taskManager.taskList.value.length"
              :items="taskManager.taskList.value"
              :total="taskManager.total.value"
              :done="taskManager.done.value"
              :running="taskManager.running.value"
              :processing="taskManager.processing.value"
              :paused="taskManager.paused.value"
              :retries="taskManager.globalRetryCount.value"
              :can-start="false"
              @refresh="taskManager.refreshStatus()"
              @pause="taskManager.pause()"
              @resume="taskManager.resume()"
              @stop-all="taskManager.stopAll()"
              @stop-task="(key) => taskManager.stopTask(key)"
              @open-item="showInFolder"
            />
          </div>

          <!-- Right Column: Settings & Configuration Presets -->
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
                <!-- Output Folder Settings -->
                <UFormField name="outputPath" :label="t('tools.output')">
                  <UInput
                    v-model="state.outputPath"
                    placeholder="D:/Downloads/YouTube"
                    :ui="{ trailing: 'pe-1' }"
                    class="w-full"
                    :disabled="isProcessing || isPaused"
                  >
                    <template #trailing>
                      <div class="flex items-center gap-1">
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="sm"
                          icon="i-lucide-external-link"
                          :title="t('tools.openFolder')"
                          :aria-label="t('tools.openFolder')"
                          :disabled="!state.outputPath || !taskManager.isElectron.value"
                          @click="openFolder(state.outputPath)"
                        />
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="sm"
                          icon="i-lucide-folder-open"
                          :title="t('tools.browse')"
                          :aria-label="t('tools.browse')"
                          :disabled="!taskManager.isElectron.value || isProcessing || isPaused"
                          @click="pickOutputFolder"
                        />
                      </div>
                    </template>
                  </UInput>
                </UFormField>

                <!-- Threads Settings -->
                <UFormField name="threads" :label="t('tools.threads')">
                  <UInput
                    v-model.number="state.threads"
                    type="number"
                    min="1"
                    max="8"
                    class="w-full"
                    :disabled="isProcessing || isPaused"
                  />
                </UFormField>

                <!-- Format Settings -->
                <UFormField name="selectedFormatId" :label="t('tools.format')">
                  <USelectMenu
                    v-model="state.selectedFormatId"
                    :items="activeFormats.map(f => ({ label: f.title, value: f.id }))"
                    :placeholder="t('tools.selectFormat')"
                    :search-input="{ placeholder: t('global.search') }"
                    value-key="value"
                    class="w-full"
                    :disabled="isProcessing || isPaused || fetchingFormats"
                    :loading="fetchingFormats"
                  >
                    <template #empty>
                      {{ t('tools.noFormats') }}
                    </template>
                  </USelectMenu>
                </UFormField>

                <!-- Preset Select Settings -->
                <UFormField name="selectedConfigId" :label="t('tools.configPreset')">
                  <div class="flex gap-2 w-full">
                    <USelectMenu
                      v-model="state.selectedConfigId"
                      :items="configs.map(c => ({ label: c.title, value: c.id }))"
                      :placeholder="t('tools.selectPreset')"
                      :search-input="{ placeholder: t('global.search') }"
                      value-key="value"
                      class="flex-1"
                      :disabled="isProcessing || isPaused"
                    >
                      <template #empty>
                        {{ t('tools.noPresets') }}
                      </template>
                    </USelectMenu>
                    <UButton
                      icon="i-lucide-plus"
                      size="sm"
                      :disabled="isProcessing || isPaused || fetchingFormats"
                      @click="openCreateConfig"
                    />
                  </div>
                </UFormField>
              </div>

              <template #footer>
                <div class="flex justify-end gap-2 w-full">
                  <UButton
                    v-if="isProcessing && !isPaused"
                    icon="i-lucide-pause"
                    :label="t('tools.pause')"
                    color="warning"
                    variant="subtle"
                    @click="taskManager.pause()"
                  />
                  <UButton
                    v-if="isPaused"
                    icon="i-lucide-play"
                    :label="t('tools.resume')"
                    color="success"
                    variant="solid"
                    @click="taskManager.resume()"
                  />
                  <UButton
                    v-if="isProcessing || isPaused"
                    icon="i-lucide-square"
                    :label="t('tools.stopAll')"
                    color="error"
                    variant="subtle"
                    @click="taskManager.stopAll()"
                  />
                  <UButton
                    icon="i-lucide-download"
                    :label="t('tools.start')"
                    color="primary"
                    variant="solid"
                    type="submit"
                    :disabled="isProcessing || isPaused || fetchingFormats"
                    :loading="isProcessing && !isPaused"
                  />
                </div>
              </template>
            </UCard>

            <!-- Saved Presets Chips Card -->
            <UCard v-if="configs.length">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sliders" class="text-primary size-5" />
                  <p class="font-semibold">
                    {{ t('tools.savedConfigs') }}
                  </p>
                </div>
              </template>

              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="cfg in configs"
                  :key="cfg.id"
                  size="sm"
                  :variant="state.selectedConfigId === cfg.id ? 'solid' : 'outline'"
                  :color="state.selectedConfigId === cfg.id ? 'primary' : 'neutral'"
                  class="flex items-center gap-1"
                  :disabled="isProcessing || isPaused"
                  @click="applyConfig(cfg)"
                >
                  <span class="max-w-32 truncate">{{ cfg.title }}</span>
                  <UButton
                    icon="i-lucide-pencil"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="isProcessing || isPaused"
                    @click.stop="openEditConfig(cfg)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :disabled="isProcessing || isPaused"
                    @click.stop="openDeleteConfig(cfg)"
                  />
                </UButton>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Config Creation / Edit Slideover -->
        <ToolsDownloadConfigSlideover
          v-model:open="showConfigSlideover"
          :config="editingConfig"
          :formats="formats"
          :loading="savingConfig"
          @save="onSaveConfig"
        />

        <!-- Confirm modals -->
        <LazyBaseConfirmModal
          v-model:open="showDeleteConfigModal"
          :title="t('tools.confirmDeleteConfigTitle')"
          :description="t('tools.confirmDeleteConfigDesc', { name: deleteConfigTarget?.title || '' })"
          confirm-icon="i-lucide-trash-2"
          :loading="deletingConfig"
          @confirm="doDeleteConfig"
        />

        <LazyBaseConfirmModal
          v-model:open="showClearHistoryModal"
          :title="t('tools.confirmClearHistoryTitle')"
          :description="t('tools.confirmClearHistory')"
          confirm-icon="i-lucide-trash-2"
          :loading="clearingHistory"
          @confirm="clearAllHistory"
        />

        <!-- History Slideover -->
        <BaseResponsiveSlideover
          v-model:open="showHistorySlideover"
          :title="t('tools.history')"
          icon="i-lucide-history"
          side="right"
        >
          <template #body>
            <div v-if="loadingHistory" class="flex justify-center py-8">
              <UIcon name="i-lucide-loader-circle" class="size-8 text-muted animate-spin" />
            </div>
            <div v-else-if="history.length === 0" class="text-center py-12 text-muted">
              <UIcon name="i-lucide-clock" class="text-3xl mb-2" />
              <p>{{ t('tools.noHistory') }}</p>
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="h in history"
                :key="h.id"
                class="p-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col gap-2"
              >
                <div class="flex items-start justify-between gap-2 min-w-0">
                  <p class="text-sm font-semibold truncate flex-1" :title="h.title || h.url">
                    {{ h.title || h.url }}
                  </p>
                  <UBadge
                    :color="h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'warning'"
                    variant="soft"
                    size="sm"
                    class="shrink-0"
                  >
                    {{ t('global.' + h.status) }}
                  </UBadge>
                </div>

                <p v-if="h.title" class="text-xs text-muted truncate min-w-0 font-mono">
                  {{ h.url }}
                </p>

                <div class="flex items-center justify-between text-xs text-muted border-t pt-2 border-muted/50 mt-1">
                  <div class="flex items-center gap-3">
                    <span>{{ h.format_title || h.format_id || '-' }}</span>
                    <span>{{ formatBytes(h.file_size) }}</span>
                    <span>{{ formatDuration(h.duration) }}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="h.status === 'completed' && h.file_name && taskManager.isElectron.value"
                      icon="i-lucide-play"
                      size="xs"
                      variant="ghost"
                      color="primary"
                      :title="t('tools.openFile')"
                      @click="openFile(h.out_path, h.file_name)"
                    />
                    <UButton
                      v-if="h.out_path && taskManager.isElectron.value"
                      icon="i-lucide-folder"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      :title="t('tools.openFolder')"
                      @click="openFolder(h.out_path)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #footer>
            <div class="flex justify-between w-full">
              <UButton
                v-if="history.length > 0"
                icon="i-lucide-trash-2"
                :label="t('tools.clearHistory')"
                color="error"
                variant="subtle"
                @click="showClearHistoryModal = true"
              />
              <div v-else />
              <div class="flex gap-2">
                <UButton
                  variant="ghost"
                  color="neutral"
                  :label="t('global.cancel')"
                  @click="showHistorySlideover = false"
                />
                <UButton
                  icon="i-lucide-refresh-cw"
                  :label="t('tools.refresh')"
                  :loading="loadingHistory"
                  @click="loadHistory"
                />
              </div>
            </div>
          </template>
        </BaseResponsiveSlideover>

        <!-- Version Info Slideover -->
        <BaseResponsiveSlideover
          v-model:open="showVersionSlideover"
          :title="t('tools.versionInfo')"
          icon="i-lucide-info"
          side="right"
        >
          <template #body>
            <div v-if="loadingVersion" class="flex justify-center py-8">
              <UIcon name="i-lucide-loader-circle" class="size-8 text-muted animate-spin" />
            </div>
            <div v-else class="space-y-4">
              <div class="p-4 border rounded-lg bg-muted/20">
                <div class="flex items-center gap-2 mb-2 font-semibold">
                  <UIcon name="i-simple-icons-youtube" class="text-red-600 size-5" />
                  <span>yt-dlp version</span>
                </div>
                <p class="text-sm font-mono bg-black/5 dark:bg-white/5 p-3 rounded select-all break-all">
                  {{ ytdlpVersion || 'Unknown version' }}
                </p>
              </div>

              <div class="text-xs text-muted leading-relaxed space-y-1">
                <p>Platform: <span class="font-mono text-default">{{ electronPlatform }}</span></p>
                <p>Node.js: <span class="font-mono">{{ electronVersions.node || '-' }}</span></p>
                <p>Chrome: <span class="font-mono">{{ electronVersions.chrome || '-' }}</span></p>
                <p>Electron: <span class="font-mono">{{ electronVersions.electron || '-' }}</span></p>
              </div>
            </div>
          </template>
          <template #footer>
            <UButton
              variant="ghost"
              color="neutral"
              :label="t('global.cancel')"
              @click="showVersionSlideover = false"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              :label="t('tools.refresh')"
              :loading="loadingVersion"
              @click="fetchVersion"
            />
          </template>
        </BaseResponsiveSlideover>
      </UScrollArea>
    </UForm>
  </BasePage>
</template>
