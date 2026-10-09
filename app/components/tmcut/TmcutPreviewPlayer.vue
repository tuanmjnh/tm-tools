<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { computeFitObjectStyle } from '~/utils/tmcut/canvas'
import { toURL } from '~/utils/ffmpegHelper'
import { previewScale } from '@tmcut-core'

const { t } = useI18n()
const { currentProject, totalDuration, hasTimelineClips, selectClip, updateClip, pushHistory } = useTmcutProject()
const {
  playhead,
  isPlaying,
  videoRef,
  activeVideoClip,
  activeTextClips,
  formatTimecode,
  seek,
  togglePlayPause,
  stepForward,
  stepBackward,
  shuttleForward,
  shuttleBackward,
  shuttleStop
} = useTmcutPlayback()

const internalVideoRef = ref<HTMLVideoElement | null>(null)

// Safe area / guides overlays (session-level editor settings)
const showSafeArea = ref(false)
const showGuides = ref(false)
const showGrid = ref(false)
const showCenter = ref(false)

const overlayToggles = computed(() => [
  { key: 'safe', label: t('tmcut.safeArea.safe'), icon: 'i-lucide-frame', active: showSafeArea.value, onSelect: () => (showSafeArea.value = !showSafeArea.value) },
  { key: 'guides', label: t('tmcut.safeArea.guides'), icon: 'i-lucide-layout-grid', active: showGuides.value, onSelect: () => (showGuides.value = !showGuides.value) },
  { key: 'grid', label: t('tmcut.safeArea.grid'), icon: 'i-lucide-grid-3x3', active: showGrid.value, onSelect: () => (showGrid.value = !showGrid.value) },
  { key: 'center', label: t('tmcut.safeArea.center'), icon: 'i-lucide-crosshair', active: showCenter.value, onSelect: () => (showCenter.value = !showCenter.value) }
])

// Expose video element to playback composable
watch(internalVideoRef, (el) => {
  videoRef.value = el
})

// Monitor box: explicit pixel dimensions preserving the canvas ratio
// (CapCut-style fixed frame). Pure CSS `aspect-ratio` breaks whenever the
// width-implied height exceeds `max-height` clamping, so the frame is
// measured instead: fit canvas WxH into the available column width and
// ~40% viewport height, whichever binds first. 16:9 renders wide, 9:16
// renders tall, 1:1 renders square — always exact.
const viewportRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)

function measureViewport() {
  if (viewportRef.value) {
    viewportWidth.value = viewportRef.value.clientWidth
  }
  viewportHeight.value = window.innerHeight
}

const monitorBoxStyle = computed(() => {
  const canvas = currentProject.value?.canvas
  const w = canvas?.width || 1920
  const h = canvas?.height || 1080
  const availW = Math.max(200, viewportWidth.value || 640)
  const availH = Math.max(200, Math.round((viewportHeight.value || 800) * 0.4))
  const scale = Math.max(0.05, Math.min(availW / w, availH / h))
  return {
    width: `${Math.floor(w * scale)}px`,
    height: `${Math.floor(h * scale)}px`,
    backgroundColor: canvas?.background?.type === 'color'
      ? canvas.background.value || '#000000'
      : undefined
  }
})

// Current media URL for active video clip.
// Reuse the same `toURL` helper as ToolsVideoFramePreview (the proven
// preview in tools/video.vue): local files are served through the
// privileged `media://local` protocol registered in electron/main.cjs.
// A raw `file://` URL is malformed for Windows paths and blocked by
// the renderer's origin/CSP rules, so the video would never load.
const currentMediaSrc = computed(() => {
  const src = activeVideoClip.value?.clip?.src
  if (!src) return ''
  return toURL(src)
})

// Sync video position to the clip in-point once metadata is loaded
function onLoadedMetadata() {
  const el = internalVideoRef.value
  if (el && activeVideoClip.value) {
    el.currentTime = activeVideoClip.value.mediaCurrentTime
  }
}

// Load-error overlay (missing file / unsupported codec)
const mediaLoadError = ref(false)
watch(currentMediaSrc, () => {
  mediaLoadError.value = false
})
function onMediaError() {
  // Ignore when there is no media to load (initial state or clip just
  // removed): the empty placeholder owns that state, not the error overlay.
  if (!currentMediaSrc.value) return
  const el = internalVideoRef.value
  // Ignore stale failures: async error events from a previous src can arrive
  // after the playhead already moved on to another clip.
  if (el && el.currentSrc && el.currentSrc !== currentMediaSrc.value) return
  mediaLoadError.value = true
}

