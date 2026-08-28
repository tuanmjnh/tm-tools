<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { z } from 'zod'
import type { ToolTask, FfmpegConfig, FfmpegLabel, FfmpegSubFile } from '~/types'
import { getMediaSize } from '~/utils/ffmpegHelper'

const { t } = useI18n()
const toast = useToast()

function onPickBatchFolder(folder: string) {
  batchPattern.value = `${folder}/*.mp4`
}

const taskManager = useToolTaskManager('ffmpeg')

// Unified states
const batchPattern = ref('')
const batchOutputPattern = ref('{dirname}/{name}_rendered.{ext}')
const batchThreads = ref(4)
const batchMatchedFiles = ref<string[]>([])
const loadingGlob = ref(false)
const starting = ref(false)

const runMode = ref<'single' | 'batch'>('single')

const modeTabs = computed(() => [{
  label: t('tools.singleRender'),
  value: 'single',
  disabled: controlsDisabled.value
}, {
  label: t('tools.batchRender'),
  value: 'batch',
  disabled: controlsDisabled.value
}])
const inputPath = ref('')
const inputMediaSize = ref<{ w: number, h: number }>({ w: 1920, h: 1080 })

watch(inputPath, async (newVal) => {
  if (newVal) {
    const size = await getMediaSize(newVal)
    inputMediaSize.value = size
  } else {
    inputMediaSize.value = { w: 1920, h: 1080 }
  }
})

const outputPath = ref('')
const duration = ref(0)

const config = ref<Partial<FfmpegConfig>>({
  title: '',
  aspect_ratio: 0,
  background_type: 'color',
  background_color: '#000000',
  background_boxblur: 10,
  background_file: '',
  center: 1,
  speed: 1,
  volume: 1,
  zoom_enable: 0,
  zoom_ratio: 1.1,
  zoom_time_start: 0,
  zoom_time_duration: 0,
  zoom_time_loop: 0,
  hflip_enable: 0,
  hflip_all: 1,
  hflip_time_start: 0,
  hflip_time_duration: 0,
  hflip_time_loop: 0,
  vflip_enable: 0,
  vflip_all: 1,
  vflip_time_start: 0,
  vflip_time_duration: 0,
  vflip_time_loop: 0,
  scale_x: 0,
  scale_y: 0,
  scale_w: 0,
  scale_h: 0,
  labels: [],
  files: [],
  subtitle: '',
  render_code: ''
})

// Data Lists
const presets = ref<FfmpegConfig[]>([])
const selectedPresetId = ref<string | null>('')
const showHistorySlideover = ref(false)
const exeState = ref<'unknown' | 'ok' | 'missing'>('unknown')

// Config slideover
const showConfigSlideover = ref(false)
const editingConfig = ref<FfmpegConfig | null>(null)
const savingConfig = ref(false)

// Confirm modals
const showDeletePresetModal = ref(false)
const deletePresetTarget = ref<FfmpegConfig | null>(null)
const deletingPreset = ref(false)

// GPU Acceleration Status
const gpuSupport = ref({ nvenc: false, amf: false, qsv: false, gpus: [] as string[] })
const selectedEncoder = ref<'cpu' | 'nvenc' | 'amf' | 'qsv'>(
  (import.meta.client ? localStorage.getItem('selected_encoder') : null) as any || 'cpu'
)
const gpuLoading = ref(false)

watch(selectedEncoder, (val) => {
  if (import.meta.client) {
    localStorage.setItem('selected_encoder', val)
  }
})

const detectedGpuString = computed(() => {
  const active = []
  if (gpuSupport.value.nvenc) active.push('NVIDIA NVENC')
  if (gpuSupport.value.amf) active.push('AMD AMF')
  if (gpuSupport.value.qsv) active.push('Intel QSV')
  return active.length > 0 ? active.join(', ') : ''
})

const encoderOptions = computed(() => {
  return [
    { label: 'CPU (Software - libx264)', value: 'cpu' },
    { label: `NVIDIA NVENC (h264_nvenc)${gpuSupport.value.nvenc ? '' : ' - ' + t('tools.notSupported')}`, value: 'nvenc', disabled: !gpuSupport.value.nvenc },
    { label: `Intel QSV (h264_qsv)${gpuSupport.value.qsv ? '' : ' - ' + t('tools.notSupported')}`, value: 'qsv', disabled: !gpuSupport.value.qsv },
    { label: `AMD AMF (h264_amf)${gpuSupport.value.amf ? '' : ' - ' + t('tools.notSupported')}`, value: 'amf', disabled: !gpuSupport.value.amf }
  ]
})

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
        else selectedEncoder.value = savedEncoder as any
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    gpuLoading.value = false
  }
}

