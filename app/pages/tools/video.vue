<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import type { ToolTask, FfmpegLabel, FfmpegSubFile } from '~/types'

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

const runMode = ref<RunMode>('single')

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
const showPreviewModal = ref(false)
const previewTargetFile = ref('')

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

const detectedGpuString = computed(() => {
  const active = []
  if (gpuSupport.value.nvenc) active.push('NVIDIA NVENC')
  if (gpuSupport.value.amf) active.push('AMD AMF')
  if (gpuSupport.value.qsv) active.push('Intel QSV')
  return active.length > 0 ? active.join(', ') : ''
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
const inputMediaSize = ref<{ w: number, h: number }>({ w: 1920, h: 1080 })

const aspectSizes: Record<number, { w: number, h: number }> = {
  0: { w: 1920, h: 1080 },
  1: { w: 1920, h: 1080 },
  2: { w: 1080, h: 1920 },
  3: { w: 1080, h: 1080 },
  4: { w: 1440, h: 1080 }
}

const baseSize = computed(() => {
  const ar = Number(config.value.aspect_ratio ?? 0)
  if (ar === 0) {
    return { w: inputMediaSize.value.w, h: inputMediaSize.value.h }
  }
  const size = aspectSizes[ar] ?? { w: 1920, h: 1080 }
  return { w: size.w, h: size.h }
})

const previewContainer = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(previewContainer)

const frameSize = computed(() => {
  const { w, h } = baseSize.value
  const maxW = containerWidth.value > 0 ? Math.max(containerWidth.value - 24, 120) : 340
  const maxH = 380
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

  starting.value = true
  try {
    const threadsCount = tasks[0]?.meta?.threads || 1
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
    window.electronAPI.showItemInFolder(fullPath)
  }
}

function onPreviewResult(filePath: string) {
  if (!filePath) return
  previewTargetFile.value = filePath
  showPreviewModal.value = true
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
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden w-full pb-4">
      <!-- Left Column: Forms, Tasks -->
      <div class="lg:col-span-2 lg:h-full lg:min-h-0 flex flex-col">
        <UScrollArea class="flex-1 min-h-0" :ui="{ viewport: 'w-full flex-col gap-6 p-1' }">
          <div class="space-y-6">
            <!-- Card 1: Main Video Operations -->
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

              <!-- Mode Selector via USelectMenu -->
              <div
                class="mb-6 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 space-y-2">
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
                  size="lg" :disabled="controlsDisabled">
                  <template #leading>
                    <UIcon :name="currentModeItem?.icon || 'i-lucide-video'" class="size-5 text-primary shrink-0" />
                  </template>
                </USelectMenu>
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
                :selected-encoder="selectedEncoder" mode="root" @submit="onTasksSubmit" />

              <ToolsVideoJoinPanel v-else-if="runMode === 'join_subfolder'" :presets="presets"
                :disabled="controlsDisabled" :selected-encoder="selectedEncoder" mode="subfolder"
                @submit="onTasksSubmit" />

              <ToolsVideoJoinPanel v-else-if="runMode === 'join_files'" :presets="presets" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" mode="files" @submit="onTasksSubmit" />

              <!-- 4. Split Videos Panel -->
              <ToolsVideoSplitPanel v-else-if="runMode === 'split'" :presets="presets" :disabled="controlsDisabled"
                :selected-encoder="selectedEncoder" @submit="onTasksSubmit" />

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
              @stop-task="(key) => taskManager.stopTask(key)" @open-file="onPreviewResult" @open-item="showInFolder" />
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
              <div ref="previewContainer"
                class="flex justify-center items-center p-3 bg-neutral-50 dark:bg-neutral-900/40 rounded-lg min-h-75 overflow-hidden">
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
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{name}</strong>: File name
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{ext}</strong>: Extension
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{dirname}</strong>: Parent dir
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{fulldir}</strong>: Full dir path
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{date}</strong>: YYYYMMDD
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{datetime}</strong>: YYYYMMDD_HHMMSS
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{config}</strong>: Preset name
                </div>
                <div class="p-1.5 border rounded bg-neutral-50/50 dark:bg-neutral-800/30 truncate">
                  <strong>{idx}</strong>: Task Index
                </div>
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

    <!-- In-App Media Preview Modal -->
    <ToolsVideoPreviewModal v-model:open="showPreviewModal" :file-path="previewTargetFile" />
  </BasePage>
</template>
