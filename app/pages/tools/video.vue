<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import type { ToolTask, FfmpegLabel, FfmpegSubFile, FfmpegVersions, ToolUpdateInfo, ToolUpdateProgress } from '~/types'

const { t } = useI18n()
const toast = useToast()
const taskManager = useToolTaskManager('ffmpeg')

// Preset management composable
const {
  presets,
  selectedPresetId,
  selectedPresetTitle,
  presetOptions,
  config,
  editingConfig,
  savingConfig,
  deletingPreset,
  deletePresetTarget,
  showConfigSlideover,
  showDeletePresetModal,
  loadPresets,
  resetConfig,
  openCreateConfig,
  onEditPresetClick,
  onSaveConfig,
  openDeletePreset,
  doDeletePreset
} = useFfmpegPresets()

type RunMode
  = | 'single'
  | 'batch'
  | 'join_root'
  | 'join_subfolder'
  | 'join_files'
  | 'split'
  | 'images_root'
  | 'images_subfolder'
  | 'audio'

const RUN_MODE_STORAGE_KEY = 'tools:video:last_run_mode'
const runMode = useLocalStorage<RunMode>(RUN_MODE_STORAGE_KEY, 'single')
const THREADS_STORAGE_KEY = 'tools:video:threads'
// Check hardware concurrency to set default threads (bounded between 1 and 8, fallback 4)
const defaultThreads = useLocalStorage<number>(THREADS_STORAGE_KEY, () => {
  if (import.meta.client && typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return Math.min(8, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2) || 3))
  }
  return 3
})
const isPresetRequiredMode = computed(() => runMode.value === 'single' || runMode.value === 'batch')
const isPresetOptionalMode = computed(() => ['join_root', 'join_subfolder', 'join_files', 'split'].includes(runMode.value))
const isImageMode = computed(() => ['images_root', 'images_subfolder'].includes(runMode.value))
const applyPresetToTool = ref(false)

interface ModeOption {
  label: string
  value: RunMode
  icon: string
  description?: string
}

const modeOptions = computed<ModeOption[][]>(() => [
  [
    {
      label: t('tools.singleRender'),
      value: 'single',
      icon: 'i-lucide-play-square',
      description: t('tools.singleRenderDesc')
    },
    {
      label: t('tools.batchRender'),
      value: 'batch',
      icon: 'i-lucide-layers',
      description: t('tools.batchRenderDesc')
    }
  ],
  [
    {
      label: t('tools.joinRoot'),
      value: 'join_root',
      icon: 'i-lucide-folder-root',
      description: t('tools.joinRootDesc')
    },
    {
      label: t('tools.joinSubfolder'),
      value: 'join_subfolder',
      icon: 'i-lucide-folder-tree',
      description: t('tools.joinSubfolderDesc')
    },
    {
      label: t('tools.joinFiles'),
      value: 'join_files',
      icon: 'i-lucide-merge',
      description: t('tools.joinFilesDesc')
    }
  ],
  [
    {
      label: t('tools.splitVideo'),
      value: 'split',
      icon: 'i-lucide-scissors',
      description: t('tools.splitVideoDesc')
    }
  ],
  [
    {
      label: t('tools.imagesRoot'),
      value: 'images_root',
      icon: 'i-lucide-image',
      description: t('tools.imagesRootDesc')
    },
    {
      label: t('tools.imagesSubfolder'),
      value: 'images_subfolder',
      icon: 'i-lucide-images',
      description: t('tools.imagesSubfolderDesc')
    }
  ],
  [
    {
      label: t('tools.audioTool'),
      value: 'audio',
      icon: 'i-lucide-music',
      description: t('tools.audioToolDesc')
    }
  ]
])

const currentModeItem = computed(() => {
  for (const group of modeOptions.value) {
    const found = group.find(item => item.value === runMode.value)
    if (found) return found
  }
  return modeOptions.value[0]?.[0]
})

// General system and state
const starting = ref(false)
const exeState = ref<'unknown' | 'ok' | 'missing'>('unknown')
const showHistorySlideover = ref(false)
const showVersionSlideover = ref(false)
const showGpuModal = ref(false)
const ffmpegVersions = ref<FfmpegVersions>({})
const loadingVersion = ref(false)

// GPU Support
const gpuSupport = ref({ nvenc: false, amf: false, qsv: false, gpus: [] as string[] })
const selectedEncoder = ref<'cpu' | 'nvenc' | 'amf' | 'qsv'>(
  ((import.meta.client ? localStorage.getItem('selected_encoder') : null) as 'cpu' | 'nvenc' | 'amf' | 'qsv') || 'cpu'
)
const gpuLoading = ref(false)

