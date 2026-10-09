<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FfmpegConfig, ToolTask, MediaProbeResult } from '~/types'

const props = withDefaults(defineProps<{
  presets?: FfmpegConfig[]
  disabled?: boolean
  selectedEncoder?: string
  usePreset?: boolean
  selectedPresetId?: string
  selectedPresetTitle?: string
  config?: Partial<FfmpegConfig>
}>(), {
  presets: () => [],
  usePreset: false
})

const emit = defineEmits<{
  (e: 'submit', tasks: ToolTask[]): void
  (e: 'update:inputPath', path: string): void
}>()

const { t } = useI18n()
const toast = useToast()
const taskManager = useToolTaskManager('ffmpeg')

type SplitMode = 'duration' | 'parts' | 'custom'

const splitMode = ref<SplitMode>('duration')
const inputFile = ref('')
const outputDir = ref('')

const probeData = ref<MediaProbeResult | null>(null)
const probing = ref(false)

// Modes configuration
const segmentDuration = ref(60)
const partsCount = ref(3)
const customStart = ref(0)
const customDuration = ref(30)

const threads = useLocalStorage('tools:video:threads', 2)

const modeOptions = computed(() => [
  { label: t('tools.splitModeDuration'), value: 'duration', icon: 'i-lucide-clock' },
  { label: t('tools.splitModeParts'), value: 'parts', icon: 'i-lucide-divide' },
  { label: t('tools.splitModeCustom'), value: 'custom', icon: 'i-lucide-scissors' }
])

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const remSec = s % 60
  const h = Math.floor(m / 60)
  const remMin = m % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`
  }
  return `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`
}

async function onInputSelected(file: string) {
  if (file) {
    const lastSlash = file.replace(/\\/g, '/').lastIndexOf('/')
    if (lastSlash > -1) {
      outputDir.value = file.substring(0, lastSlash)
    }
    await probeVideo(file)
  }
}

watch(inputFile, async (file) => {
  emit('update:inputPath', file)
  if (file) {
    const lastSlash = file.replace(/\\/g, '/').lastIndexOf('/')
    if (lastSlash > -1 && !outputDir.value) {
      outputDir.value = file.substring(0, lastSlash)
    }
    await probeVideo(file)
  } else {
    probeData.value = null
  }
})

async function probeVideo(filePath: string) {
  if (!filePath || !taskManager.isElectron.value) {
    probeData.value = null
    return
  }
  probing.value = true
  try {
    const res = await window.electronAPI?.tools.ffmpeg.probeMedia?.(filePath)
    probeData.value = res || null
    if (res?.duration && customDuration.value > res.duration) {
      customDuration.value = Math.min(30, Math.floor(res.duration))
    }
  } catch (err) {
    console.error('Failed to probe video:', err)
  } finally {
    probing.value = false
  }
}

interface SegmentItem {
  index: number
  start: number
  duration: number
  label: string
}

const calculatedSegments = computed<SegmentItem[]>(() => {
  const dur = probeData.value?.duration || 0
  if (dur <= 0) return []

  const list: SegmentItem[] = []

  if (splitMode.value === 'duration') {
    const segDur = Math.max(1, Number(segmentDuration.value) || 60)
    let cur = 0
    let idx = 1
    while (cur < dur) {
      const thisDur = Math.min(segDur, dur - cur)
      list.push({
        index: idx,
        start: cur,
        duration: thisDur,
        label: `Part ${idx} (${formatTime(cur)} - ${formatTime(cur + thisDur)})`
      })
      cur += thisDur
      idx++
    }
  } else if (splitMode.value === 'parts') {
    const parts = Math.max(2, Math.min(50, Number(partsCount.value) || 2))
    const segDur = dur / parts
    for (let i = 0; i < parts; i++) {
      const start = i * segDur
      const thisDur = (i === parts - 1) ? (dur - start) : segDur
      list.push({
        index: i + 1,
        start,
        duration: thisDur,
        label: `Part ${i + 1} (${formatTime(start)} - ${formatTime(start + thisDur)})`
      })
    }
  } else if (splitMode.value === 'custom') {
    const start = Math.max(0, Number(customStart.value) || 0)
    const reqDur = Math.max(1, Number(customDuration.value) || 1)
    const actualDur = Math.min(reqDur, Math.max(0, dur - start))
    if (actualDur > 0) {
      list.push({
        index: 1,
        start,
        duration: actualDur,
        label: `Segment (${formatTime(start)} - ${formatTime(start + actualDur)})`
      })
    }
  }

  return list
})

const canSubmit = computed(() => {
  if (props.disabled) return false
  if (props.usePreset && !props.selectedPresetId) return false
  return !!inputFile.value && !!outputDir.value && calculatedSegments.value.length > 0
})

function buildTasks(): ToolTask[] {
  const now = new Date().toISOString()
  const chosenConfig = props.usePreset && props.selectedPresetId
    ? props.presets?.find(p => p.id === props.selectedPresetId) || props.config
    : undefined

  const op = props.usePreset ? 'split_render' : 'split'
  const baseName = inputFile.value.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || 'split'

  return calculatedSegments.value.map((seg, i) => {
    const outPath = `${outputDir.value}/${baseName}_part_${String(seg.index).padStart(2, '0')}.mp4`.replace(/\\/g, '/')
    return {
      args: [],
      options: { encoder: props.selectedEncoder },
      meta: {
        taskId: `ff-split-${Date.now()}-${i}`,
        input: inputFile.value,
        output: outPath,
        operation: op,
        splitStartTime: Number(seg.start.toFixed(3)),
        splitDuration: Number(seg.duration.toFixed(3)),
        splitSegmentName: seg.label,
        duration: Math.round(seg.duration),
        configId: chosenConfig?.id,
        configTitle: chosenConfig?.title,
        threads: threads.value,
        startedAt: now
      }
    }
  })
}

function onSubmit() {
  if (props.usePreset && !props.selectedPresetId) {
    toast.add({ title: t('tools.pleaseSelectConfig'), color: 'error' })
    return
  }
  const tasks = buildTasks()
  if (tasks.length === 0) {
    toast.add({ title: t('tools.noTasksToRun'), color: 'error' })
    return
  }
  emit('submit', tasks)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Input File Picker & Probe Info -->
    <div class="space-y-3">
      <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {{ t('tools.splitInputFile') }}
      </label>
      <BaseFilePicker v-model="inputFile" mode="file" placeholder="D:/Videos/sample.mp4"
        :title="t('tools.splitInputFile')" :disabled="disabled"
        :filters="[{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'avi', 'flv', 'wmv', 'webm', 'ts'] }]"
        @select="onInputSelected" />

      <!-- Video Info Cards -->
      <div v-if="probing" class="p-3 text-xs text-neutral-500 flex items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-primary-500" />
        {{ t('common.loading') }}
      </div>
      <div v-else-if="probeData && probeData.duration > 0" class="flex flex-wrap items-center gap-2 pt-1">
        <UBadge color="primary" variant="subtle" size="sm" class="gap-1 font-mono">
          <UIcon name="i-lucide-clock" class="w-3.5 h-3.5" />
          {{ formatTime(probeData.duration) }} ({{ probeData.duration.toFixed(1) }}s)
        </UBadge>
        <UBadge v-if="probeData.width" color="neutral" variant="subtle" size="sm" class="gap-1 font-mono">
          <UIcon name="i-lucide-monitor" class="w-3.5 h-3.5" />
          {{ probeData.width }}x{{ probeData.height }}
        </UBadge>
        <UBadge v-if="probeData.fps" color="neutral" variant="subtle" size="sm" class="gap-1 font-mono">
          {{ probeData.fps }} FPS
        </UBadge>
        <UBadge v-if="probeData.bitrate" color="neutral" variant="subtle" size="sm" class="gap-1 font-mono">
          {{ Math.round((Number(probeData.bitrate) || 0) / 1000) }} kbps
        </UBadge>
      </div>
    </div>

    <!-- Split Mode Selection -->
    <div class="flex flex-col gap-3">
      <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {{ t('tools.splitMode') }}
      </label>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button v-for="opt in modeOptions" :key="opt.value" type="button"
          class="flex items-center gap-2.5 p-3 rounded-xl border text-sm font-medium transition-all text-left"
          :class="splitMode === opt.value
            ? 'bg-primary-50/70 border-primary-500 text-primary-700 dark:bg-primary-950/40 dark:border-primary-500 dark:text-primary-300 ring-1 ring-primary-500'
            : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-700'"
          @click="splitMode = (opt.value as SplitMode)">
          <UIcon :name="opt.icon" class="w-5 h-5 shrink-0" />
          <span class="truncate">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <!-- Mode Specific Settings -->
    <div
      class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
      <div v-if="splitMode === 'duration'" class="space-y-2">
        <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.splitDuration') }}
        </label>
        <div class="flex items-center gap-3">
          <UInput v-model.number="segmentDuration" type="number" :min="1" class="w-48 font-mono" :disabled="disabled" />
          <span class="text-xs text-neutral-500">
            ≈ {{ formatTime(segmentDuration) }}
          </span>
        </div>
      </div>

      <div v-else-if="splitMode === 'parts'" class="space-y-2">
        <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.splitPartsCount') }}
        </label>
        <div class="flex items-center gap-3">
          <UInput v-model.number="partsCount" type="number" :min="2" :max="50" class="w-48 font-mono"
            :disabled="disabled" />
          <span v-if="probeData && probeData.duration > 0" class="text-xs text-neutral-500">
            ≈ {{ formatTime((Number(probeData.duration) || 0) / Math.max(1, partsCount)) }} / part
          </span>
        </div>
      </div>

      <div v-else-if="splitMode === 'custom'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            {{ t('tools.splitStartTime') }}
          </label>
          <UInput v-model.number="customStart" type="number" :min="0" class="font-mono" :disabled="disabled" />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            {{ t('tools.splitDuration') }}
          </label>
          <UInput v-model.number="customDuration" type="number" :min="1" class="font-mono" :disabled="disabled" />
        </div>
      </div>
    </div>

    <!-- Segments Preview -->
    <div v-if="calculatedSegments.length > 0" class="space-y-2">
      <div class="flex items-center justify-between text-xs text-neutral-500">
        <span>{{ t('tools.segmentsCount') }}: {{ calculatedSegments.length }}</span>
      </div>
      <div
        class="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/30">
        <div v-for="seg in calculatedSegments" :key="seg.index"
          class="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800/70 text-xs">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-scissors" class="w-3.5 h-3.5 text-primary-500" />
            <span class="font-medium text-neutral-700 dark:text-neutral-200">{{ seg.label }}</span>
          </div>
          <UBadge size="xs" color="neutral" variant="subtle" class="font-mono">
            {{ seg.duration.toFixed(1) }}s
          </UBadge>
        </div>
      </div>
    </div>

    <!-- Output Folder & Threads -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.joinSelectOutputDir') }}
        </label>
        <BaseFilePicker v-model="outputDir" mode="folder" placeholder="D:/Videos/SplitOutput"
          :title="t('tools.joinSelectOutputDir')" :disabled="disabled" />
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ t('tools.threads') }}
        </label>
        <UInput v-model.number="threads" type="number" :min="1" :max="8" :disabled="disabled" />
      </div>
    </div>

    <!-- Action Button -->
    <div class="pt-2">
      <UButton icon="i-lucide-scissors" variant="soft" color="primary" size="lg" block :disabled="!canSubmit"
        @click="onSubmit">
        {{ t('tools.splitVideo') }}
      </UButton>
    </div>
  </div>
</template>