// Track holding the active video clip (for the hide flag)
const activeVideoTrack = computed(() => {
  const clipId = activeVideoClip.value?.clip?.id
  if (!clipId) return null
  return currentProject.value?.timeline?.tracks.find(
    tr => tr.type === 'video' && tr.items?.some(i => i.id === clipId)
  ) || null
})

const isTrackHidden = computed(() => !!activeVideoTrack.value?.hidden)

// Preview audio: the video element plays the active clip's
// own audio track. Muted only when the video track itself is
// muted (timeline header toggle). Timeline audio clips still
// have no preview engine — their mute state is persisted for
// the future audio engine.
const isVideoMuted = computed(() => !!activeVideoTrack.value?.muted)
const videoVolume = computed(() => {
  const v = activeVideoClip.value?.clip?.volume
  return typeof v === 'number' ? Math.max(0, Math.min(1, v / 100)) : 1
})

// Re-sync preview after ANY timeline mutation (trim/move/split/add often
// keep the same src URL, so the src watcher alone would leave a stale
// frame when paused — no rAF loop runs to correct the drift).
function syncPreviewToPlayhead() {
  const el = internalVideoRef.value
  if (!el || !currentMediaSrc.value) return
  if (activeVideoClip.value) {
    try {
      el.currentTime = activeVideoClip.value.mediaCurrentTime
    } catch {
      // ignore seeks on unloaded metadata; loop corrects while playing
    }
    if (isPlaying.value) {
      el.play().catch(() => { })
    }
  } else {
    // Playhead sits in a gap: stop the element so a clip that is no longer
    // under the playhead never keeps playing through the gap.
    el.pause()
  }
}

watch(() => currentProject.value?.timeline, () => {
  syncPreviewToPlayhead()
}, { deep: true })

// Synchronize video element playback and seeking
watch(currentMediaSrc, (newSrc) => {
  if (internalVideoRef.value && newSrc) {
    syncPreviewToPlayhead()
  }
})

