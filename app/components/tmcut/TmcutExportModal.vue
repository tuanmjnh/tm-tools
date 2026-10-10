<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useToolTaskManager } from '~/composables/useToolTaskManager'
import { compileTimelineToFfmpeg } from '~/utils/tmcut/compiler'
import type { TmcutCompileMode } from '~/utils/tmcut/compiler'
import type { ToolTask } from '~/types'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { currentProject, totalDuration, timelineTransitionCount } = useTmcutProject()
const { formatTimecode, renderRange } = useTmcutPlayback()
const { findAssetBySrc, mediaUrl } = useTmcutMedia()
const taskManager = useToolTaskManager('ffmpeg')
const toast = useToast()

// ---- Output configuration (design #3) ----
const outputPath = ref('')
const mode = ref<TmcutCompileMode>('video')
const rangeMode = ref<'full' | 'inout'>('full')
const outScale = ref(1)
const fps = ref(0) // 0 = follow the canvas fps
const encoder = ref('libx264')
const quality = ref('medium') // fast | medium | high → CRF map
const audioFormat = ref<'mp3' | 'wav'>('mp3')
const audioBitrate = ref(320)

// ---- Progress / result state (unchanged pipeline) ----
const isExporting = ref(false)
const exportDone = ref(false)
const exportError = ref('')
const previewModalOpen = ref(false)
const watchFolder = ref(false)
const lastWatchedPath = ref('')

const isDesktop = computed(() => !!window.electronAPI?.tmcut)

let offRenderDone: (() => void) | null = null

function normalizeWatchPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

function stopWatching() {
  if (offRenderDone) {
    offRenderDone()
    offRenderDone = null
  }
  const api = window.electronAPI?.tmcut
  if (lastWatchedPath.value && api?.unwatchOutput) {
    api.unwatchOutput({ filePath: lastWatchedPath.value }).catch(() => {})
  }
  lastWatchedPath.value = ''
}

function startWatching(filePath: string) {
  const api = window.electronAPI?.tmcut
  if (!api?.watchOutput || !api?.onRenderDone) return
  stopWatching()
  lastWatchedPath.value = filePath
  api.watchOutput({ filePath }).catch(() => {})
  offRenderDone = api.onRenderDone((payload) => {
    if (normalizeWatchPath(payload.filePath) !== normalizeWatchPath(filePath)) return
    if (!exportDone.value) {
      isExporting.value = false
      exportDone.value = true
      toast.add({ title: t('tmcut.export.success'), color: 'success' })
    }
    stopWatching()
  })
}

// ---- Derived canvas / output info ----
const canvasW = computed(() => currentProject.value?.canvas?.width || 1920)
const canvasH = computed(() => currentProject.value?.canvas?.height || 1080)
const canvasFps = computed(() => currentProject.value?.canvas?.fps || 30)

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

const aspectLabel = computed(() => {
  const g = gcd(canvasW.value, canvasH.value) || 1
  return `${canvasW.value / g}:${canvasH.value / g}`
})

function scaledSize(scale: number): { w: number, h: number } {
  return {
    w: Math.trunc((canvasW.value * scale) / 2) * 2,
    h: Math.trunc((canvasH.value * scale) / 2) * 2
  }
}

const outputW = computed(() => scaledSize(outScale.value).w)
const outputH = computed(() => scaledSize(outScale.value).h)
const effectiveFps = computed(() => (fps.value > 0 ? fps.value : canvasFps.value))

const ext = computed(() => {
  if (mode.value === 'audio') return audioFormat.value === 'wav' ? 'wav' : 'mp3'
  return mode.value === 'gif' ? 'gif' : 'mp4'
})

const saveFilters = computed(() => {
  const name = mode.value === 'video'
    ? 'MP4 Video'
    : mode.value === 'gif'
      ? 'GIF Image'
      : audioFormat.value === 'wav' ? 'WAV Audio' : 'MP3 Audio'
  return [{ name, extensions: [ext.value] }]
})

// File name / destination split over a single outputPath (design #3 header)
const fileName = computed({
  get: () => outputPath.value.split(/[\\/]/).pop() || '',
  set: (value: string) => {
    outputPath.value = joinDir(dirName.value, value)
  }
})