watch(selectedEncoder, (val) => {
  if (import.meta.client) {
    localStorage.setItem('selected_encoder', val)
  }
})

const primaryGpuName = computed(() => {
  if (gpuSupport.value.gpus && gpuSupport.value.gpus.length > 0) {
    return gpuSupport.value.gpus[0]
  }
  const active = []
  if (gpuSupport.value.nvenc) active.push('NVIDIA NVENC')
  if (gpuSupport.value.amf) active.push('AMD AMF')
  if (gpuSupport.value.qsv) active.push('Intel QSV')
  return active.length > 0 ? active.join(', ') : t('tools.noGpu')
})

const gpuEncodersList = computed(() => [
  {
    id: 'nvenc',
    name: 'NVIDIA NVENC',
    codec: 'h264_nvenc',
    supported: gpuSupport.value.nvenc,
    description: t('tools.nvencDesc')
  },
  {
    id: 'qsv',
    name: 'Intel Quick Sync (QSV)',
    codec: 'h264_qsv',
    supported: gpuSupport.value.qsv,
    description: t('tools.qsvDesc')
  },
  {
    id: 'amf',
    name: 'AMD AMF',
    codec: 'h264_amf',
    supported: gpuSupport.value.amf,
    description: t('tools.amfDesc')
  }
])

const gpuRecommendation = computed(() => {
  if (gpuSupport.value.nvenc) {
    return t('tools.hardwareRecommendation', { encoder: 'NVIDIA NVENC' })
  }
  if (gpuSupport.value.qsv) {
    return t('tools.hardwareRecommendation', { encoder: 'Intel QSV' })
  }
  if (gpuSupport.value.amf) {
    return t('tools.hardwareRecommendation', { encoder: 'AMD AMF' })
  }
  return ''
})

const encoderOptions = computed(() => [
  { label: 'CPU (Software - libx264)', value: 'cpu' },
  { label: `NVIDIA NVENC (h264_nvenc)${gpuSupport.value.nvenc ? '' : ' - ' + t('tools.notSupported')}`, value: 'nvenc', disabled: !gpuSupport.value.nvenc },
  { label: `Intel QSV (h264_qsv)${gpuSupport.value.qsv ? '' : ' - ' + t('tools.notSupported')}`, value: 'qsv', disabled: !gpuSupport.value.qsv },
  { label: `AMD AMF (h264_amf)${gpuSupport.value.amf ? '' : ' - ' + t('tools.notSupported')}`, value: 'amf', disabled: !gpuSupport.value.amf }
])

const controlsDisabled = computed(() => exeState.value === 'missing' || taskManager.processing.value || taskManager.paused.value)

// Media size & Visual preview
const singleInputPath = ref('')
const inputMediaSize = ref<{ w: number, h: number }>({ w: 1080, h: 1920 })

const aspectSizes: Record<number, { w: number, h: number }> = {
  0: { w: 1080, h: 1920 },
  1: { w: 1920, h: 1080 },
  2: { w: 1080, h: 1920 },
  3: { w: 1080, h: 1080 },
  4: { w: 1440, h: 1080 }
}

const baseSize = computed(() => {
  if (!selectedPresetId.value) {
    if (singleInputPath.value && inputMediaSize.value.w > 0 && inputMediaSize.value.h > 0) {
      return { w: inputMediaSize.value.w, h: inputMediaSize.value.h }
    }
    return { w: 1080, h: 1920 }
  }
  const ar = Number(config.value.aspect_ratio ?? 0)
  if (ar === 0) {
    if (singleInputPath.value && inputMediaSize.value.w > 0 && inputMediaSize.value.h > 0) {
      return { w: inputMediaSize.value.w, h: inputMediaSize.value.h }
    }
    return { w: 1080, h: 1920 }
  }
  const size = aspectSizes[ar] ?? { w: 1080, h: 1920 }
  return { w: size.w, h: size.h }
})

const previewContainer = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(previewContainer)

const frameSize = computed(() => {
  const { w, h } = baseSize.value
  const maxW = containerWidth.value > 0 ? Math.max(containerWidth.value - 24, 120) : 340
  const maxH = 460
  const scale = Math.min(maxW / w, maxH / h)
  return { w: Math.max(Math.round(w * scale), 80), h: Math.max(Math.round(h * scale), 80) }
})

const previewFile = computed(() => {
  if (!singleInputPath.value) return null
  return {
    path: singleInputPath.value,
    x: config.value.scale_x ?? 0,
    y: config.value.scale_y ?? 0,
    w: config.value.scale_w || baseSize.value.w,
    h: config.value.scale_h || baseSize.value.h
  }
})

