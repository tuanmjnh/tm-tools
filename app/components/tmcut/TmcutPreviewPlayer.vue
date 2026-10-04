<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { computeFitObjectStyle } from '~/utils/tmcut/canvas'

const { t } = useI18n()
const { currentProject, totalDuration } = useTmcutProject()
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
  stepBackward
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

// Aspect ratio class based on canvas
const aspectRatioStyle = computed(() => {
  const w = currentProject.value?.canvas?.width || 1920
  const h = currentProject.value?.canvas?.height || 1080
  return {
    aspectRatio: `${w} / ${h}`,
    backgroundColor: currentProject.value?.canvas?.background?.type === 'color'
      ? currentProject.value.canvas.background.value || '#000000'
      : undefined
  }
})

// Current media URL for active video clip
const currentMediaSrc = computed(() => {
  if (!activeVideoClip.value?.clip?.src) return ''
  const src = activeVideoClip.value.clip.src
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:') || src.startsWith('data:')) {
    return src
  }
  return `media://?file=${encodeURIComponent(src.replace(/\\/g, '/'))}`
})

// Synchronize video element playback and seeking
watch(currentMediaSrc, (newSrc) => {
  if (internalVideoRef.value && newSrc) {
    internalVideoRef.value.src = newSrc
    if (activeVideoClip.value) {
      internalVideoRef.value.currentTime = activeVideoClip.value.mediaCurrentTime
    }
    if (isPlaying.value) {
      internalVideoRef.value.play().catch(() => {})
    }
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

// Spacebar shortcut for Play/Pause
function handleKeydown(e: KeyboardEvent) {
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
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full max-w-full">
    <!-- Monitor Canvas Wrapper -->
    <div
      class="relative w-full max-h-[46vh] bg-black rounded-lg border border-neutral-800 shadow-2xl overflow-hidden flex items-center justify-center select-none"
      :style="aspectRatioStyle"
    >
      <!-- HTML5 Video Element -->
      <video
        v-show="currentMediaSrc"
        ref="internalVideoRef"
        class="w-full h-full pointer-events-none transition-transform duration-75"
        :style="{ ...videoObjectStyle, ...videoTransformStyle }"
        preload="auto"
        playsinline
      />

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
      <div
        v-if="showGuides"
        class="absolute inset-0 pointer-events-none"
      >
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

      <!-- Text Overlays -->
      <div
        v-for="textClip in activeTextClips"
        :key="textClip.id"
        class="absolute pointer-events-none font-bold text-center leading-tight drop-shadow-md select-none"
        :style="{
          color: textClip.color || '#ffffff',
          fontSize: `${(textClip.fontSize || 36) * 0.7}px`,
          transform: `translate(${textClip.x || 0}px, ${textClip.y || 0}px) scale(${(textClip.scale || 100) / 100}) rotate(${textClip.rotation || 0}deg)`,
          opacity: (textClip.opacity ?? 100) / 100
        }"
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

    <!-- Transport Controls Bar -->
    <div class="w-full mt-2 flex items-center justify-between px-2 text-xs">
      <!-- Left: Jump to Beginning -->
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-skip-back"
          size="xs"
          variant="soft"
          color="neutral"
          :title="t('tmcut.player.jumpToStart')"
          @click="seek(0)"
        />
        <UButton
          icon="i-lucide-chevron-left"
          size="xs"
          variant="soft"
          color="neutral"
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
          :title="t('tmcut.player.stepForward')"
          @click="stepForward(1)"
        />
        <UButton
          icon="i-lucide-skip-forward"
          size="xs"
          variant="soft"
          color="neutral"
          :title="t('tmcut.player.jumpToEnd')"
          @click="seek(totalDuration)"
        />
      </div>
    </div>
  </div>
</template>