async function loadPresets() {
  presets.value = await taskManager.api!.listFfmpegConfigs?.() || []
}

async function triggerGlob() {
  if (!batchPattern.value) {
    batchMatchedFiles.value = []
    return
  }
  loadingGlob.value = true
  try {
    const matched = await taskManager.api!.globFiles?.(batchPattern.value)
    batchMatchedFiles.value = matched || []
  } catch (e) {
    console.error(e)
  } finally {
    loadingGlob.value = false
  }
}

watch(batchPattern, () => {
  triggerGlob()
})

async function savePreset(data: Partial<FfmpegConfig>) {
  savingConfig.value = true
  try {
    const payload = JSON.parse(JSON.stringify({ ...data, flag: 1 }))
    const rs = await taskManager.api!.createFfmpegConfig?.(payload)
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      await loadPresets()
      selectedPresetId.value = rs.data?.id || ''
    } else {
      toast.add({ title: t('tools.configSaveFailed'), color: 'error' })
    }
  } finally {
    savingConfig.value = false
    showConfigSlideover.value = false
  }
}

async function updatePreset(data: Partial<FfmpegConfig>) {
  if (!editingConfig.value?.id) return
  savingConfig.value = true
  try {
    const payload = JSON.parse(JSON.stringify(data))
    const rs = await taskManager.api!.updateFfmpegConfig?.({ id: editingConfig.value.id, data: payload })
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      await loadPresets()
      const updated = presets.value.find(p => p.id === editingConfig.value?.id)
      if (updated) {
        applyPreset(updated)
      }
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

function openEditConfig(preset: FfmpegConfig) {
  editingConfig.value = preset
  showConfigSlideover.value = true
}

function onEditPresetClick() {
  const preset = presets.value.find(p => p.id === selectedPresetId.value)
  if (preset) openEditConfig(preset)
}

function onSaveConfig(data: Partial<FfmpegConfig>) {
  if (editingConfig.value?.id) updatePreset(data)
  else savePreset(data)
}

function openDeletePreset(preset: FfmpegConfig) {
  deletePresetTarget.value = preset
  showConfigSlideover.value = false
  showDeletePresetModal.value = true
}

async function doDeletePreset() {
  if (!deletePresetTarget.value) return
  const id = deletePresetTarget.value.id
  deletingPreset.value = true
  try {
    const rs = await taskManager.api!.deleteFfmpegConfig?.(id)
    if (rs?.status) {
      toast.add({ title: t('tools.configDeleted'), color: 'success' })
      await loadPresets()
      if (selectedPresetId.value === id) {
        selectedPresetId.value = ''
        resetConfig()
      }
    }
  } finally {
    deletingPreset.value = false
    showDeletePresetModal.value = false
    deletePresetTarget.value = null
  }
}

function applyPreset(preset: FfmpegConfig) {
  selectedPresetId.value = preset.id
  config.value = { ...preset }
  if (typeof preset.labels === 'string') {
    try {
      config.value.labels = JSON.parse(preset.labels)
    } catch (e) {
      config.value.labels = []
      console.error(e)
    }
  }
  if (typeof preset.files === 'string') {
    try {
      config.value.files = JSON.parse(preset.files)
    } catch (e) {
      config.value.files = []
      console.error(e)
    }
  }
  // toast.add({ title: t('tools.configApplied'), color: 'success' })
}

function resetConfig() {
  config.value = {
    title: '',
    aspect_ratio: 0,
    background_type: 'color',
    background_color: '#000000',
    background_boxblur: 10,
    background_file: '',
    center: 1,
    speed: 1,
    volume: 1,
    zoom_enable: 0,
    zoom_ratio: 1.1,
    zoom_time_start: 0,
    zoom_time_duration: 0,
    zoom_time_loop: 0,
    hflip_enable: 0,
    hflip_all: 1,
    hflip_time_start: 0,
    hflip_time_duration: 0,
    hflip_time_loop: 0,
    vflip_enable: 0,
    vflip_all: 1,
    vflip_time_start: 0,
    vflip_time_duration: 0,
    vflip_time_loop: 0,
    scale_x: 0,
    scale_y: 0,
    scale_w: 0,
    scale_h: 0,
    labels: [],
    files: [],
    subtitle: '',
    render_code: ''
  }
}

async function probeInput() {
  if (!inputPath.value) return
  const rs = await taskManager.api?.getMediaInfo?.(['-v', 'quiet', '-print_format', 'json', '-show_format', inputPath.value])
  if (rs && rs.code === 0) {
    try {
      const info = JSON.parse(rs.stdout)
      duration.value = parseFloat(info?.format?.duration || '0')
    } catch {
      duration.value = 0
    }
  }
}

const selectedPresetTitle = computed(() => {
  return presets.value.find((p: FfmpegConfig) => p.id === selectedPresetId.value)?.title || ''
})

const aspectSizes: Record<number, { w: number, h: number }> = {
  0: { w: 1920, h: 1080 },
  1: { w: 1920, h: 1080 },
  2: { w: 1080, h: 1920 },
  3: { w: 1080, h: 1080 },
  4: { w: 1440, h: 1080 }
}

const baseSize = computed(() => {
  if ((config.value.aspect_ratio ?? 0) === 0) {
    return { w: inputMediaSize.value.w, h: inputMediaSize.value.h }
  }
  const size = aspectSizes[config.value.aspect_ratio ?? 0] ?? { w: 1920, h: 1080 }
  return { w: size.w, h: size.h }
})

const frameSize = computed(() => {
  const { w, h } = baseSize.value
  const scale = Math.min(360 / w, 270 / h)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
})

const previewFile = computed(() => {
  if (!inputPath.value) return null
  return {
    path: inputPath.value,
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

const presetOptions = computed(() => {
  return presets.value.map((p: FfmpegConfig) => ({ label: p.title, value: p.id }))
})

watch(selectedPresetId, (val) => {
  if (val) {
    const preset = presets.value.find((p: FfmpegConfig) => p.id === val)
    if (preset) applyPreset(preset)
  } else {
    resetConfig()
  }
})

// Form state mirrored from refs so UForm can validate with zod.
const state = reactive({
  get inputPath() { return inputPath.value },
  set inputPath(value: string) { inputPath.value = value },
  get batchPattern() { return batchPattern.value },
  set batchPattern(value: string) { batchPattern.value = value },
  get batchOutputPattern() { return batchOutputPattern.value },
  set batchOutputPattern(value: string) { batchOutputPattern.value = value },
  get batchThreads() { return batchThreads.value },
  set batchThreads(value: number) { batchThreads.value = value },
  get configPreset() { return selectedPresetId.value || '' },
  set configPreset(value: string | null) { selectedPresetId.value = value || '' }
})

function hasMeaningfulConfig(): boolean {
  const c = config.value
  if (!c) return false
  return !!(c.title || '').trim()
    || (c.aspect_ratio || 0) > 0
    || (c.zoom_enable || 0) === 1
    || (c.hflip_enable || 0) === 1
    || (c.vflip_enable || 0) === 1
    || ((c.scale_w || 0) > 0 && (c.scale_h || 0) > 0)
    || (Array.isArray(c.labels) && c.labels.length > 0)
    || (Array.isArray(c.files) && c.files.length > 0)
    || !!(c.subtitle || '').trim()
    || (c.speed || 1) !== 1
    || (c.volume || 1) !== 1
}

const schema = computed(() => {
  const base: Record<string, ReturnType<typeof z.string>> = {
    configPreset: z.string().superRefine((val, ctx) => {
      if (!val && !hasMeaningfulConfig()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('tools.configRequired') })
      }
    })
  }
  if (runMode.value === 'single') {
    return z.object({
      ...base,
      inputPath: z.string().min(1, t('tools.pleaseSelectInput')),
      outputPath: z.string().min(1, t('tools.pleaseSelectOutput'))
    })
  }
  return z.object({
    ...base,
    batchPattern: z.string().superRefine((val, ctx) => {
      if (!val.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('tools.inputPatternRequired') })
      } else if (batchMatchedFiles.value.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('tools.noBatchItems') })
      }
    }),
    batchOutputPattern: z.string().min(1, t('tools.outputPatternRequired')),
    batchThreads: z.number().int().min(1).max(8)
  })
})