// Active video transform styles (scale, position, rotation, opacity)
const videoTransformStyle = computed(() => {
  const clip = activeVideoClip.value?.clip
  if (!clip) return {}

  const scale = (clip.scale || 100) / 100
  const x = clip.x || 0
  const y = clip.y || 0
  const rot = clip.rotation || 0
  const opacity = (clip.opacity ?? 100) / 100

  return {
    transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`,
    opacity
  }
})

// Media fitting styles (Phase 2): fit/fill/crop/stretch/smart
const videoObjectStyle = computed(() => {
  const clip = activeVideoClip.value?.clip
  if (!clip) return {}
  return computeFitObjectStyle(clip.fit || 'fit', clip.focusX ?? 0.5, clip.focusY ?? 0.5, clip.cropRect)
})

// Text overlays scale with the rendered canvas size (roadmap §65.2):
// overlay units are canvas pixels, so multiply by the preview scale instead
// of the old hardcoded 0.7 factor. The monitor wrapper enforces the canvas
// aspect ratio, so the width-axis scale applies uniformly.
const monitorRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
let resizeObserver: ResizeObserver | null = null
let viewportObserver: ResizeObserver | null = null

const textScale = computed(() =>
  previewScale(containerWidth.value, currentProject.value?.canvas?.width || 0)
)

function textOverlayStyle(textClip: {
  id: string
  color?: string
  fontSize?: number
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  text?: string
}) {
  const scale = textScale.value
  return {
    color: textClip.color || '#ffffff',
    fontSize: `${(textClip.fontSize || 36) * scale}px`,
    transform: `translate(${(textClip.x || 0) * scale}px, ${(textClip.y || 0) * scale}px) scale(${(textClip.scale || 100) / 100}) rotate(${textClip.rotation || 0}deg)`,
    opacity: (textClip.opacity ?? 100) / 100
  }
}

// Drag text overlays directly in preview (CapCut-style). Overlay units are
// canvas pixels, so pointer deltas divide by the preview scale.
let suppressCanvasClickUntil = 0

function onTextMouseDown(e: MouseEvent, textClip: { id: string, x?: number, y?: number }) {
  if (e.button !== 0) return
  e.stopPropagation()
  selectClip(textClip.id)
  pushHistory()
  const startX = e.clientX
  const startY = e.clientY
  const initialX = textClip.x || 0
  const initialY = textClip.y || 0
  let moved = false

  function onMouseMove(moveEvent: MouseEvent) {
    if (!moved && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 3) return
    moved = true
    suppressCanvasClickUntil = Date.now() + 250
    const scale = textScale.value || 1
    updateClip(textClip.id, {
      x: Math.round((initialX + (moveEvent.clientX - startX) / scale) * 10) / 10,
      y: Math.round((initialY + (moveEvent.clientY - startY) / scale) * 10) / 10
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onCanvasClick() {
  if (Date.now() < suppressCanvasClickUntil) return
  togglePlayPause()
}

// Playback shortcuts: Space play/pause, arrow step, J-K-L shuttle
// (no-op when the timeline is empty)
function handleKeydown(e: KeyboardEvent) {
  if (!hasTimelineClips.value) return
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlayPause()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    stepBackward(e.shiftKey ? 5 : 1)
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    stepForward(e.shiftKey ? 5 : 1)
  } else if (e.code === 'KeyJ' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shuttleBackward()
  } else if (e.code === 'KeyK' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shuttleStop()
  } else if (e.code === 'KeyL' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shuttleForward()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', measureViewport)
  measureViewport()
  if (monitorRef.value) {
    containerWidth.value = monitorRef.value.clientWidth
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) containerWidth.value = width
    })
    resizeObserver.observe(monitorRef.value)
  }
  if (viewportRef.value) {
    viewportWidth.value = viewportRef.value.clientWidth
    viewportObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) viewportWidth.value = width
    })
    viewportObserver.observe(viewportRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', measureViewport)
  resizeObserver?.disconnect()
  resizeObserver = null
  viewportObserver?.disconnect()
  viewportObserver = null
})
</script>

<template>
  <div ref="viewportRef" class="flex flex-col items-center justify-center w-full max-w-full">
    <!-- Monitor Canvas Wrapper (explicit ratio-bound size, see monitorBoxStyle) -->
    <div
      ref="monitorRef"
      class="relative bg-black rounded-lg border border-neutral-800 shadow-2xl overflow-hidden select-none"
      :style="monitorBoxStyle"
      :title="isPlaying ? t('tmcut.player.pause') : t('tmcut.player.play')"
      @click="onCanvasClick"
    >
      <!-- HTML5 Video Element (served via media://local protocol,
           same as ToolsVideoFramePreview in tools/video.vue) -->
      <video
        v-show="currentMediaSrc && !isTrackHidden"
        ref="internalVideoRef"
        :src="currentMediaSrc"
        class="w-full h-full pointer-events-none transition-transform duration-75"
        :style="{ ...videoObjectStyle, ...videoTransformStyle }"
        :muted="isVideoMuted"
        :volume="videoVolume"
        preload="auto"
        playsinline
        @loadedmetadata="onLoadedMetadata"
        @error="onMediaError"
      />

      <!-- Hidden-track badge (CapCut eye-off state) -->
      <div
        v-if="isTrackHidden && currentMediaSrc"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500 select-none"
      >
        <UIcon name="i-lucide-eye-off" class="size-10 opacity-40" />
        <span class="text-xs">{{ t('tmcut.player.trackHidden') }}</span>
      </div>

      <!-- Media load error overlay (only when a src was actually attempted) -->
      <div
        v-if="mediaLoadError && currentMediaSrc"
        class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-red-950/70 backdrop-blur-xs p-4 text-center select-none"
      >
        <UIcon name="i-lucide-alert-triangle" class="size-8 text-red-400 animate-pulse" />
        <p class="text-xs font-semibold text-red-200">
          {{ t('tmcut.player.loadError') }}
        </p>
        <p class="text-[10px] font-mono text-red-300/80 break-all max-w-full">
          {{ activeVideoClip?.clip?.src }}
        </p>
      </div>

      <!-- Safe Area / Guides / Grid / Center Overlays (Phase 2) -->
      <div
        v-if="showSafeArea"
        class="absolute pointer-events-none border border-dashed border-emerald-400/60"
        style="inset: 2.5%"
      />
      <div
        v-if="showSafeArea"
        class="absolute pointer-events-none border border-dashed border-amber-400/60"
        style="inset: 5%"
      />
      <div v-if="showGuides" class="absolute inset-0 pointer-events-none">
        <div class="absolute top-0 bottom-0 left-1/3 w-px bg-primary/40" />
        <div class="absolute top-0 bottom-0 left-2/3 w-px bg-primary/40" />
        <div class="absolute left-0 right-0 top-1/3 h-px bg-primary/40" />
        <div class="absolute left-0 right-0 top-2/3 h-px bg-primary/40" />
      </div>
      <div
        v-if="showGrid"
        class="absolute inset-0 pointer-events-none opacity-30"
        style="background-image: linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px); background-size: 10% 10%;"
      />
      <div v-if="showCenter" class="absolute inset-0 pointer-events-none flex items-center justify-center">
        <UIcon name="i-lucide-crosshair" class="size-6 text-red-400/70" />
      </div>

      <!-- Empty / Standby Canvas Placeholder -->
      <div
        v-if="!currentMediaSrc"
        class="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 gap-2 p-6 text-center"
      >
        <UIcon name="i-lucide-clapperboard" class="size-12 opacity-30 text-primary" />
        <span class="text-xs font-medium text-neutral-500">
          {{ t('tmcut.player.noVideoAtPlayhead', { time: formatTimecode(playhead) }) }}
        </span>
        <span class="text-[10px] text-neutral-600 font-mono">
          {{ currentProject?.canvas?.width }} x {{ currentProject?.canvas?.height }}
        </span>
      </div>

      <!-- Text Overlays (draggable in preview; explicit top-left anchor:
           absolute-without-offsets would collapse to the static position
           and get clipped by overflow-hidden) -->
      <div
        v-for="textClip in activeTextClips"
        :key="textClip.id"
        class="absolute left-0 top-0 font-bold text-center leading-tight drop-shadow-md select-none cursor-move hover:ring-1 hover:ring-primary/60 rounded"
        :style="textOverlayStyle(textClip)"
        @mousedown="onTextMouseDown($event, textClip)"
      >
        {{ textClip.text }}
      </div>
    </div>

    <!-- Safe Area Overlay Toggles -->
    <div class="w-full mt-3 flex items-center justify-center gap-1.5">
      <UButton
        v-for="toggle in overlayToggles"
        :key="toggle.key"
        :icon="toggle.icon"
        size="xs"
        variant="soft"
        :color="toggle.active ? 'primary' : 'neutral'"
        :title="toggle.label"
        @click="toggle.onSelect()"
      />
    </div>

    <!-- Transport Controls Bar (disabled while timeline has no clips) -->
    <div class="w-full mt-2 flex items-center justify-between px-2 text-xs">
      <!-- Left: Jump to Beginning -->
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-skip-back"
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="!hasTimelineClips"
          :title="t('tmcut.player.jumpToStart')"
          @click="seek(0)"
        />
        <UButton
          icon="i-lucide-chevron-left"
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="!hasTimelineClips"
          :title="t('tmcut.player.stepBackward')"
          @click="stepBackward(1)"
        />
      </div>

      <!-- Center: Play/Pause & Timecode -->
      <div class="flex items-center gap-3">
        <UButton
          :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          size="sm"
          color="primary"
          variant="solid"
          class="rounded-full w-9 h-9 p-0 flex items-center justify-center shadow-lg shadow-primary/20"
          :disabled="!hasTimelineClips"
          :title="isPlaying ? t('tmcut.player.pause') : t('tmcut.player.play')"
          @click="togglePlayPause"
        />
        <div class="font-mono text-xs flex items-center gap-1">
          <span class="font-semibold text-neutral-100">{{ formatTimecode(playhead) }}</span>
          <span class="text-neutral-600">/</span>
          <span class="text-neutral-400">{{ formatTimecode(totalDuration) }}</span>
        </div>
      </div>

      <!-- Right: Jump to End & Step Forward -->
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-chevron-right"
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="!hasTimelineClips"
          :title="t('tmcut.player.stepForward')"
          @click="stepForward(1)"
        />
        <UButton
          icon="i-lucide-skip-forward"
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="!hasTimelineClips"
          :title="t('tmcut.player.jumpToEnd')"
          @click="seek(totalDuration)"
        />
      </div>
    </div>
  </div>
</template>