const dirName = computed(() => outputPath.value.replace(/[\\/][^\\/]*$/, ''))

function joinDir(dir: string, name: string): string {
  if (!dir) return name
  const sep = dir.includes('\\') ? '\\' : '/'
  return `${dir}${sep}${name}`
}

// Keep the extension in sync when the output mode/format changes
watch([mode, audioFormat], () => {
  if (!outputPath.value || !fileName.value) return
  const base = fileName.value.replace(/\.(mp4|mov|mkv|webm|avi|m4a|mp3|wav|gif|png)$/i, '')
  const next = `${base}.${ext.value}`
  if (next !== fileName.value) fileName.value = next
})

// ---- In/Out render zone (design #3 range selector) ----
const hasRange = computed(() => !!renderRange.value)

const activeRange = computed(() => (
  rangeMode.value === 'inout' ? renderRange.value : null
))

watch(renderRange, (value) => {
  if (!value && rangeMode.value === 'inout') rangeMode.value = 'full'
})

const rangeLabel = computed(() => {
  const range = renderRange.value
  if (!range) return t('tmcut.export.rangeInOutEmpty')
  return t('tmcut.export.rangeInOut', {
    in: formatTimecode(range.start),
    out: formatTimecode(range.end)
  })
})

// ---- Specs (duration / estimated size / audio) ----
const outputDuration = computed(() => {
  const range = activeRange.value
  return range ? range.end - range.start : totalDuration.value
})

const estimatedSize = computed<string | null>(() => {
  if (mode.value === 'gif') return null
  const duration = outputDuration.value
  if (duration <= 0) return null
  let videoMbps = 0
  if (mode.value === 'video') {
    // Rough pre-render heuristic (~0.07 bits/pixel/frame at CRF22, scaled
    // by CRF) — always displayed with a "~" prefix in the UI.
    const crfBits = quality.value === 'high' ? 1.55 : quality.value === 'fast' ? 0.6 : 1
    videoMbps = ((outputW.value * outputH.value * effectiveFps.value * 0.07) / 1e6) * crfBits
  }
  const audioMbps = mode.value === 'audio'
    ? (audioFormat.value === 'wav' ? 1.536 : audioBitrate.value / 1000)
    : 0.192
  const mb = ((videoMbps + audioMbps) * duration) / 8
  return `~${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`
})

const audioSpecValue = computed(() => {
  if (mode.value === 'gif') return '—'
  if (mode.value === 'audio') {
    return audioFormat.value === 'wav'
      ? t('tmcut.export.audioWavSpec')
      : t('tmcut.export.audioMp3Spec', { kbps: audioBitrate.value })
  }
  return t('tmcut.export.audioVideoSpec')
})

// ---- Poster preview (first video clip's cached cover thumb) ----
const posterUrl = computed(() => {
  const videoTrack = currentProject.value?.timeline?.tracks.find(tr => tr.type === 'video')
  const clip = videoTrack?.items.find(c => !!c.src)
  if (!clip?.src) return ''
  const asset = findAssetBySrc(clip.src)
  return asset?.thumbPath ? mediaUrl(asset.thumbPath) : ''
})

// ---- Select options ----
const qualityOptions = computed(() => [
  { label: t('tmcut.export.qualityFast'), value: 'fast', crf: 26 },
  { label: t('tmcut.export.qualityMedium'), value: 'medium', crf: 22 },
  { label: t('tmcut.export.qualityHigh'), value: 'high', crf: 18 }
])

const encoderCards = computed(() => [
  { value: 'libx264', label: t('tmcut.export.encoderCpu'), icon: 'i-lucide-cpu' },
  { value: 'h264_nvenc', label: t('tmcut.export.encoderGpu'), icon: 'i-lucide-zap' }
])

const modeTabs = computed(() => [
  { value: 'video' as const, label: t('tmcut.export.modeVideo'), icon: 'i-lucide-video' },
  { value: 'audio' as const, label: t('tmcut.export.modeAudio'), icon: 'i-lucide-audio-lines' },
  { value: 'gif' as const, label: t('tmcut.export.modeGif'), icon: 'i-lucide-image' }
])

const scaleOptions = [0.5, 1, 1.5, 2]