const controlsDisabled = computed(() => exeState.value === 'missing' || taskManager.processing.value || taskManager.paused.value)

function getSingleTasks(): ToolTask[] {
  const out = outputPath.value || inputPath.value.replace(/\.\w+$/, '_rendered.mp4')
  return [{
    args: [],
    options: {
      encoder: selectedEncoder.value
    },
    meta: {
      taskId: `ff-single-${Date.now()}`,
      input: inputPath.value,
      output: out,
      duration: duration.value,
      configId: selectedPresetId.value || undefined,
      configTitle: selectedPresetTitle.value,
      config: selectedPresetId.value ? undefined : config.value,
      operation: 'render',
      threads: 1,
      startedAt: new Date().toISOString()
    }
  }]
}

function getBatchTasks(): ToolTask[] {
  return batchMatchedFiles.value.map((file, i) => {
    return {
      args: [],
      options: {
        encoder: selectedEncoder.value
      },
      meta: {
        taskId: `ff-batch-${Date.now()}-${i}`,
        input: file,
        outputPattern: batchOutputPattern.value,
        duration: 0, // Probe synchronously during render or leave it to be tracked
        configId: selectedPresetId.value || undefined,
        configTitle: selectedPresetTitle.value,
        config: selectedPresetId.value ? undefined : config.value,
        operation: 'render',
        threads: batchThreads.value,
        startedAt: new Date().toISOString()
      }
    }
  })
}

