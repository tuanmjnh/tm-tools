<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { ToolTask, FfmpegConfig, FfmpegHistory, FfmpegLabel } from '~/types'

const { t } = useI18n()
const toast = useToast()

const { pickFolder } = useFileSystem()
const isElectron = computed(() => !!window.electronAPI?.isElectron)

async function pickBatchFolder() {
  const folder = await pickFolder({ title: t('tools.inputPattern') })
  if (!folder) return
  batchPattern.value = `${folder}/*.mp4`
  triggerGlob()
}

const taskManager = useToolTaskManager('ffmpeg')

// Run Mode
const runMode = ref<'single' | 'batch'>('single')

// Single Mode Form
const inputPath = ref('')
const outputPath = ref('')
const duration = ref(0)

// Batch Mode Form
const batchPattern = ref('')
const batchOutputPattern = ref('{dirname}/{name}_rendered.{ext}')
const batchThreads = ref(1)
const batchMatchedFiles = ref<string[]>([])
const loadingGlob = ref(false)

// Config Settings Form
const config = ref<Partial<FfmpegConfig>>({ title: '',
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

// Safe model bindings to resolve strict-null checks
const backgroundFileModel = computed({
  get: () => config.value.background_file || '',
  set: (val) => { config.value.background_file = val }
})
const subtitleModel = computed({
  get: () => config.value.subtitle || '',
  set: (val) => { config.value.subtitle = val }
})
const labelsList = computed(() => {
  if (Array.isArray(config.value.labels)) {
    return config.value.labels as FfmpegLabel[]
  }
  if (typeof config.value.labels === 'string') {
    try {
      return JSON.parse(config.value.labels) as FfmpegLabel[]
    } catch {
      // ignore
    }
  }
  return []
})

function updateLabels(labels: FfmpegLabel[]) {
  config.value.labels = labels
}

// Labels management
const newLabelText = ref('')
const newLabelSize = ref(24)
const newLabelColor = ref('#ffffff')
const newLabelX = ref(50)
const newLabelY = ref(50)

function addLabel() {
  if (!newLabelText.value.trim()) return
  if (!Array.isArray(config.value.labels)) {
    config.value.labels = []
  }
  (config.value.labels as FfmpegLabel[]).push({
    text: newLabelText.value,
    size: newLabelSize.value,
    color: newLabelColor.value,
    x: newLabelX.value,
    y: newLabelY.value
  })
  newLabelText.value = ''
  toast.add({ title: t('tools.configApplied'), color: 'success' })
}

function removeLabel(index: number) {
  if (Array.isArray(config.value.labels)) {
    config.value.labels.splice(index, 1)
  }
}

// Data Lists
const presets = ref<FfmpegConfig[]>([])
const selectedPresetId = ref<string>('')
const history = ref<FfmpegHistory[]>([])
const loadingHistory = ref(false)
const showHistory = ref(false)
const exeState = ref<'unknown' | 'ok' | 'missing'>('unknown')

// Config slideover
const showConfigSlideover = ref(false)
const editingConfig = ref<FfmpegConfig | null>(null)
const savingConfig = ref(false)

// Confirm modals
const showDeletePresetModal = ref(false)
const deletePresetTarget = ref<FfmpegConfig | null>(null)
const deletingPreset = ref(false)
const showDeleteHistoryModal = ref(false)
const deleteHistoryTarget = ref<FfmpegHistory | null>(null)
const deletingHistory = ref(false)

// GPU Acceleration Status
const gpuSupport = ref({ nvenc: false, amf: false, qsv: false })
const gpuLoading = ref(false)

const detectedGpuString = computed(() => {
  const active = []
  if (gpuSupport.value.nvenc) active.push('NVIDIA NVENC')
  if (gpuSupport.value.amf) active.push('AMD AMF')
  if (gpuSupport.value.qsv) active.push('Intel QSV')
  return active.length > 0 ? active.join(', ') : ''
})

async function refreshExe() {
  const rs = await taskManager.checkExecutable()
  if (!rs) {
    exeState.value = 'unknown'
    return
  }
  exeState.value = rs.status ? 'ok' : 'missing'
}

async function checkGpu() {
  gpuLoading.value = true
  try {
    const rs = await taskManager.api!.detectGpuSupport?.()
    if (rs) gpuSupport.value = rs
  } catch (e) {
    console.error(e)
  } finally {
    gpuLoading.value = false
  }
}

async function loadPresets() {
  presets.value = await taskManager.api!.listFfmpegConfigs?.() || []
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    history.value = await taskManager.api!.listFfmpegHistory?.(100) || []
  } finally {
    loadingHistory.value = false
  }
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
    batchMatchedFiles.value = []
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
    const payload = { ...data, flag: 1 }
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
    const rs = await taskManager.api!.updateFfmpegConfig?.({ id: editingConfig.value.id, data })
    if (rs?.status) {
      toast.add({ title: t('tools.configSaved'), color: 'success' })
      await loadPresets()
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

function onSaveConfig(data: Partial<FfmpegConfig>) {
  if (editingConfig.value?.id) updatePreset(data)
  else savePreset(data)
}

function openDeletePreset(preset: FfmpegConfig) {
  deletePresetTarget.value = preset
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
  toast.add({ title: t('tools.configApplied'), color: 'success' })
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

const presetOptions = computed(() => {
  return presets.value.map((p: FfmpegConfig) => ({ label: p.title, value: p.id }))
})

watch(selectedPresetId, (val) => {
  if (val) {
    const preset = presets.value.find((p: FfmpegConfig) => p.id === val)
    if (preset) applyPreset(preset)
  }
})

function getSingleTasks(): ToolTask[] {
  const out = outputPath.value || inputPath.value.replace(/\.\w+$/, '_rendered.mp4')
  return [{
    args: [],
    options: {},
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
      options: {},
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
  if (taskManager.processing.value || taskManager.paused.value) return

  let tasks: ToolTask[] = []
  if (runMode.value === 'single') {
    if (!inputPath.value) {
      toast.add({ title: t('global.error'), color: 'error' })
      return
    }
    await probeInput()
    tasks = getSingleTasks()
  } else {
    if (!batchMatchedFiles.value.length) {
      toast.add({ title: t('tools.noBatchItems'), color: 'error' })
      return
    }
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
}

function openDeleteHistory(h: FfmpegHistory) {
  deleteHistoryTarget.value = h
  showDeleteHistoryModal.value = true
}

async function doDeleteHistory() {
  if (!deleteHistoryTarget.value?.id) return
  const id = deleteHistoryTarget.value.id
  deletingHistory.value = true
  try {
    const rs = await taskManager.api!.deleteFfmpegHistory?.(id)
    if (rs?.status) {
      toast.add({ title: t('tools.configDeleted'), color: 'success' })
      await loadHistory()
    }
  } finally {
    deletingHistory.value = false
    showDeleteHistoryModal.value = false
    deleteHistoryTarget.value = null
  }
}

async function openFileLocation(filePath: string) {
  if (!filePath) return
  await window.electronAPI?.openPath(filePath)
}

function showInFolder(fullPath: string) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    window.electronAPI.showItemInFolder(fullPath)
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
  const s = Math.round(sec % 60)
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`
}

onMounted(async () => {
  await refreshExe()
  await taskManager.refreshStatus()
  await checkGpu()
  await loadPresets()
  taskManager.setupListeners()
})
</script>

<template>
  <BasePage id="tools-video" :title="t('nav.video')">
    <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-4 p-1' }">
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

      <!-- GPU Acceleration Status -->
      <UCard v-if="taskManager.isElectron.value">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cpu" class="text-primary text-xl" />
            <div>
              <p class="font-medium text-sm">
                {{ t('tools.gpuSupport') }}
              </p>
              <p v-if="detectedGpuString" class="text-xs text-success">
                {{ t('tools.gpuDetected', { gpus: detectedGpuString }) }}
              </p>
              <p v-else class="text-xs text-muted">
                {{ t('tools.noGpu') }}
              </p>
            </div>
          </div>
          <UButton
            size="xs"
            variant="soft"
            :loading="gpuLoading"
            @click="checkGpu"
          >
            {{ t('tools.refresh') }}
          </UButton>
        </div>
      </UCard>

      <!-- Video Preview -->
      <UCard v-if="inputPath">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-eye" class="text-primary" />
            <p class="font-semibold">
              {{ t('tools.previewVideo') }}
            </p>
          </div>
        </template>
        <div class="flex justify-center">
          <ToolsVideoPreview
            :preview-file="inputPath"
            :background="{ type: config.background_type || 'color', color: config.background_color || '#000000', boxblur: config.background_boxblur || 10, file: config.background_file || null }"
            :labels="labelsList"
            :base-size="{ w: 1920, h: 1080 }"
            :frame-size="{ w: 480, h: 270 }"
            @update:labels="updateLabels"
          />
        </div>
      </UCard>

      <!-- Main Config Options & Presets -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-sliders" class="text-primary" />
              <p class="font-semibold">
                {{ t('tools.videoForm') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <USelect
                v-model="selectedPresetId"
                :options="presetOptions"
                placeholder="Select Preset"
                class="w-48"
              />
              <UButton icon="i-lucide-save" @click="openCreateConfig" />
              <UButton icon="i-lucide-rotate-ccw" variant="soft" @click="resetConfig" />
            </div>
          </div>
        </template>

        <!-- Presets Quick list -->
        <div v-if="presets.length" class="mb-6">
          <p class="text-xs font-semibold text-muted mb-2">
            {{ t('tools.savedConfigs') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="preset in presets"
              :key="preset.id"
              size="sm"
              variant="outline"
              class="flex items-center gap-2"
              @click="applyPreset(preset)"
            >
              <span>{{ preset.title }}</span>
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                @click.stop="openEditConfig(preset)"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                @click.stop="openDeletePreset(preset)"
              />
            </UButton>
          </div>
        </div>

        <!-- FFmpeg Effects Accordion -->
        <UAccordion
          :items="[
            { label: t('tools.aspectRatio'), slot: 'aspect' },
            { label: t('tools.zoom'), slot: 'zoom' },
            { label: t('tools.flips'), slot: 'flips' },
            { label: t('tools.scale'), slot: 'scale' },
            { label: t('tools.speedVolume'), slot: 'speed' },
            { label: t('tools.labels'), slot: 'labels' },
            { label: t('tools.subtitle'), slot: 'subtitle' }
          ]"
          class="mb-6 border rounded-lg p-2"
        >
          <template #aspect>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <UFormField :label="t('tools.aspectRatio')">
                <USelect
                  v-model.number="config.aspect_ratio"
                  :options="[
                    { label: t('tools.aspectOriginal'), value: 0 },
                    { label: t('tools.aspect169'), value: 1 },
                    { label: t('tools.aspect916'), value: 2 },
                    { label: t('tools.aspect11'), value: 3 },
                    { label: t('tools.aspect43'), value: 4 }
                  ]"
                />
              </UFormField>

              <UFormField v-if="config.aspect_ratio! > 0" :label="t('tools.bgType')">
                <USelect
                  v-model="config.background_type"
                  :options="[
                    { label: 'Color', value: 'color' },
                    { label: 'Box Blur', value: 'boxblur' },
                    { label: 'Background File', value: 'file' }
                  ]"
                />
              </UFormField>

              <UFormField
                v-if="config.aspect_ratio! > 0 && config.background_type === 'color'"
                :label="t('tools.bgColor')"
              >
                <div class="flex gap-2">
                  <UInput v-model="config.background_color" type="color" class="w-12 h-9 p-0 border-0" />
                  <UInput v-model="config.background_color" placeholder="#000000" class="flex-1" />
                </div>
              </UFormField>

              <UFormField
                v-if="config.aspect_ratio! > 0 && config.background_type === 'boxblur'"
                :label="t('tools.bgBlur')"
              >
                <div class="flex items-center gap-4">
                  <USlider
                    v-model="config.background_boxblur"
                    :min="5"
                    :max="50"
                    class="flex-1"
                  />
                  <span class="text-sm font-medium w-8 text-right">{{ config.background_boxblur }}</span>
                </div>
              </UFormField>

              <UFormField
                v-if="config.aspect_ratio! > 0 && config.background_type === 'file'"
                :label="t('tools.bgFile')"
              >
                <BaseFilePicker
                  v-model="backgroundFileModel"
                  mode="file"
                  placeholder="D:/backgrounds/bg.png"
                  :filters="[{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }, { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov'] }]"
                />
              </UFormField>
            </div>
          </template>

          <template #zoom>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <div class="flex items-center gap-2">
                <UCheckbox
                  v-model="config.zoom_enable"
                  :value="1"
                  :unchecked-value="0"
                  :label="t('tools.zoomEnable')"
                />
              </div>
              <UFormField v-if="config.zoom_enable === 1" :label="t('tools.zoomRatio')">
                <div class="flex items-center gap-4">
                  <USlider
                    v-model="config.zoom_ratio"
                    :min="1.0"
                    :max="2.0"
                    :step="0.05"
                    class="flex-1"
                  />
                  <span class="text-sm font-medium w-12 text-right">{{ config.zoom_ratio }}x</span>
                </div>
              </UFormField>
            </div>
          </template>

          <template #flips>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
              <!-- HFLIP -->
              <div class="space-y-4 border-r pr-6">
                <div class="flex items-center gap-2">
                  <UCheckbox
                    v-model="config.hflip_enable"
                    :value="1"
                    :unchecked-value="0"
                    :label="t('tools.hflip')"
                  />
                </div>
                <div v-if="config.hflip_enable === 1" class="space-y-4">
                  <UCheckbox
                    v-model="config.hflip_all"
                    :value="1"
                    :unchecked-value="0"
                    :label="t('tools.flipAll')"
                  />
                  <div v-if="config.hflip_all === 0" class="grid grid-cols-2 gap-4">
                    <UFormField :label="t('tools.zoomStart')">
                      <UInput v-model.number="config.hflip_time_start" type="number" min="0" />
                    </UFormField>
                    <UFormField :label="t('tools.zoomDuration')">
                      <UInput v-model.number="config.hflip_time_duration" type="number" min="1" />
                    </UFormField>
                  </div>
                </div>
              </div>

              <!-- VFLIP -->
              <div class="space-y-4">
                <div class="flex items-center gap-2">
                  <UCheckbox
                    v-model="config.vflip_enable"
                    :value="1"
                    :unchecked-value="0"
                    :label="t('tools.vflip')"
                  />
                </div>
                <div v-if="config.vflip_enable === 1" class="space-y-4">
                  <UCheckbox
                    v-model="config.vflip_all"
                    :value="1"
                    :unchecked-value="0"
                    :label="t('tools.flipAll')"
                  />
                  <div v-if="config.vflip_all === 0" class="grid grid-cols-2 gap-4">
                    <UFormField :label="t('tools.zoomStart')">
                      <UInput v-model.number="config.vflip_time_start" type="number" min="0" />
                    </UFormField>
                    <UFormField :label="t('tools.zoomDuration')">
                      <UInput v-model.number="config.vflip_time_duration" type="number" min="1" />
                    </UFormField>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #scale>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <UFormField :label="t('tools.width')">
                <UInput
                  v-model.number="config.scale_w"
                  type="number"
                  min="0"
                  placeholder="1920"
                />
              </UFormField>
              <UFormField :label="t('tools.height')">
                <UInput
                  v-model.number="config.scale_h"
                  type="number"
                  min="0"
                  placeholder="1080"
                />
              </UFormField>
            </div>
          </template>

          <template #speed>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
              <UFormField :label="t('tools.speed')">
                <div class="flex items-center gap-4">
                  <USlider
                    v-model="config.speed"
                    :min="0.5"
                    :max="3.0"
                    :step="0.1"
                    class="flex-1"
                  />
                  <span class="text-sm font-medium w-12 text-right">{{ config.speed }}x</span>
                </div>
              </UFormField>
              <UFormField :label="t('tools.volume')">
                <div class="flex items-center gap-4">
                  <USlider
                    v-model="config.volume"
                    :min="0.0"
                    :max="3.0"
                    :step="0.1"
                    class="flex-1"
                  />
                  <span class="text-sm font-medium w-12 text-right">{{ Math.round(config.volume! * 100) }}%</span>
                </div>
              </UFormField>
            </div>
          </template>

          <template #labels>
            <div class="p-4 space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                <UFormField :label="t('tools.labelText')">
                  <UInput v-model="newLabelText" placeholder="Watermark text" />
                </UFormField>
                <UFormField :label="t('tools.labelSize')">
                  <UInput v-model.number="newLabelSize" type="number" />
                </UFormField>
                <UFormField :label="t('tools.labelColor')">
                  <UInput v-model="newLabelColor" type="color" />
                </UFormField>
                <UFormField :label="t('tools.labelX')">
                  <UInput v-model.number="newLabelX" type="number" />
                </UFormField>
                <UFormField :label="t('tools.labelY')">
                  <UInput v-model.number="newLabelY" type="number" />
                </UFormField>
              </div>
              <UButton icon="i-lucide-plus" :label="t('tools.addLabel')" @click="addLabel" />

              <div v-if="labelsList.length" class="overflow-x-auto border rounded-lg mt-4">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b bg-muted/50 text-left text-muted">
                      <th class="p-2">
                        {{ t('tools.labelText') }}
                      </th>
                      <th class="p-2">
                        {{ t('tools.labelSize') }}
                      </th>
                      <th class="p-2">
                        {{ t('tools.labelColor') }}
                      </th>
                      <th class="p-2">
                        X / Y
                      </th>
                      <th class="p-2 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(lbl, idx) in labelsList" :key="idx" class="border-b hover:bg-muted/50">
                      <td class="p-2 font-medium">
                        {{ lbl.text }}
                      </td>
                      <td class="p-2">
                        {{ lbl.size }} px
                      </td>
                      <td class="p-2 flex items-center gap-2">
                        <span class="w-4 h-4 rounded border inline-block" :style="{ backgroundColor: lbl.color }" />
                        <span>{{ lbl.color }}</span>
                      </td>
                      <td class="p-2">
                        {{ lbl.x }} / {{ lbl.y }}
                      </td>
                      <td class="p-2 text-right">
                        <UButton
                          icon="i-lucide-trash-2"
                          size="xs"
                          color="error"
                          variant="ghost"
                          @click="removeLabel(idx)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>

          <template #subtitle>
            <div class="p-4">
              <UFormField :label="t('tools.subtitleFile')">
                <BaseFilePicker
                  v-model="subtitleModel"
                  mode="file"
                  placeholder="D:/subs/subtitle.srt"
                  :filters="[{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }]"
                />
              </UFormField>
            </div>
          </template>
        </UAccordion>

        <!-- Modes Tabs: Single vs Batch -->
        <div class="flex border-b mb-6">
          <UButton
            :variant="runMode === 'single' ? 'solid' : 'ghost'"
            class="rounded-none rounded-t-lg border-b-2"
            :class="runMode === 'single' ? 'border-primary' : 'border-transparent'"
            @click="runMode = 'single'"
          >
            {{ t('tools.singleRender') }}
          </UButton>
          <UButton
            :variant="runMode === 'batch' ? 'solid' : 'ghost'"
            class="rounded-none rounded-t-lg border-b-2"
            :class="runMode === 'batch' ? 'border-primary' : 'border-transparent'"
            @click="runMode = 'batch'"
          >
            {{ t('tools.batchRender') }}
          </UButton>
        </div>

        <!-- Single Video Form -->
        <div v-if="runMode === 'single'" class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <UFormField :label="t('tools.input')">
            <BaseFilePicker
              v-model="inputPath"
              mode="file"
              placeholder="D:/videos/input.mp4"
              :filters="[{ name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts'] }]"
              @change="probeInput"
            />
          </UFormField>
          <UFormField :label="t('tools.output')">
            <BaseFilePicker
              v-model="outputPath"
              mode="save"
              placeholder="D:/videos/output.mp4"
              :filters="[{ name: 'Videos', extensions: ['mp4'] }]"
            />
          </UFormField>
        </div>

        <!-- Batch Videos Form -->
        <div v-else class="space-y-4 mb-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UFormField :label="t('tools.inputPattern')">
              <UInput
                v-model="batchPattern"
                placeholder="D:/videos/*.mp4"
                class="w-full"
                :ui="{ trailing: 'pe-1' }"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-folder-open"
                    :title="t('tools.browse')"
                    :aria-label="t('tools.browse')"
                    :disabled="!isElectron"
                    @click="pickBatchFolder"
                  />
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('tools.outputPattern')">
              <UInput v-model="batchOutputPattern" placeholder="{dirname}/{name}_rendered.{ext}" />
            </UFormField>
            <UFormField :label="t('tools.threads')">
              <UInput
                v-model.number="batchThreads"
                type="number"
                min="1"
                max="8"
                class="w-full"
              />
            </UFormField>
          </div>

          <div v-if="batchMatchedFiles.length" class="p-4 border rounded-lg bg-muted/50">
            <p class="font-medium text-sm mb-2">
              {{ t('tools.batchItems') }} ({{ batchMatchedFiles.length }})
            </p>
            <div class="max-h-48 overflow-y-auto space-y-1">
              <div v-for="file in batchMatchedFiles" :key="file" class="text-xs font-mono p-1 hover:bg-muted truncate">
                {{ file }}
              </div>
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex justify-end gap-2">
          <UButton
            icon="i-lucide-play"
            :label="t('tools.start')"
            color="primary"
            :disabled="!taskManager.isElectron.value || taskManager.processing.value || taskManager.paused.value"
            @click="onSubmit"
          />
          <UButton
            v-if="taskManager.processing.value && !taskManager.paused.value"
            icon="i-lucide-pause"
            :label="t('tools.pause')"
            color="warning"
            @click="taskManager.pause()"
          />
          <UButton
            v-if="taskManager.paused.value"
            icon="i-lucide-play"
            :label="t('tools.resume')"
            color="success"
            @click="taskManager.resume()"
          />
          <UButton
            v-if="taskManager.processing.value || taskManager.paused.value"
            icon="i-lucide-square"
            :label="t('tools.stopAll')"
            color="error"
            variant="soft"
            @click="taskManager.stopAll()"
          />
        </div>
      </UCard>

      <!-- Task Manager Panel -->
      <ToolsTaskManagerPanel
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

      <ToolsVideoConfigSlideover
        v-model:open="showConfigSlideover"
        :config="editingConfig"
        :loading="savingConfig"
        @save="onSaveConfig"
      />

      <LazyBaseConfirmModal
        v-model:open="showDeletePresetModal"
        :title="t('tools.confirmDeleteConfigTitle')"
        :description="t('tools.confirmDeleteConfigDesc', { name: deletePresetTarget?.title || '' })"
        confirm-icon="i-lucide-trash-2"
        :loading="deletingPreset"
        @confirm="doDeletePreset"
      />

      <LazyBaseConfirmModal
        v-model:open="showDeleteHistoryModal"
        :title="t('tools.confirmDeleteHistoryTitle')"
        :description="t('tools.confirmDeleteHistoryDesc')"
        confirm-icon="i-lucide-trash-2"
        :loading="deletingHistory"
        @confirm="doDeleteHistory"
      />

      <!-- Variables substitution explanation modal -->
      <UCard v-if="runMode === 'batch'">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-help-circle" class="text-primary" />
              <p class="font-semibold text-sm">
                {{ t('tools.variables') }}
              </p>
            </div>
          </div>
        </template>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          <div class="p-2 border rounded bg-muted/30">
            <strong>{name}</strong>: Video filename
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{ext}</strong>: File extension
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{dirname}</strong>: Parent folder name
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{fulldir}</strong>: Full directory path
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{date}</strong>: YYYYMMDD
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{datetime}</strong>: YYYYMMDD_HHMMSS
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{config}</strong>: Selected preset title
          </div>
          <div class="p-2 border rounded bg-muted/30">
            <strong>{idx}</strong>: Incrementing index
          </div>
        </div>
      </UCard>

      <!-- Render History -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-history" class="text-primary" />
              <p class="font-semibold">
                {{ t('tools.history') }}
              </p>
            </div>
            <UButton size="sm" variant="ghost" @click="showHistory = !showHistory; if (showHistory) loadHistory()">
              {{ showHistory ? t('tools.hide') : t('tools.show') }} {{ t('tools.history') }}
            </UButton>
          </div>
        </template>

        <div v-show="showHistory">
          <div v-if="loadingHistory" class="flex justify-center py-4">
            <UIcon name="i-lucide-loader-circle" class="size-6 text-muted animate-spin" />
          </div>
          <div v-else-if="history.length === 0" class="text-center py-8 text-muted">
            <UIcon name="i-lucide-clock" class="text-2xl mb-2" />
            <p>{{ t('tools.noHistoryVideo') }}</p>
            <UButton size="sm" class="mt-2" @click="loadHistory">
              {{ t('tools.refresh') }}
            </UButton>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b text-left text-muted">
                  <th class="p-2">
                    {{ t('tools.date') }}
                  </th>
                  <th class="p-2">
                    Input File
                  </th>
                  <th class="p-2">
                    Output File
                  </th>
                  <th class="p-2">
                    Config Preset
                  </th>
                  <th class="p-2">
                    {{ t('tools.size') }}
                  </th>
                  <th class="p-2">
                    {{ t('tools.duration') }}
                  </th>
                  <th class="p-2">
                    {{ t('tools.status') }}
                  </th>
                  <th class="p-2 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="h in history" :key="h.id" class="border-b hover:bg-muted/50">
                  <td class="p-2 text-xs">
                    {{ new Date(h.created_at).toLocaleString() }}
                  </td>
                  <td class="p-2 max-w-xs truncate text-xs" :title="h.input_file || ''">
                    {{ h.input_file ? h.input_file.split('/').pop() : '-' }}
                  </td>
                  <td class="p-2 max-w-xs truncate text-xs" :title="h.output_file || ''">
                    {{ h.output_file ? h.output_file.split('/').pop() : '-' }}
                  </td>
                  <td class="p-2 text-xs">
                    {{ h.config_title || '-' }}
                  </td>
                  <td class="p-2 text-xs">
                    {{ formatBytes(h.file_size) }}
                  </td>
                  <td class="p-2 text-xs">
                    {{ formatDuration(h.duration) }}
                  </td>
                  <td class="p-2">
                    <UBadge
                      :color="h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'warning'"
                      variant="soft"
                      size="xs"
                    >
                      {{ t('tools.' + h.status) }}
                    </UBadge>
                  </td>
                  <td class="p-2 text-right space-x-1">
                    <UButton
                      icon="i-lucide-folder-open"
                      size="xs"
                      variant="ghost"
                      @click="openFileLocation(h.output_file || h.output_path || '')"
                    />
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      color="error"
                      variant="ghost"
                      @click="openDeleteHistory(h)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </UCard>
    </UScrollArea>
  </BasePage>
</template>