const fpsOptions = computed(() => {
  const values = [24, 25, 30, 50, 60]
  if (!values.includes(canvasFps.value)) values.unshift(canvasFps.value)
  return values.map(n => ({
    value: String(n),
    label: n === canvasFps.value ? t('tmcut.export.fpsCanvas', { n }) : `${n} fps`
  }))
})

const fpsValue = computed(() => String(effectiveFps.value))

const hwInfo = computed(() => ({
  label: encoder.value === 'h264_nvenc'
    ? t('tmcut.export.encoderGpu')
    : t('tmcut.export.encoderCpu'),
  desc: encoder.value === 'h264_nvenc'
    ? t('tmcut.export.hwGpuDesc')
    : t('tmcut.export.hwCpuDesc')
}))

// ---- Current task / progress ----
const activeTask = computed(() => taskManager.taskList.value[0])

const progressPercent = computed(() => activeTask.value?.progress ?? 0)

const exportSpeed = computed(() => (activeTask.value?.speed ? `${activeTask.value.speed}` : ''))

// Remaining time from the encoder speed reported by the ffmpeg task
const etaText = computed(() => {
  if (!isExporting.value) return ''
  const speed = parseFloat(String(activeTask.value?.speed ?? ''))
  if (!isFinite(speed) || speed <= 0 || outputDuration.value <= 0) return ''
  const remain = ((1 - progressPercent.value / 100) * outputDuration.value) / speed
  return formatTimecode(remain)
})

onMounted(() => {
  taskManager.setupListeners()
})

onUnmounted(() => {
  stopWatching()
})