const previewLabels = computed(() => {
  const lbls = config.value.labels
  if (Array.isArray(lbls)) return lbls as FfmpegLabel[]
  if (typeof lbls === 'string' && lbls) {
    try {
      return JSON.parse(lbls) as FfmpegLabel[]
    } catch {
      return []
    }
  }
  return []
})

const previewFiles = computed(() => {
  const f = config.value.files
  if (Array.isArray(f)) return f as FfmpegSubFile[]
  if (typeof f === 'string' && f) {
    try {
      return JSON.parse(f) as FfmpegSubFile[]
    } catch {
      return []
    }
  }
  return []
})

// Execution & System actions
async function refreshExe() {
  const rs = await taskManager.checkExecutable()
  exeState.value = rs?.status ? 'ok' : 'missing'
}

async function checkGpu() {
  gpuLoading.value = true
  try {
    const rs = await taskManager.api!.detectGpuSupport?.()
    if (rs) {
      gpuSupport.value = rs
      const savedEncoder = import.meta.client ? localStorage.getItem('selected_encoder') : null
      if (!savedEncoder) {
        if (rs.nvenc) selectedEncoder.value = 'nvenc'
        else if (rs.qsv) selectedEncoder.value = 'qsv'
        else if (rs.amf) selectedEncoder.value = 'amf'
        else selectedEncoder.value = 'cpu'
      } else {
        if (savedEncoder === 'nvenc' && !rs.nvenc) selectedEncoder.value = 'cpu'
        else if (savedEncoder === 'qsv' && !rs.qsv) selectedEncoder.value = 'cpu'
        else if (savedEncoder === 'amf' && !rs.amf) selectedEncoder.value = 'cpu'
        else selectedEncoder.value = savedEncoder as 'cpu' | 'nvenc' | 'amf' | 'qsv'
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    gpuLoading.value = false
  }
}

async function onTasksSubmit(tasks: ToolTask[]) {
  if (exeState.value === 'missing') {
    toast.add({ title: t('tools.executableMissing'), color: 'error' })
    return
  }
  if (starting.value || taskManager.processing.value || taskManager.paused.value) return
  if (!tasks || tasks.length === 0) {
    toast.add({ title: t('tools.noTasksToRun'), color: 'warning' })
    return
  }
  if (isPresetRequiredMode.value && !selectedPresetId.value) {
    toast.add({ title: t('tools.pleaseSelectConfig'), color: 'error' })
    return
  }
  if (isPresetOptionalMode.value && applyPresetToTool.value && !selectedPresetId.value) {
    toast.add({ title: t('tools.pleaseSelectConfig'), color: 'error' })
    return
  }

  starting.value = true
  try {
    let threadsCount = 1
    if (runMode.value === 'single') {
      threadsCount = 1
    } else {
      const taskThreads = Number(tasks[0]?.meta?.threads)
      if (taskThreads && taskThreads >= 1) {
        threadsCount = Math.max(1, Math.min(8, Math.round(taskThreads)))
        defaultThreads.value = threadsCount
      } else {
        threadsCount = Math.max(1, Math.min(8, Math.round(defaultThreads.value || 4)))
      }
    }

    await taskManager.initManager({
      threads: threadsCount,
      maxRetry: 2,
      timeout: 30 * 60 * 1000,
      delayUI: 500
    })
    await taskManager.setTasks(tasks)
    await taskManager.start()
    await taskManager.refreshStatus()
    toast.add({
      title: t('tools.renderStarted'),
      description: `${tasks.length} ${t('tools.taskKey')}`,
      color: 'success'
    })
  } catch (err: unknown) {
    console.error('Failed to start render tasks:', err)
    toast.add({
      title: t('tools.renderFailed'),
      description: err instanceof Error ? err.message : String(err),
      color: 'error'
    })
  } finally {
    starting.value = false
  }
}

function showInFolder(fullPath: string) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    let normalizedPath = fullPath
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    window.electronAPI.showItemInFolder(normalizedPath)
  }
}

function openFile(filePath: string) {
  if (!filePath) return
  if (window.electronAPI?.openPath) {
    let normalizedPath = filePath
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    window.electronAPI.openPath(normalizedPath).catch((e: unknown) => console.log('openFile rejected:', e))
  }
}

function openHistory() {
  showHistorySlideover.value = true
}