async function onSubmit() {
  if (exeState.value === 'missing') {
    toast.add({ title: t('tools.executableMissing'), color: 'error' })
    return
  }
  if (runMode.value === 'single') {
    if (!inputPath.value) {
      toast.add({ title: t('tools.pleaseSelectInput'), color: 'error' })
      return
    }
    if (!outputPath.value) {
      toast.add({ title: t('tools.pleaseSelectOutput'), color: 'error' })
      return
    }
  } else {
    if (!batchPattern.value || !batchPattern.value.trim()) {
      toast.add({ title: t('tools.inputPatternRequired'), color: 'error' })
      return
    }
    if (batchMatchedFiles.value.length === 0) {
      toast.add({ title: t('tools.noBatchItems'), color: 'error' })
      return
    }
    if (!batchOutputPattern.value || !batchOutputPattern.value.trim()) {
      toast.add({ title: t('tools.outputPatternRequired'), color: 'error' })
      return
    }
  }
  if (starting.value) return
  if (taskManager.processing.value || taskManager.paused.value) return
  starting.value = true
  try {
    let tasks: ToolTask[] = []
    if (runMode.value === 'single') {
      await probeInput()
      tasks = getSingleTasks()
    } else {
      tasks = getBatchTasks()
    }

    await taskManager.initManager({
      threads: runMode.value === 'single' ? 1 : batchThreads.value,
      maxRetry: 2,
      timeout: 30 * 60 * 1000,
      delayUI: 500
    })
    await taskManager.setTasks(tasks)
    await taskManager.start()
    await taskManager.refreshStatus()
  } finally {
    starting.value = false
  }
}

function showInFolder(fullPath: string) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    window.electronAPI.showItemInFolder(fullPath)
  }
}

function updateLabels(labels: FfmpegLabel[]) {
  config.value.labels = labels
}

function openHistory() {
  showHistorySlideover.value = true
}