// Initialize default output path when opened
watch(open, (isOpen) => {
  if (isOpen) {
    exportDone.value = false
    exportError.value = ''
    if (!outputPath.value) {
      const sanitizedName = (currentProject.value?.name || 'TMCut_Video').replace(/[/\\:*?"<>|]/g, '_')
      outputPath.value = `D:/${sanitizedName}.${ext.value}`
    }
  } else {
    stopWatching()
  }
})

// Watch for task completion
watch(
  () => activeTask.value?.status,
  (status) => {
    if (isExporting.value) {
      if (status === 'done') {
        isExporting.value = false
        exportDone.value = true
        toast.add({ title: t('tmcut.export.success'), color: 'success' })
      } else if (status === 'failed') {
        isExporting.value = false
        exportError.value = activeTask.value?.error || t('tmcut.export.errorDesc')
        toast.add({ title: t('tmcut.export.failed'), description: exportError.value, color: 'error' })
      }
    }
  }
)

async function startExport() {
  if (!currentProject.value) return
  if (!isDesktop.value) {
    toast.add({ title: t('tmcut.export.desktopOnly'), color: 'warning' })
    return
  }
  if (!outputPath.value || !fileName.value.trim()) {
    toast.add({ title: t('tmcut.export.specifyPath'), color: 'error' })
    return
  }

  isExporting.value = true
  exportDone.value = false
  exportError.value = ''

  try {
    const qualityItem = qualityOptions.value.find(q => q.value === quality.value)
    const compileResult = compileTimelineToFfmpeg(currentProject.value, outputPath.value, {
      encoder: encoder.value,
      crf: qualityItem?.crf || 22,
      mode: mode.value,
      range: activeRange.value,
      outScale: outScale.value,
      outFps: mode.value === 'video' ? effectiveFps.value : undefined,
      audioBitrate: audioBitrate.value
    })

    const task: ToolTask = {
      args: compileResult.args,
      meta: {
        taskId: `tmcut-${Date.now()}`,
        output: outputPath.value,
        duration: compileResult.duration,
        threads: 1,
        startedAt: new Date().toISOString()
      }
    }

    await taskManager.initManager({
      threads: 1,
      maxRetry: 0,
      timeout: 30 * 60 * 1000
    })

    await taskManager.setTasks([task])
    await taskManager.start()
    await taskManager.refreshStatus()
    if (watchFolder.value && isDesktop.value) {
      startWatching(outputPath.value)
    }
  } catch (err: unknown) {
    isExporting.value = false
    exportError.value = err instanceof Error ? err.message : String(err)
    toast.add({ title: t('tmcut.export.compilerError'), description: exportError.value, color: 'error' })
  }
}

async function cancelExport() {
  await taskManager.stopAll()
  stopWatching()
  isExporting.value = false
}

function openResultFile() {
  if (outputPath.value && window.electronAPI?.openPath) {
    window.electronAPI.openPath(outputPath.value)
  }
}

function openResultFolder() {
  if (outputPath.value && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(outputPath.value)
  }
}

function previewResultDirectly() {
  previewModalOpen.value = true
}
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'w-[calc(100%-2rem)] max-w-5xl' }"
  >
    <template #content>
      <div class="flex flex-col max-h-[90vh] overflow-hidden rounded-xl bg-neutral-950 border border-neutral-800 shadow-2xl">
        <!-- HEADER: title + master badge + file name & destination grid -->
        <div class="px-5 py-4 bg-neutral-900 border-b border-neutral-800 flex flex-col gap-3 shrink-0">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-7 h-7 rounded bg-primary/15 flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-clapperboard" class="size-4 text-primary" />
              </div>
              <div class="flex items-baseline gap-2 min-w-0">
                <h2 class="text-base font-semibold text-neutral-100 truncate">
                  {{ t('tmcut.export.title') }}
                </h2>
                <span class="px-1.5 py-0.5 rounded bg-neutral-800 text-primary text-[10px] font-medium tracking-wide shrink-0">
                  {{ t('tmcut.export.badgeMaster') }}
                </span>
              </div>
            </div>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="open = false"
            />
          </div>

          <!-- File name (7) + destination (5) -->
          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-12 sm:col-span-7 flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 focus-within:border-primary/50 transition-colors">
              <span class="text-xs text-neutral-400 whitespace-nowrap">{{ t('tmcut.export.fileName') }}:</span>
              <UInput
                v-model="fileName"
                size="sm"
                class="flex-1 min-w-0"
                :ui="{ base: 'border-0 bg-transparent focus:ring-0' }"
              />
              <span class="font-mono text-[11px] text-neutral-500">.{{ ext }}</span>
            </div>
            <div class="col-span-12 sm:col-span-5 flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 focus-within:border-primary/50 transition-colors">
              <UIcon name="i-lucide-folder-open" class="size-4 text-neutral-500 shrink-0" />
              <BaseFilePicker
                v-model="outputPath"
                mode="save"
                size="sm"
                readonly
                class="flex-1 min-w-0"
                :placeholder="t('tmcut.export.outputPath')"
                :filters="saveFilters"
                :title="t('tmcut.export.outputPath')"
              />
            </div>
          </div>

          <!-- Watch folder -->
          <label class="flex items-center gap-2.5 cursor-pointer select-none">
            <UCheckbox v-model="watchFolder" :disabled="isExporting" size="sm" />
            <UIcon name="i-lucide-folder-eye" class="size-3.5 text-primary" />
            <span class="text-xs text-neutral-300 font-medium">
              {{ t('tmcut.export.watchFolder') }} · {{ t('tmcut.export.watchFolderHint') }}
            </span>
          </label>

          <!-- Honest badge (roadmap B3): transitions blend in the editor
               preview, but export blends them only once the xfade render
               lands — until then these points export as hard cuts. -->
          <div
            v-if="timelineTransitionCount > 0 && mode !== 'audio'"
            class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          >
            <UIcon name="i-lucide-alert-triangle" class="size-4 text-amber-400 shrink-0 mt-0.5" />
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-xs font-medium text-amber-300">
                {{ t('tmcut.export.transitionsTitle', { n: timelineTransitionCount }) }}
              </span>
              <span class="text-[11px] leading-snug text-amber-200/70">
                {{ t('tmcut.export.transitionsDesc') }}
              </span>
            </div>
          </div>
        </div>

        <!-- BODY: left specs (5) / right parameters (7) -->
        <div class="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          <!-- LEFT: poster + specs + range + hardware -->
          <div class="lg:col-span-5 p-5 flex flex-col gap-4 bg-neutral-950/60 lg:border-r border-neutral-800">
            <!-- Poster preview -->
            <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800">
              <img
                v-if="posterUrl"
                :src="posterUrl"
                alt=""
                class="w-full h-full object-cover"
              >
              <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1.5 text-neutral-600">
                <UIcon name="i-lucide-image" class="size-7" />
                <span class="text-[11px]">{{ t('tmcut.export.posterEmpty') }}</span>
              </div>
              <!-- Floating badges -->
              <div class="absolute top-2 left-2 flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur font-mono text-[10px] text-primary tracking-wider">
                  {{ outputW }}×{{ outputH }}
                </span>
                <span class="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-neutral-200">
                  {{ aspectLabel }}
                </span>
              </div>
              <div class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur font-mono text-[11px] text-primary">
                {{ formatTimecode(outputDuration) }}
              </div>
            </div>

            <!-- Specs snapshot -->
            <div class="grid grid-cols-2 gap-3 p-3.5 bg-neutral-900 rounded-lg border border-neutral-800">
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase tracking-wider text-neutral-500">{{ t('tmcut.export.specDuration') }}</span>
                <span class="font-mono text-sm text-neutral-100 font-semibold">{{ formatTimecode(outputDuration) }}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase tracking-wider text-neutral-500">{{ t('tmcut.export.specSize') }}</span>
                <span class="text-sm text-primary font-bold">{{ estimatedSize ?? '—' }}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase tracking-wider text-neutral-500">{{ t('tmcut.export.projectResolution') }}</span>
                <span class="font-mono text-[11px] text-neutral-300">{{ canvasW }} × {{ canvasH }} px</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] uppercase tracking-wider text-neutral-500">{{ t('tmcut.export.specAudio') }}</span>
                <span class="font-mono text-[11px] text-neutral-300">{{ audioSpecValue }}</span>
              </div>
            </div>

            <!-- Export range selector (In/Out zone) -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-neutral-400 flex items-center gap-1.5">
                <UIcon name="i-lucide-clock" class="size-3.5" />
                {{ t('tmcut.export.rangeLabel') }}
              </label>
              <div class="grid grid-cols-2 gap-1.5 p-1 bg-neutral-900 rounded-lg border border-neutral-800">
                <button
                  type="button"
                  class="py-1.5 px-2 rounded text-xs font-semibold transition-colors"
                  :class="rangeMode === 'full'
                    ? 'bg-neutral-800 text-primary shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                  @click="rangeMode = 'full'"
                >
                  {{ t('tmcut.export.rangeFull') }}
                </button>
                <button
                  type="button"
                  class="py-1.5 px-2 rounded text-xs font-medium transition-colors"
                  :class="!hasRange
                    ? 'text-neutral-600 cursor-not-allowed'
                    : rangeMode === 'inout'
                      ? 'bg-neutral-800 text-primary shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                  :disabled="!hasRange"
                  @click="rangeMode = 'inout'"
                >
                  {{ rangeLabel }}
                </button>
              </div>
              <p class="text-[10px] text-neutral-600 leading-snug">
                {{ t('tmcut.export.rangeHint') }}
              </p>
            </div>

            <!-- Hardware status -->
            <div class="mt-auto p-3 rounded-lg bg-neutral-900/70 border border-neutral-800 flex items-center gap-3">
              <div class="w-8 h-8 rounded bg-primary/15 flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-memory" class="size-4 text-primary" />
              </div>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                  <span class="text-xs text-neutral-100 font-medium truncate">{{ hwInfo.label }}</span>
                </div>
                <span class="text-[10px] text-neutral-500">
                  {{ isDesktop ? hwInfo.desc : t('tmcut.export.hwDesktopOnly') }}
                </span>
              </div>
            </div>
          </div>

          <!-- RIGHT: mode tabs + parameters -->
          <div class="lg:col-span-7 p-5 flex flex-col gap-4 bg-neutral-900/20">
            <!-- Mode tabs -->
            <div class="flex items-center gap-1 p-1 bg-neutral-900 rounded-lg border border-neutral-800">
              <button
                v-for="tab in modeTabs"
                :key="tab.value"
                type="button"
                class="flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                :class="mode === tab.value
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                @click="mode = tab.value"
              >
                <UIcon :name="tab.icon" class="size-3.5" />
                {{ tab.label }}
              </button>
            </div>

            <!-- VIDEO settings -->
            <template v-if="mode === 'video'">
              <!-- Output resolution -->
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <label class="text-xs text-neutral-400 font-medium">{{ t('tmcut.export.resLabel') }}</label>
                  <span class="font-mono text-[11px] text-primary">{{ t('tmcut.export.resCurrent', { w: outputW, h: outputH }) }}</span>
                </div>
                <div class="grid grid-cols-4 gap-1.5 p-1 bg-neutral-900 rounded-lg border border-neutral-800">
                  <button
                    v-for="s in scaleOptions"
                    :key="s"
                    type="button"
                    class="py-1.5 rounded text-center transition-colors"
                    :class="outScale === s
                      ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                    @click="outScale = s"
                  >
                    <span class="block text-xs">{{ s }}×</span>
                    <span class="block text-[9px] opacity-70 font-mono">{{ scaledSize(s).w }}×{{ scaledSize(s).h }}</span>
                  </button>
                </div>
              </div>

              <!-- Frame rate + quality -->
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs text-neutral-400 font-medium">{{ t('tmcut.export.fpsLabel') }}</label>
                  <USelect
                    :model-value="fpsValue"
                    :items="fpsOptions"
                    size="sm"
                    class="w-full"
                    @update:model-value="(v: string | number) => { fps = Number(v) }"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs text-neutral-400 font-medium">{{ t('tmcut.export.quality') }}</label>
                  <div class="grid grid-cols-3 gap-1.5 p-1 bg-neutral-900 rounded-lg border border-neutral-800">
                    <button
                      v-for="q in qualityOptions"
                      :key="q.value"
                      type="button"
                      class="py-1.5 rounded text-[10px] transition-colors"
                      :class="quality === q.value
                        ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                      @click="quality = q.value"
                    >
                      {{ q.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Encoder profile cards -->
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-neutral-400 font-medium">{{ t('tmcut.export.encoderLabel') }}</label>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    v-for="card in encoderCards"
                    :key="card.value"
                    type="button"
                    class="p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors text-left"
                    :class="encoder === card.value
                      ? 'bg-neutral-800 border-primary/40'
                      : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'"
                    @click="encoder = card.value"
                  >
                    <span class="flex items-center gap-2 min-w-0">
                      <UIcon :name="card.icon" class="size-4 shrink-0" :class="encoder === card.value ? 'text-primary' : 'text-neutral-500'" />
                      <span class="text-[11px] truncate" :class="encoder === card.value ? 'text-neutral-100' : 'text-neutral-400'">
                        {{ card.label }}
                      </span>
                    </span>
                    <span
                      v-if="encoder === card.value"
                      class="text-[10px] text-primary shrink-0"
                    >●</span>
                  </button>
                </div>
              </div>
            </template>

            <!-- AUDIO settings -->
            <template v-else-if="mode === 'audio'">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs text-neutral-400 font-medium">{{ t('tmcut.export.audioFormatLabel') }}</label>
                <div class="grid grid-cols-2 gap-1.5 p-1 bg-neutral-900 rounded-lg border border-neutral-800">
                  <button
                    v-for="fmt in ([{ value: 'mp3' }, { value: 'wav' }] as const)"
                    :key="fmt.value"
                    type="button"
                    class="py-2 px-2 rounded text-left transition-colors"
                    :class="audioFormat === fmt.value
                      ? 'bg-primary/15 text-primary shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                    @click="audioFormat = fmt.value"
                  >
                    <span class="block text-xs font-semibold">{{ fmt.value.toUpperCase() }}</span>
                    <span class="block text-[9px] opacity-80">
                      {{ fmt.value === 'mp3' ? t('tmcut.export.audioFormatMp3') : t('tmcut.export.audioFormatWav') }}
                    </span>
                  </button>
                </div>
              </div>

              <div
                v-if="audioFormat === 'mp3'"
                class="flex flex-col gap-1.5"
              >
                <label class="text-xs text-neutral-400 font-medium">{{ t('tmcut.export.audioBitrateLabel') }}</label>
                <div class="grid grid-cols-3 gap-1.5 p-1 bg-neutral-900 rounded-lg border border-neutral-800">
                  <button
                    v-for="kbps in [128, 192, 320]"
                    :key="kbps"
                    type="button"
                    class="py-1.5 rounded text-[11px] transition-colors"
                    :class="audioBitrate === kbps
                      ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
                    @click="audioBitrate = kbps"
                  >
                    {{ kbps }} kbps
                  </button>
                </div>
              </div>

              <p class="text-[10px] text-neutral-600 leading-snug">
                {{ t('tmcut.export.audioNote') }}
              </p>
            </template>

            <!-- GIF settings -->
            <template v-else>
              <div class="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-start gap-2.5">
                <UIcon name="i-lucide-info" class="size-4 text-primary shrink-0 mt-0.5" />
                <p class="text-[11px] text-neutral-400 leading-snug">
                  {{ t('tmcut.export.gifNote') }}
                </p>
              </div>
            </template>
          </div>
        </div>

        <!-- FOOTER: status/estimate + actions -->
        <div class="px-5 py-3 bg-neutral-900 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <!-- Status / estimate -->
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <template v-if="isExporting">
              <div class="h-1.5 w-32 sm:w-40 bg-neutral-800 rounded-full overflow-hidden shrink-0">
                <div
                  class="h-full bg-primary transition-all duration-200"
                  :style="{ width: `${progressPercent}%` }"
                />
              </div>
              <span class="font-mono text-xs text-primary font-semibold shrink-0">{{ progressPercent }}%</span>
              <span
                v-if="etaText"
                class="text-[11px] text-neutral-400 shrink-0"
              >
                {{ t('tmcut.export.etaLabel') }} {{ etaText }}
              </span>
              <span
                v-if="exportSpeed"
                class="hidden sm:inline text-[11px] text-neutral-500 shrink-0"
              >({{ exportSpeed }})</span>
            </template>

            <template v-else-if="exportDone">
              <span class="flex items-center gap-1.5 text-xs text-emerald-400 min-w-0">
                <UIcon name="i-lucide-check-circle-2" class="size-4 shrink-0" />
                <span class="truncate">{{ t('tmcut.export.completed') }}</span>
              </span>
              <div class="flex items-center gap-1.5 shrink-0">
                <UButton
                  icon="i-lucide-play"
                  size="xs"
                  color="primary"
                  variant="soft"
                  :title="t('tmcut.export.previewNow')"
                  @click="previewResultDirectly"
                />
                <UButton
                  icon="i-lucide-external-link"
                  size="xs"
                  variant="soft"
                  color="neutral"
                  :title="t('tmcut.export.openWithApp')"
                  @click="openResultFile"
                />
                <UButton
                  icon="i-lucide-folder"
                  size="xs"
                  variant="soft"
                  color="neutral"
                  :title="t('tmcut.export.openFolder')"
                  @click="openResultFolder"
                />
              </div>
            </template>

            <template v-else-if="exportError">
              <span
                class="text-xs text-red-400 truncate"
                :title="exportError"
              >{{ exportError }}</span>
            </template>

            <template v-else>
              <span class="flex items-center gap-1.5 text-xs text-neutral-400">
                <UIcon name="i-lucide-hard-drive" class="size-3.5 text-primary" />
                {{ t('tmcut.export.labelSize') }}:
                <strong class="font-mono text-neutral-100">{{ estimatedSize ?? '—' }}</strong>
              </span>
              <span class="hidden sm:block w-1 h-1 rounded-full bg-neutral-700" />
              <span class="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400">
                {{ t('tmcut.export.specDuration') }}:
                <strong class="font-mono text-neutral-100">{{ formatTimecode(outputDuration) }}</strong>
              </span>
            </template>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 shrink-0">
            <p
              v-if="!isDesktop"
              class="text-[11px] text-amber-300/80 mr-auto"
            >
              {{ t('tmcut.export.desktopOnly') }}
            </p>
            <UButton
              v-if="!isExporting"
              variant="soft"
              color="neutral"
              size="sm"
              @click="open = false"
            >
              {{ t('tmcut.export.close') }}
            </UButton>
            <UButton
              v-if="isExporting"
              color="error"
              variant="soft"
              size="sm"
              @click="cancelExport"
            >
              {{ t('tmcut.export.cancelExport') }}
            </UButton>
            <UButton
              v-if="!isExporting && !exportDone"
              color="primary"
              variant="solid"
              icon="i-lucide-download"
              size="sm"
              @click="startExport"
            >
              {{ t('tmcut.export.startExport') }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <!-- In-App Direct Video Preview Modal -->
  <ToolsVideoPreviewModal
    v-model:open="previewModalOpen"
    :file-path="outputPath"
    :title="currentProject?.name"
  />
</template>