async function fetchVersion() {
  loadingVersion.value = true
  try {
    const rs = await taskManager.api!.getVersion<FfmpegVersions>()
    if (rs && rs.status && rs.data && typeof rs.data === 'object') {
      ffmpegVersions.value = rs.data
    } else {
      const errMsg = rs?.message || 'Failed to get version'
      ffmpegVersions.value = {
        ffmpeg: errMsg,
        ffprobe: errMsg,
        ffplay: errMsg
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    ffmpegVersions.value = {
      ffmpeg: errMsg,
      ffprobe: errMsg,
      ffplay: errMsg
    }
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
const ffmpegSource = ref<'btbn' | 'gyan'>('btbn')
const ffmpegSourceOptions = computed(() => [
  { label: t('tools.sourceBtbn'), value: 'btbn' },
  { label: t('tools.sourceGyan'), value: 'gyan' }
])

function onSourceChange(val: string) {
  ffmpegSource.value = (val as 'btbn' | 'gyan') || 'btbn'
  if (import.meta.client) {
    localStorage.setItem('tm_tools_ffmpeg_source', ffmpegSource.value)
  }
  updateInfo.value = null
}

async function checkUpdate() {
  if (checkingUpdate.value || updating.value || !taskManager.api?.checkUpdate) return
  checkingUpdate.value = true
  updateInfo.value = null
  try {
    const rs = await taskManager.api.checkUpdate({ source: ffmpegSource.value })
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
      downloadUrl: updateInfo.value?.downloadUrl,
      source: ffmpegSource.value
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

const electronPlatform = computed(() => window.electronAPI?.platform || 'Desktop')
const electronVersions = computed(() => window.electronAPI?.versions || { node: '', chrome: '', electron: '' })

onMounted(async () => {
  if (import.meta.client) {
    const savedSource = localStorage.getItem('tm_tools_ffmpeg_source')
    if (savedSource === 'btbn' || savedSource === 'gyan') {
      ffmpegSource.value = savedSource
    }
  }
  if (taskManager.api?.onUpdateProgress) {
    taskManager.api.onUpdateProgress((p) => {
      updateProgress.value = p
      if (p.message) updateProgressMsg.value = p.message
    })
  }
  await refreshExe()
  await taskManager.refreshStatus()
  await checkGpu()
  await loadPresets()
  taskManager.setupListeners()

  if (!taskManager.processing.value && !taskManager.paused.value) {
    await taskManager.clearTasks()
  }
})
</script>

<template>
  <BasePage id="tools-video" :title="t('nav.video')" :description="t('tools.videoBody')">
    <!-- Alerts -->
    <div v-if="exeState === 'missing' || !taskManager.isElectron.value" class="space-y-2 shrink-0 mb-4">
      <UAlert v-if="exeState === 'missing'" icon="i-lucide-alert-triangle" color="error" variant="subtle">
        <template #title>
          {{ t('tools.executableMissing') }}
        </template>
        <template #description>
          <div class="mt-2">
            <UButton size="xs" color="error" variant="soft" to="/system/tools">
              {{ t('nav.goTo') }} {{ t('settings.toolsBinaries') }}
            </UButton>
          </div>
        </template>
      </UAlert>
      <UAlert v-if="!taskManager.isElectron.value" icon="i-lucide-monitor" color="warning" variant="subtle"
        :title="t('tools.noElectron')" />
    </div>

    <!-- Main Columns -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden w-full pb-4">
      <!-- Left Column: Forms, Tasks -->
      <div class="lg:col-span-2 lg:h-full lg:min-h-0 flex flex-col">
        <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
          <div class="space-y-6">
            <!-- Main Video Operations Card -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-video" class="text-primary size-5" />
                    <p class="font-semibold text-sm">
                      {{ t('tools.videoForm') }}
                    </p>
                    <UBadge v-if="currentModeItem?.label" variant="subtle" color="neutral" size="xs">
                      {{ currentModeItem.label }}
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-1">
                    <UTooltip :text="t('tools.refresh')">
                      <UButton icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost"
                        :disabled="controlsDisabled" @click="resetConfig" />
                    </UTooltip>
                    <UButton icon="i-lucide-info" color="info" variant="ghost" size="sm" :title="t('tools.versionInfo')"
                      @click="openVersionInfo" />
                    <UButton icon="i-lucide-history" color="warning" variant="ghost" size="sm"
                      :title="t('tools.history')" @click="openHistory" />
                  </div>
                </div>
              </template>

              <!-- Mode Selector via USelectMenu -->
              <div
                class="mb-5 rounded-xl border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {{ t('tools.operationMode') }}
                  </label>
                  <span v-if="currentModeItem?.description"
                    class="text-xs text-neutral-400 dark:text-neutral-500 hidden sm:inline">
                    {{ currentModeItem.description }}
                  </span>
                </div>
                <USelectMenu v-model="runMode" :items="modeOptions" value-key="value" label-key="label" class="w-full"
                  size="lg" :search-input="{ icon: 'i-lucide-search', placeholder: t('global.search') }"
                  :disabled="controlsDisabled">
                  <template #leading>
                    <UIcon :name="currentModeItem?.icon || 'i-lucide-video'" class="size-5 text-primary shrink-0" />
                  </template>
                </USelectMenu>
              </div>

              <!-- Unified Render Settings & Hardware Encoder Section -->
              <div v-if="runMode !== 'audio'"
                class="mb-6 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 space-y-4">
                <!-- Section Title -->
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-primary" />
                  <span class="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                    {{ t('tools.renderSettings') }}
                  </span>
                </div>

                <!-- Video Encoder Row with GPU Support info icon -->
                <div v-if="taskManager.isElectron.value">
                  <UFormField :label="t('tools.videoEncoder')" name="selectedEncoder">
                    <div class="flex gap-2">
                      <USelect v-model="selectedEncoder" :items="encoderOptions" class="flex-1" size="md"
                        :disabled="controlsDisabled" />
                      <UTooltip :text="`${t('tools.gpuSupport')}: ${primaryGpuName}`">
                        <UButton icon="i-lucide-cpu" size="md"
                          :color="gpuSupport.nvenc || gpuSupport.qsv || gpuSupport.amf ? 'primary' : 'neutral'"
                          variant="soft" :disabled="controlsDisabled" :aria-label="t('tools.gpuSupport')"
                          @click="showGpuModal = true" />
                      </UTooltip>
                    </div>
                  </UFormField>
                </div>

                <!-- Preset Section: Case 1 - Required for Single and Batch -->
                <div v-if="isPresetRequiredMode"
                  class="space-y-1.5 pt-3 border-t border-neutral-200/70 dark:border-neutral-800/70">
                  <div class="space-y-0.5">
                    <label class="flex items-center gap-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <span>{{ t('tools.configPreset') }}</span>
                      <span class="text-error text-xs">*</span>
                    </label>
                    <p class="text-[11px] text-neutral-400 dark:text-neutral-500">
                      {{ t('tools.choosePresetDesc') }}
                    </p>
                  </div>
                  <div class="flex gap-2 w-full">
                    <USelectMenu v-model="selectedPresetId" :items="presetOptions" value-key="value"
                      :placeholder="t('tools.selectPreset')" clear
                      :search-input="{ icon: 'i-lucide-search', placeholder: t('tools.searchPreset') }"
                      :disabled="controlsDisabled" class="flex-1" size="md">
                      <template #empty>
                        {{ t('tools.noPresets') }}
                      </template>
                    </USelectMenu>
                    <UTooltip :text="t('tools.addConfig')">
                      <UButton icon="i-lucide-plus" size="md" color="primary" variant="soft"
                        :disabled="controlsDisabled" @click="openCreateConfig" />
                    </UTooltip>
                    <UTooltip :text="t('tools.editConfig')">
                      <UButton icon="i-lucide-pencil" size="md" color="neutral" variant="soft"
                        :disabled="controlsDisabled || !selectedPresetId" @click="onEditPresetClick" />
                    </UTooltip>
                  </div>
                </div>

                <!-- Preset Section: Case 2 - Optional for Join and Split -->
                <div v-else-if="isPresetOptionalMode"
                  class="space-y-3 pt-3 border-t border-neutral-200/70 dark:border-neutral-800/70">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        {{ t('tools.applyPreset') }}
                      </div>
                      <div class="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {{ applyPresetToTool ? t('tools.applyPresetHelp') : (runMode === 'split'
                          ? t('tools.fastSplitHelp')
                          : t('tools.fastJoinHelp')) }}
                      </div>
                    </div>
                    <USwitch v-model="applyPresetToTool" :disabled="controlsDisabled" />
                  </div>

                  <div v-if="applyPresetToTool" class="pt-1">
                    <div class="flex gap-2 w-full">
                      <USelectMenu v-model="selectedPresetId" :items="presetOptions" value-key="value"
                        :placeholder="t('tools.selectPreset')" clear
                        :search-input="{ icon: 'i-lucide-search', placeholder: t('tools.searchPreset') }"
                        :disabled="controlsDisabled" class="flex-1" size="md">
                        <template #empty>
                          {{ t('tools.noPresets') }}
                        </template>
                      </USelectMenu>
                      <UTooltip :text="t('tools.addConfig')">
                        <UButton icon="i-lucide-plus" size="md" color="primary" variant="soft"
                          :disabled="controlsDisabled" @click="openCreateConfig" />
                      </UTooltip>
                      <UTooltip :text="t('tools.editConfig')">
                        <UButton icon="i-lucide-pencil" size="md" color="neutral" variant="soft"
                          :disabled="controlsDisabled || !selectedPresetId" @click="onEditPresetClick" />
                      </UTooltip>
                    </div>
                  </div>
                </div>

                <!-- Preset Section: Case 3 - Image mode notice -->
                <div v-else-if="isImageMode" class="pt-3 border-t border-neutral-200/70 dark:border-neutral-800/70">
                  <div
                    class="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                    <UIcon name="i-lucide-info" class="size-4 text-primary shrink-0" />
                    <span>{{ t('tools.imageModePresetNotice') }}</span>
                  </div>
                </div>
              </div>

              <!-- Dynamic Panels based on Mode -->
              <!-- 1. Single Video Panel -->
              <ToolsVideoSinglePanel v-if="runMode === 'single'" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :selected-preset-id="selectedPresetId || undefined"
                :selected-preset-title="selectedPresetTitle" :config="config" :loading="starting"
                @update:input-path="(path) => singleInputPath = path"
                @update:input-media-size="(size) => inputMediaSize = size" @submit="onTasksSubmit" />

              <!-- 2. Batch Videos Panel -->
              <ToolsVideoBatchPanel v-else-if="runMode === 'batch'" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :selected-preset-id="selectedPresetId || undefined"
                :selected-preset-title="selectedPresetTitle" :config="config" :loading="starting"
                @submit="onTasksSubmit" />

              <!-- 3. Join Videos Panels -->
              <ToolsVideoJoinPanel v-else-if="runMode === 'join_root'" :presets="presets" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :use-preset="applyPresetToTool"
                :selected-preset-id="selectedPresetId || undefined" :selected-preset-title="selectedPresetTitle"
                :config="config" mode="root" @update:input-path="(path) => singleInputPath = path"
                @submit="onTasksSubmit" />

              <ToolsVideoJoinPanel v-else-if="runMode === 'join_subfolder'" :presets="presets"
                :disabled="controlsDisabled" :selected-encoder="selectedEncoder" :use-preset="applyPresetToTool"
                :selected-preset-id="selectedPresetId || undefined" :selected-preset-title="selectedPresetTitle"
                :config="config" mode="subfolder" @update:input-path="(path) => singleInputPath = path"
                @submit="onTasksSubmit" />

              <ToolsVideoJoinPanel v-else-if="runMode === 'join_files'" :presets="presets" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :use-preset="applyPresetToTool"
                :selected-preset-id="selectedPresetId || undefined" :selected-preset-title="selectedPresetTitle"
                :config="config" mode="files" @update:input-path="(path) => singleInputPath = path"
                @submit="onTasksSubmit" />

              <!-- 4. Split Videos Panel -->
              <ToolsVideoSplitPanel v-else-if="runMode === 'split'" :presets="presets" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :use-preset="applyPresetToTool"
                :selected-preset-id="selectedPresetId || undefined" :selected-preset-title="selectedPresetTitle"
                :config="config" @update:input-path="(path) => singleInputPath = path" @submit="onTasksSubmit" />

              <!-- 5. Image2Video Panels -->
              <ToolsVideoCreatorPanel v-else-if="runMode === 'images_root'" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :loading="starting" mode="root" @submit="onTasksSubmit" />

              <ToolsVideoCreatorPanel v-else-if="runMode === 'images_subfolder'" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" :loading="starting" mode="subfolder" @submit="onTasksSubmit" />

              <!-- 6. Audio Tool Panel -->
              <ToolsVideoAudioToolPanel v-else-if="runMode === 'audio'" :disabled="controlsDisabled" :loading="starting"
                @submit="onTasksSubmit" />

              <template v-if="taskManager.processing.value || taskManager.paused.value" #footer>
                <div class="flex justify-end gap-2 w-full">
                  <UButton v-if="taskManager.processing.value && !taskManager.paused.value" icon="i-lucide-pause"
                    :label="t('tools.pause')" color="warning" variant="soft" @click="taskManager.pause()" />
                  <UButton v-if="taskManager.paused.value" icon="i-lucide-play" :label="t('tools.resume')"
                    color="success" variant="soft" @click="taskManager.resume()" />
                  <UButton icon="i-lucide-square" :label="t('tools.stopAll')" color="error" variant="soft"
                    @click="taskManager.stopAll()" />
                </div>
              </template>
            </UCard>

            <!-- Task Manager Panel -->
            <ToolsTaskManagerPanel :items="taskManager.taskList.value" :total="taskManager.total.value"
              :done="taskManager.done.value" :running="taskManager.running.value"
              :processing="taskManager.processing.value" :paused="taskManager.paused.value"
              :retries="taskManager.globalRetryCount.value" :show-actions="false" @refresh="taskManager.refreshStatus()"
              @stop-task="(key) => taskManager.stopTask(key)" @open-file="openFile" @open-item="showInFolder" />
          </div>
        </UScrollArea>
      </div>

      <!-- Right Column: Visual Preview -->
      <div class="lg:h-full lg:min-h-0 flex flex-col lg:sticky lg:top-4">
        <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
          <div class="space-y-6">
            <!-- Video Preview Card Component -->
            <UCard class="shadow-sm">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-eye" class="text-primary size-5" />
                    <p class="font-semibold text-sm">
                      {{ t('tools.previewVideo') }}
                    </p>
                  </div>
                  <UBadge v-if="selectedPresetTitle" variant="subtle" color="primary" size="xs"
                    class="truncate max-w-44">
                    {{ selectedPresetTitle }}
                  </UBadge>
                </div>
              </template>
              <div ref="previewContainer"
                class="flex justify-center items-center p-3 bg-neutral-50 dark:bg-neutral-900/40 rounded-lg min-h-96 overflow-hidden">
                <ToolsVideoFramePreview :preview-file="previewFile" :background="{
                  type: config.background_type || 'color',
                  color: config.background_color || '#000000',
                  boxblur: config.background_boxblur || 10,
                  file: config.background_file || null
                }" :texts="previewLabels" :subs="previewFiles" :base-size="baseSize" :frame-size="frameSize"
                  :readonly="true" />
              </div>
            </UCard>
          </div>
        </UScrollArea>
      </div>
    </div>

    <!-- Configuration Editor Modal -->
    <ToolsConfigModal v-model:open="showConfigSlideover" :preset="editingConfig" :loading="savingConfig"
      :preview-file="singleInputPath" @save="onSaveConfig" @delete="openDeletePreset" />

    <!-- Confirm deletion preset modal -->
    <LazyBaseConfirmModal v-model:open="showDeletePresetModal" :title="t('tools.confirmDeleteConfigTitle')"
      :description="t('tools.confirmDeleteConfigDesc', { name: deletePresetTarget?.title || '' })"
      confirm-icon="i-lucide-trash-2" :loading="deletingPreset" @confirm="doDeletePreset" />

    <!-- History Drawer Slideover -->
    <ToolsVideoHistorySlideover v-model="showHistorySlideover" :api="taskManager.api!" />

    <!-- Version Info Slideover -->
    <BaseResponsiveSlideover v-model:open="showVersionSlideover" :title="t('tools.versionInfo')" icon="i-lucide-info"
      side="right" :dismissible="!updating" :close="!updating">
      <template #body>
        <div v-if="loadingVersion" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="size-8 text-muted animate-spin" />
        </div>
        <div v-else class="space-y-4">
          <!-- FFmpeg Build Source selector -->
          <div class="p-3 border border-primary/30 rounded-xl bg-muted/20 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold flex items-center gap-1.5">
                <UIcon name="i-lucide-server" class="size-4 text-primary" />
                {{ t('tools.ffmpegSource') }}
              </span>
              <UBadge v-if="ffmpegSource === 'btbn'" color="success" variant="subtle" size="xs">
                Font load support
              </UBadge>
              <UBadge v-else color="neutral" variant="subtle" size="xs">
                Official release
              </UBadge>
            </div>
            <USelect v-model="ffmpegSource" :items="ffmpegSourceOptions" class="w-full"
              :disabled="updating || controlsDisabled" @update:model-value="onSourceChange" />
          </div>

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
                  {{ t('tools.latestVersion') }}: <span class="font-mono text-default font-semibold">{{
                    updateInfo.latestVersion }}</span>
                </p>
                <p v-if="updateInfo.source" class="text-[11px]">
                  {{ t('tools.ffmpegSource') }}: <span class="font-medium text-default">{{ updateInfo.source === 'btbn'
                    ? 'BtbN (GitHub)' : 'Gyan.dev' }}</span>
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
                  <span class="font-mono text-primary font-semibold shrink-0">{{ updateProgress.percent || 0 }}%</span>
                </div>
                <UProgress :model-value="updateProgress.percent || 0" color="primary" size="sm" />
              </div>
              <div class="pt-2 flex items-center gap-2">
                <UButton icon="i-lucide-download-cloud" color="primary" variant="soft" block class="flex-1"
                  :loading="updating" :disabled="updating"
                  :label="updating ? t('tools.updating') : t('tools.updateNow')" @click="performUpdate" />
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
              <UIcon name="i-simple-icons-ffmpeg" class="text-emerald-500 size-5" />
              <span>FFmpeg</span>
            </div>
            <p class="text-sm font-mono bg-black/5 dark:bg-white/5 p-3 rounded select-all break-all">
              {{ ffmpegVersions.ffmpeg || 'Unknown version' }}
            </p>
          </div>

          <div class="p-4 border border-primary/30 rounded-lg bg-muted/20">
            <div class="flex items-center gap-2 mb-2 font-semibold">
              <UIcon name="i-lucide-play-circle" class="text-blue-500 size-5" />
              <span>FFplay</span>
            </div>
            <p class="text-sm font-mono bg-black/5 dark:bg-white/5 p-3 rounded select-all break-all">
              {{ ffmpegVersions.ffplay || 'Unknown version' }}
            </p>
          </div>

          <div class="p-4 border border-primary/30 rounded-lg bg-muted/20">
            <div class="flex items-center gap-2 mb-2 font-semibold">
              <UIcon name="i-lucide-search" class="text-amber-500 size-5" />
              <span>FFprobe</span>
            </div>
            <p class="text-sm font-mono bg-black/5 dark:bg-white/5 p-3 rounded select-all break-all">
              {{ ffmpegVersions.ffprobe || 'Unknown version' }}
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
            <UIcon name="i-simple-icons-ffmpeg" class="size-4 text-emerald-500 shrink-0" />
            <span class="font-semibold text-xs text-neutral-800 dark:text-neutral-200 truncate">
              FFmpeg ({{ ffmpegSource === 'btbn' ? 'BtbN' : 'Gyan' }})
            </span>
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

    <!-- GPU Support Details Modal -->
    <BaseResponsiveModal v-model:open="showGpuModal" :title="t('tools.gpuModalTitle')"
      :description="t('tools.gpuModalDesc')" icon="i-lucide-cpu">
      <template #body>
        <div class="space-y-4 text-xs">
          <!-- Physical GPUs -->
          <div class="space-y-2">
            <div
              class="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-monitor" class="size-4 text-primary" />
              <span>{{ t('tools.physicalGpus') }}</span>
            </div>
            <div v-if="gpuSupport.gpus && gpuSupport.gpus.length" class="space-y-2">
              <div v-for="(gpu, idx) in gpuSupport.gpus" :key="idx"
                class="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60">
                <div class="p-2 rounded-md bg-primary/10 text-primary">
                  <UIcon name="i-lucide-cpu" class="size-5 shrink-0" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {{ gpu }}
                  </p>
                  <p class="text-[11px] text-neutral-500 dark:text-neutral-400">
                    GPU {{ idx + 1 }}
                  </p>
                </div>
              </div>
            </div>
            <div v-else
              class="text-xs text-neutral-400 italic p-3 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
              {{ t('tools.noPhysicalGpuFound') }}
            </div>
          </div>

          <!-- Hardware Encoders -->
          <div class="space-y-2">
            <div
              class="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-layers" class="size-4 text-primary" />
              <span>{{ t('tools.supportedEncoders') }}</span>
            </div>
            <div class="grid grid-cols-1 gap-2.5">
              <div v-for="enc in gpuEncodersList" :key="enc.id"
                class="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 flex items-start justify-between gap-3">
                <div class="space-y-1 min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{{ enc.name }}</span>
                    <code
                      class="text-xs text-neutral-500 bg-neutral-200/60 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{{ enc.codec }}</code>
                  </div>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {{ enc.description }}
                  </p>
                </div>
                <UBadge :color="enc.supported ? 'success' : 'neutral'" :variant="enc.supported ? 'subtle' : 'outline'"
                  size="sm" class="shrink-0">
                  {{ enc.supported ? t('tools.supported') : t('tools.notSupported') }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Recommendation Note -->
          <div v-if="gpuRecommendation"
            class="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary-700 dark:text-primary-300 flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-primary" />
            <span class="font-medium">{{ gpuRecommendation }}</span>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <UButton variant="ghost" color="neutral" :label="t('common.close')" @click="showGpuModal = false" />
          <UButton icon="i-lucide-refresh-cw" :label="t('tools.detectingGpu')" variant="soft" color="primary"
            :loading="gpuLoading" @click="checkGpu" />
        </div>
      </template>
    </BaseResponsiveModal>
  </BasePage>
</template>