onMounted(async () => {
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
  <BasePage id="tools-video" :title="t('nav.video')">
    <UAlert v-if="exeState === 'missing'" icon="i-lucide-alert-triangle" color="error" variant="subtle"
      class="space-y-2 shrink-0">
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
      :title="t('tools.noElectron')" class="mb-4" />

    <!-- Main Columns -->
    <UForm id="video-form" :schema="schema" :state="state" @submit="onSubmit">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden w-full pb-4">
        <!-- Left Column: Forms, Tasks -->
        <div class="lg:col-span-2 lg:h-full lg:min-h-0 flex flex-col">
          <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
            <div class="space-y-6">
              <!-- Card 1: Main Video Form -->
              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-list-todo" class="text-primary size-5" />
                      <p class="font-semibold text-sm">
                        {{ t('tools.videoForm') }}
                      </p>
                    </div>
                    <div class="flex gap-1">
                      <UButton icon="i-lucide-history" color="warning" variant="ghost" size="sm"
                        :title="t('tools.history')" @click="openHistory" />
                    </div>
                  </div>
                </template>

                <!-- Modes Tabs: Single vs Batch -->
                <UTabs v-model="runMode" :items="modeTabs" :content="false" class="mb-6" variant="link" />

                <!-- Single Video Form -->
                <div v-if="runMode === 'single'" class="space-y-4">
                  <!-- <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> -->
                  <UFormField name="inputPath" :label="t('tools.input')">
                    <BaseFilePicker v-model="inputPath" mode="file" placeholder="D:/videos/input.mp4"
                      :disabled="controlsDisabled"
                      :filters="[{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts'] }]"
                      @change="probeInput" />
                  </UFormField>
                  <UFormField :label="t('tools.output')">
                    <BaseFilePicker v-model="outputPath" mode="save" placeholder="D:/videos/output.mp4"
                      :disabled="controlsDisabled" :filters="[{ name: 'Videos', extensions: ['mp4'] }]" />
                  </UFormField>
                  <!-- </div> -->
                </div>

                <!-- Batch Videos Form -->
                <div v-else class="space-y-4">
                  <!-- <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> -->
                  <UFormField name="batchPattern" :label="t('tools.inputPattern')">
                    <BaseFilePicker v-model="batchPattern" mode="folder" placeholder="D:/videos/*.mp4"
                      :title="t('tools.inputPattern')" :disabled="controlsDisabled" @select="onPickBatchFolder" />
                  </UFormField>
                  <UFormField name="batchOutputPattern" :label="t('tools.outputPattern')">
                    <UInput v-model="batchOutputPattern" placeholder="{dirname}/{name}_rendered.{ext}" class="w-full"
                      :disabled="controlsDisabled" :ui="{ trailing: 'pe-0.5' }" />
                  </UFormField>
                  <!-- </div> -->

                  <!-- Threads configuration (only shown for batch mode) -->
                  <div>
                    <UFormField name="batchThreads" :label="t('tools.threads')">
                      <UInput v-model.number="batchThreads" type="number" min="1" max="8" class="w-full"
                        :disabled="controlsDisabled" />
                    </UFormField>
                  </div>

                  <div v-if="batchMatchedFiles.length" class="p-4 border rounded-lg bg-muted/50">
                    <p class="font-medium text-sm mb-2">
                      {{ t('tools.batchItems') }} ({{ batchMatchedFiles.length }})
                    </p>
                    <div class="max-h-48 overflow-y-auto space-y-1">
                      <div v-for="file in batchMatchedFiles" :key="file"
                        class="text-xs font-mono p-1 hover:bg-muted truncate">
                        {{ file }}
                      </div>
                    </div>
                  </div>
                </div>

                <template #footer>
                  <!-- Action buttons -->
                  <div class="flex justify-end gap-2 w-full">
                    <UButton icon="i-lucide-play" :label="t('tools.start')" color="primary" type="submit" variant="soft"
                      :loading="starting" :disabled="!taskManager.isElectron.value || controlsDisabled" />
                    <UButton v-if="taskManager.processing.value && !taskManager.paused.value" icon="i-lucide-pause"
                      :label="t('tools.pause')" color="warning" variant="soft" @click="taskManager.pause()" />
                    <UButton v-if="taskManager.paused.value" icon="i-lucide-play" :label="t('tools.resume')"
                      color="success" variant="soft" @click="taskManager.resume()" />
                    <UButton v-if="taskManager.processing.value || taskManager.paused.value" icon="i-lucide-square"
                      :label="t('tools.stopAll')" color="error" variant="soft" @click="taskManager.stopAll()" />
                  </div>
                </template>
              </UCard>

              <!-- Task Manager Panel -->
              <ToolsTaskManagerPanel :items="taskManager.taskList.value" :total="taskManager.total.value"
                :done="taskManager.done.value" :running="taskManager.running.value"
                :processing="taskManager.processing.value" :paused="taskManager.paused.value"
                :retries="taskManager.globalRetryCount.value" :can-start="false" @refresh="taskManager.refreshStatus()"
                @pause="taskManager.pause()" @resume="taskManager.resume()" @stop-all="taskManager.stopAll()"
                @stop-task="(key) => taskManager.stopTask(key)" @open-item="showInFolder" />
            </div>
          </UScrollArea>
        </div>

        <!-- Right Column: Visual Preview & Settings -->
        <div class="lg:h-full lg:min-h-0 flex flex-col">
          <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
            <div class="space-y-6">
              <!-- Video Preview Card Component -->
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-eye" class="text-primary size-5" />
                    <p class="font-semibold text-sm">
                      {{ t('tools.previewVideo') }}
                    </p>
                  </div>
                </template>
                <div class="flex justify-center p-2 bg-neutral-50 dark:bg-neutral-900/40 rounded-lg">
                  <ToolsVideoFramePreview :preview-file="previewFile" :background="{
                    type: config.background_type || 'color',
                    color: config.background_color || '#000000',
                    boxblur: config.background_boxblur || 10,
                    file: config.background_file || null
                  }" :texts="previewLabels" :subs="previewFiles" :base-size="baseSize" :frame-size="frameSize"
                    :readonly="true" />
                </div>
              </UCard>

              <!-- Settings Card -->
              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-settings" class="text-primary size-5" />
                      <p class="font-semibold text-sm">
                        {{ t('settings.title') }}
                      </p>
                    </div>
                    <div class="flex items-center gap-2">
                      <UTooltip :text="t('tools.refresh')">
                        <UButton icon="i-lucide-rotate-ccw" size="xs" color="neutral" variant="soft"
                          :disabled="controlsDisabled" @click="resetConfig" />
                      </UTooltip>
                    </div>
                  </div>
                </template>

                <div class="space-y-5">
                  <!-- GPU Acceleration details -->
                  <div v-if="taskManager.isElectron.value"
                    class="p-3 border border-default bg-neutral-50/50 dark:bg-neutral-900/30 rounded-lg flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                      <UIcon name="i-lucide-cpu" class="text-primary text-xl shrink-0" />
                      <div class="text-xs">
                        <p class="font-semibold text-default">
                          {{ t('tools.gpuSupport') }}
                        </p>
                        <p v-if="detectedGpuString" class="text-[10px] text-success font-medium mt-0.5">
                          {{ t('tools.gpuDetected', { gpus: detectedGpuString }) }}
                        </p>
                        <p v-else class="text-[10px] text-muted mt-0.5">
                          {{ t('tools.noGpu') }}
                        </p>
                      </div>
                    </div>
                    <UButton size="xs" variant="soft" :loading="gpuLoading" @click="checkGpu">
                      {{ t('tools.refresh') }}
                    </UButton>
                  </div>

                  <!-- Encoder/GPU selection -->
                  <UFormField v-if="taskManager.isElectron.value" :label="t('tools.encoder')" name="selectedEncoder">
                    <USelect v-model="selectedEncoder" :items="encoderOptions" class="w-full"
                      :disabled="controlsDisabled" />
                  </UFormField>

                  <!-- Preset select configuration -->
                  <div class="space-y-2">
                    <p class="text-xs text-muted leading-relaxed">
                      {{ t('tools.choosePresetDesc') }}
                    </p>

                    <UFormField name="configPreset" :label="t('tools.configPreset')">
                      <div class="flex gap-2 w-full">
                        <USelectMenu v-model="selectedPresetId" :items="presetOptions" value-key="value"
                          :placeholder="t('tools.selectPreset')" clear
                          :search-input="{ placeholder: t('tools.searchPreset') }" :disabled="controlsDisabled"
                          class="flex-1">
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
                    </UFormField>
                  </div>
                </div>
              </UCard>

              <!-- Variables substitution explanation (Batch Mode only) -->
              <UCard v-if="runMode === 'batch'">
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-help-circle" class="text-primary size-4" />
                      <p class="font-semibold text-xs">
                        {{ t('tools.variables') }}
                      </p>
                    </div>
                  </div>
                </template>
                <div class="grid grid-cols-2 gap-1 text-[10px]">
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{name}</strong>: File name
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{ext}</strong>: Extension
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{dirname}</strong>: Parent dir
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{fulldir}</strong>: Full dir path
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{date}</strong>: YYYYMMDD
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{datetime}</strong>: YYYYMMDD_HHMMSS
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{config}</strong>: Preset name
                  </div>
                  <div class="p-1.5 border rounded bg-gray-50/50 dark:bg-gray-800/30 truncate">
                    <strong>{idx}</strong>: Task Index
                  </div>
                </div>
              </UCard>
            </div>
          </UScrollArea>
        </div>
      </div>
    </UForm>

    <!-- Configuration Editor Modal -->
    <ToolsConfigModal v-model:open="showConfigSlideover" :preset="editingConfig" :loading="savingConfig"
      :preview-file="inputPath" @save="onSaveConfig" @delete="openDeletePreset" />

    <!-- Confirm deletion preset modal -->
    <LazyBaseConfirmModal v-model:open="showDeletePresetModal" :title="t('tools.confirmDeleteConfigTitle')"
      :description="t('tools.confirmDeleteConfigDesc', { name: deletePresetTarget?.title || '' })"
      confirm-icon="i-lucide-trash-2" :loading="deletingPreset" @confirm="doDeletePreset" />

    <!-- History Drawer Slideover -->
    <ToolsVideoHistorySlideover v-model="showHistorySlideover" :api="taskManager.api!" />
  </BasePage>
</template>
