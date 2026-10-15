<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { TmcutTimelineItem } from '~/composables/useTmcutProject'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useTmcutUiPrefs } from '~/composables/useTmcutUiPrefs'
import { useTmcutFrames } from '~/composables/useTmcutFrames'
import { useI18n } from 'vue-i18n'
import { propsWithKeyframes, keyframeTimes, secToTicks, ticksToSec, KNOWN_TRANSITIONS, TICKS_PER_SECOND } from '@tmcut-core'
import { clipDurationSec, clipStartSec, clipEndTicks } from '~/utils/tmcut/clipTime'

const props = withDefaults(defineProps<{
  trackType: 'video' | 'text' | 'audio'
  clip: TmcutTimelineItem
  locked?: boolean
}>(), {
  locked: false
})

const { t } = useI18n()
const { selectedClipId, selectClip, updateClip, pushHistory, snapTimeSec, relatedOffsetsFor, checkClipTransition, applyClipTransition, clearClipTransition } = useTmcutProject()
const { zoom, playhead } = useTmcutPlayback()
const { findAssetBySrc, loadWaveform, mediaUrl, isDesktop } = useTmcutMedia()
const { snapOn } = useTmcutUiPrefs()
const { available: canExtractFrames, clipFilmstrip } = useTmcutFrames()

const isSelected = computed(() => selectedClipId.value === props.clip.id)

const duration = computed(() => Math.max(0.1, clipDurationSec(props.clip)))
const clipLeft = computed(() => clipStartSec(props.clip) * zoom.value)
const clipWidth = computed(() => Math.max(20, duration.value * zoom.value))

// Keyframe diamonds (Roadmap B1): unique keyframe times across every
// animated prop, as a percentage of the clip duration (times are
// clip-local ticks). Nothing renders when the clip has no keyframes —
// no empty layer. Desktop export renders them (keyframeExpr chains);
// the web build has no FFmpeg, so web export stays preview-only.
const keyframePercents = computed<number[]>(() => {
  if (!props.clip.keyframes?.length) return []
  const seen = new Set<number>()
  for (const prop of propsWithKeyframes(props.clip)) {
    for (const t of keyframeTimes(props.clip, prop)) seen.add(t)
  }
  return [...seen]
    .sort((a, b) => a - b)
    .map(t => Math.min(100, Math.max(0, (t / TICKS_PER_SECOND) / duration.value * 100)))
})

// Track color styling
const trackStyles = computed(() => {
  switch (props.trackType) {
    case 'video':
      return {
        bg: 'bg-blue-600/20 border-blue-500/60 text-blue-200 hover:bg-blue-600/30',
        activeBg: 'bg-blue-600/40 border-blue-400 ring-2 ring-blue-400',
        handle: 'bg-blue-400',
        icon: 'i-lucide-film'
      }
    case 'text':
      return {
        bg: 'bg-amber-600/20 border-amber-500/60 text-amber-200 hover:bg-amber-600/30',
        activeBg: 'bg-amber-600/40 border-amber-400 ring-2 ring-amber-400',
        handle: 'bg-amber-400',
        icon: 'i-lucide-type'
      }
    case 'audio':
      return {
        bg: 'bg-emerald-600/20 border-emerald-500/60 text-emerald-200 hover:bg-emerald-600/30',
        activeBg: 'bg-emerald-600/40 border-emerald-400 ring-2 ring-emerald-400',
        handle: 'bg-emerald-400',
        icon: 'i-lucide-music'
      }
    default:
      return {
        bg: 'bg-neutral-300/20 dark:bg-neutral-600/20 border-neutral-500/60 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300/30 dark:hover:bg-neutral-600/30',
        activeBg: 'bg-neutral-300/40 dark:bg-neutral-600/40 border-neutral-400 ring-2 ring-neutral-400',
        handle: 'bg-neutral-400',
        icon: 'i-lucide-film'
      }
  }
})

// Video filmstrip: the cached strip (8 frames spread evenly
// across the whole source, extracted once at import via the
// tmcut IPC) is aligned to source time so each clip window
// shows its own [in, out] slice instead of one repeated
// frame, CapCut-style. The strip width maps the full source
// duration to timeline pixels at the current zoom, so the
// background offset equals the clip's source position.
// Assets without a dedicated filmstrip (web session
// thumbs, legacy records) reuse their cover still.
const filmstripStyle = computed(() => {
  if (props.trackType !== 'video' || !props.clip.src) return {}
  const asset = findAssetBySrc(props.clip.src)
  const strip = asset?.filmstripPath || asset?.thumbPath
  if (!strip) return {}
  const duration = asset.meta.durationSec || 0
  if (duration <= 0) {
    // No duration probed (web session assets): tile the still.
    return {
      backgroundImage: `url('${mediaUrl(strip)}')`,
      backgroundRepeat: 'repeat-x',
      backgroundSize: 'auto 100%',
      backgroundPosition: 'left center'
    }
  }
  const stripWidth = Math.max(1, Math.round(duration * zoom.value))
  const offset = Math.round(ticksToSec(props.clip.in || 0) * zoom.value)
  return {
    backgroundImage: `url('${mediaUrl(strip)}')`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${stripWidth}px 100%`,
    backgroundPosition: `-${offset}px center`
  }
})

// Per-clip filmstrip (roadmap G-1/R42): 8 frames sampled from THIS
// clip's own [in, out] source range (core C14 filmstripTimes through
// useTmcutFrames), drawn over the asset-level strip background above.
// Trims debounce 300ms so dragging never floods the frame cache, and
// stale resolutions drop via a request id. Failed slots stay empty so
// the asset-level fallback shows through; web sessions keep the
// fallback entirely (no extraction IPC there).
const STRIP_COUNT = 8
const stripFrames = ref<string[]>([])
let stripRequest = 0
let stripTimer: ReturnType<typeof setTimeout> | null = null

async function refreshClipStrip() {
  const request = ++stripRequest
  if (props.trackType !== 'video' || !props.clip.src || !canExtractFrames.value) {
    stripFrames.value = []
    return
  }
  // clipFilmstrip extracts at SECONDS — decode the ticks range.
  const frames = await clipFilmstrip(props.clip.src, ticksToSec(props.clip.in || 0), ticksToSec(props.clip.out), STRIP_COUNT)
  if (request !== stripRequest) return // superseded by a newer src/range
  stripFrames.value = frames
}

function scheduleClipStrip() {
  if (stripTimer) clearTimeout(stripTimer)
  stripTimer = setTimeout(() => {
    stripTimer = null
    void refreshClipStrip()
  }, 300)
}

watch(() => props.clip.src, () => {
  stripFrames.value = []
  scheduleClipStrip()
}, { immediate: true })
watch(() => [props.clip.in, props.clip.out], scheduleClipStrip, { immediate: true })
onUnmounted(() => {
  if (stripTimer) clearTimeout(stripTimer)
  stripTimer = null
  stripRequest += 1
})

// Audio waveform bars rendered inside the clip body.
const wavePoints = ref<number[]>([])
async function refreshWaveform() {
  wavePoints.value = []
  if (props.trackType !== 'audio' || !props.clip.src) return
  const asset = findAssetBySrc(props.clip.src)
  if (!asset?.waveformPath) return
  wavePoints.value = await loadWaveform(asset)
}
onMounted(() => {
  void refreshWaveform()
})
watch(() => props.clip.src, () => {
  void refreshWaveform()
})

// Magnetic snap (Roadmap C1/A6): delegates to the core engine through
// snapTimeSec — candidates are 0, the playhead, every other clip edge
// and markers, within an 8px radius at the current zoom. Controlled by
// the Magnet toolbar toggle / N key (snapOn in useTmcutUiPrefs).
// C16-R3: drag math runs in STORE TICKS end to end; the seconds seam
// sits here (snapTimeSec speaks seconds) and px converts through zoom
// (px per second).
function pxToTicks(px: number): number {
  return Math.round(secToTicks(px / zoom.value))
}

function applySnapTicks(targetTicks: number): number {
  if (!snapOn.value) return Math.max(0, Math.round(targetTicks))
  const thresholdSec = 8 / zoom.value // 8px magnetic radius
  const snapped = snapTimeSec(ticksToSec(targetTicks), playhead.value, {
    ignoreIds: [props.clip.id],
    thresholdSec
  })
  return Math.max(0, Math.round(secToTicks(snapped)))
}

// Trim floor: a source range never shrinks below 0.2s (store unit).
const MIN_SOURCE_TICKS = Math.round(0.2 * TICKS_PER_SECOND)

// Drag to move clip along timeline
function onDragStart(e: MouseEvent) {
  if (e.button !== 0) return // Left click only
  selectClip(props.clip.id)
  if (props.locked) return // Locked track: select only, no move
  pushHistory()

  const startX = e.clientX
  const initialOffset = props.clip.offset || 0
  // Grouped/linked relatives travel with the drag (roadmap B4): their
  // offsets are captured now and shifted by the same adjusted delta.
  const relatives = relatedOffsetsFor(props.clip.id)

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = moveEvent.clientX - startX
    const deltaTicks = pxToTicks(deltaX)
    const newOffset = applySnapTicks(Math.max(0, initialOffset + deltaTicks))
    const moved = newOffset - initialOffset
    updateClip(props.clip.id, { offset: newOffset })
    for (const [id, base] of Object.entries(relatives)) {
      updateClip(id, { offset: Math.max(0, base + moved) })
    }
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Left handle: trim 'in' point & offset
function onTrimLeftStart(e: MouseEvent) {
  e.stopPropagation()
  selectClip(props.clip.id)
  if (props.locked) return
  pushHistory()

  const startX = e.clientX
  const initialIn = props.clip.in
  const initialOffset = props.clip.offset || 0
  const speed = props.clip.speed || 1

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = moveEvent.clientX - startX
    const deltaTicks = pxToTicks(deltaX)
    const deltaSourceTicks = deltaTicks * speed

    let newIn = Math.max(0, Math.min(props.clip.out - MIN_SOURCE_TICKS, initialIn + deltaSourceTicks))
    const actualDeltaIn = newIn - initialIn
    let newOffset = Math.max(0, Math.round(initialOffset + actualDeltaIn / speed))
    if (snapOn.value) {
      // Snap the moving left edge (timeline start), then derive the new
      // source in-point; the clamp keeps the trim inside the source.
      newOffset = applySnapTicks(newOffset)
      newIn = Math.round(initialIn + (newOffset - initialOffset) * speed)
      if (newIn < 0 || newIn > props.clip.out - MIN_SOURCE_TICKS) {
        newIn = Math.max(0, Math.min(props.clip.out - MIN_SOURCE_TICKS, newIn))
        newOffset = Math.max(0, Math.round(initialOffset + (newIn - initialIn) / speed))
      }
    }

    updateClip(props.clip.id, {
      in: Math.round(newIn),
      offset: newOffset
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Right handle: trim 'out' point
function onTrimRightStart(e: MouseEvent) {
  e.stopPropagation()
  selectClip(props.clip.id)
  if (props.locked) return
  pushHistory()

  const startX = e.clientX
  const initialOut = props.clip.out
  const speed = props.clip.speed || 1
  const initialEnd = clipEndTicks(props.clip)

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = moveEvent.clientX - startX
    const deltaTicks = pxToTicks(deltaX)
    const deltaSourceTicks = deltaTicks * speed

    let newOut = Math.max(props.clip.in + MIN_SOURCE_TICKS, initialOut + deltaSourceTicks)
    if (snapOn.value) {
      // Snap the moving right edge (timeline end) to nearby candidates.
      const newEnd = applySnapTicks(Math.max(0, initialEnd + deltaTicks))
      newOut = Math.max(
        props.clip.in + MIN_SOURCE_TICKS,
        Math.round(props.clip.in + (newEnd - (props.clip.offset || 0)) * speed)
      )
    }
    updateClip(props.clip.id, {
      out: Math.round(newOut)
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// ===== Right-click transition menu (roadmap B3 / core C5) =====
// Video clips only: the preview crossfades VIDEO layers (two <video>
// elements, complementary ramps). Text/audio transitions are omitted —
// offering them would be a dead control (no preview, export ships in R3,
// the export modal carries the honest badge). Applying shifts the clip
// left to overlap its neighbor; "None" restores the original cut.
const DEFAULT_TRANSITION_SEC = 0.5
const DURATION_PRESETS = [0.2, 0.5, 1, 2]

const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const menuPos = ref({ x: 0, y: 0 })
// Pending selections — seeded from the clip's current transition on open.
const menuType = ref<string>(KNOWN_TRANSITIONS[0] ?? 'fade')
const menuDuration = ref(DEFAULT_TRANSITION_SEC)

const hasTransition = computed(() => (props.clip.transitionIn?.duration ?? 0) > 0)

// Applied-state label in the menu header (truthful: what is saved).
const appliedLabel = computed(() => {
  const ti = props.clip.transitionIn
  if (!ti || !(ti.duration > 0)) return t('tmcut.clipMenu.none')
  const sec = Number(ticksToSec(ti.duration).toFixed(2))
  return `${t(`tmcut.clipMenu.types.${ti.type}`)} · ${sec}s`
})

// Live validation against the CURRENT menu selections — re-runs whenever
// the timeline changes (reactive through useTmcutProject).
function reasonFor(type: string, durSec: number): string | null {
  const check = checkClipTransition(props.clip.id, type, durSec)
  return check.ok ? null : (check.reason ?? 'no-neighbor')
}

const menuReason = computed<string | null>(() =>
  menuOpen.value ? reasonFor(menuType.value, menuDuration.value) : null)

function titleFor(type: string, durSec: number): string | undefined {
  const reason = reasonFor(type, durSec)
  return reason ? t(`tmcut.clipMenu.reason.${reason}`) : undefined
}

function pickType(type: string) {
  if (props.locked) return
  menuType.value = type
  // On refusal nothing changes — menuReason below explains why.
  applyClipTransition(props.clip.id, type, menuDuration.value)
}

function pickDuration(durSec: number) {
  if (props.locked) return
  menuDuration.value = durSec
  applyClipTransition(props.clip.id, menuType.value, durSec)
}

function clearTransitionPick() {
  if (props.locked) return
  clearClipTransition(props.clip.id)
}

function onClipContextMenu(e: MouseEvent) {
  // Always suppress the browser menu over a clip (select on right-click).
  e.preventDefault()
  e.stopPropagation()
  selectClip(props.clip.id)
  if (props.locked || props.trackType !== 'video') return
  menuType.value = props.clip.transitionIn?.type ?? KNOWN_TRANSITIONS[0] ?? 'fade'
  menuDuration.value = props.clip.transitionIn
    ? ticksToSec(props.clip.transitionIn.duration)
    : DEFAULT_TRANSITION_SEC
  // Keep the panel inside the viewport (rough box size for clamping).
  menuPos.value = {
    x: Math.max(8, Math.min(e.clientX, window.innerWidth - 240)),
    y: Math.max(8, Math.min(e.clientY, window.innerHeight - 250))
  }
  menuOpen.value = true
}

// Close on outside mousedown / Escape (capture phase so clicks inside
// the panel register first).
function onDocMouseDown(e: MouseEvent) {
  if (menuEl.value && e.target instanceof Node && menuEl.value.contains(e.target)) return
  menuOpen.value = false
}
function onDocKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}
watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', onDocMouseDown, true)
    document.addEventListener('keydown', onDocKeyDown, true)
  } else {
    document.removeEventListener('mousedown', onDocMouseDown, true)
    document.removeEventListener('keydown', onDocKeyDown, true)
  }
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown, true)
  document.removeEventListener('keydown', onDocKeyDown, true)
})
</script>

<template>
  <div
    class="absolute top-1 bottom-1 rounded border cursor-move select-none flex items-center overflow-hidden transition-shadow text-xs group"
    data-tmcut-clip
    :class="[
      isSelected ? trackStyles.activeBg : trackStyles.bg,
      'border',
      locked ? 'cursor-not-allowed opacity-70' : ''
    ]"
    :style="{
      left: `${clipLeft}px`,
      width: `${clipWidth}px`,
      ...filmstripStyle
    }"
    @mousedown="onDragStart"
    @contextmenu="onClipContextMenu"
  >
    <!-- Left Trim Handle -->
    <div
      class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
      :class="trackStyles.handle"
      @mousedown="onTrimLeftStart"
    >
      <div class="w-0.5 h-3 bg-black/60 rounded" />
    </div>

    <!-- Per-clip filmstrip layer (roadmap G-1/R42): frames from this
         clip's own source range, over the asset-level strip behind.
         Empty slots stay transparent so the fallback shows through. -->
    <div v-if="trackType === 'video' && stripFrames.length > 0" class="absolute inset-0 flex pointer-events-none">
      <template v-for="(frame, index) in stripFrames" :key="index">
        <img
          v-if="frame"
          :src="mediaUrl(frame)"
          class="h-full flex-1 min-w-0 object-cover"
          draggable="false"
          alt=""
        >
        <div v-else class="h-full flex-1 min-w-0" />
      </template>
    </div>

    <!-- Clip Content Body (z-[1]: above the strip layers, below the
         keyframe diamonds z-5 and trim handles z-10) -->
    <div class="relative z-1 flex-1 px-2.5 flex items-center gap-1.5 min-w-0 overflow-hidden pointer-events-none">
      <UIcon :name="trackStyles.icon" class="size-3.5 shrink-0 opacity-80" />
      <span class="truncate font-medium text-[11px] leading-tight">
        {{ clip.text || clip.name || 'Clip' }}
      </span>
      <span
        v-if="clip.stabilize && clip.stabilizedPath"
        class="px-1 py-0.2 rounded text-[8px] font-semibold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shrink-0 uppercase tracking-wider"
        title="Stabilized"
      >
        STAB
      </span>
      <span class="ml-auto text-[9px] font-mono opacity-60 shrink-0">
        {{ duration.toFixed(1) }}s
      </span>
    </div>

    <!-- Audio waveform layer (behind content, CapCut-style) -->
    <div
      v-if="trackType === 'audio' && wavePoints.length > 0"
      class="absolute inset-0 flex items-center justify-center opacity-50 pointer-events-none px-1"
    >
      <TmcutWaveform
        :points="wavePoints"
        :width="Math.max(20, Math.floor(clipWidth) - 4)"
        :height="36"
        color="#6ee7b7"
      />
    </div>

    <!-- Keyframe diamonds (Roadmap B1): one per unique keyframe time -->
    <span
      v-for="(pct, i) in keyframePercents"
      :key="`kf-${i}`"
      class="absolute top-1/2 w-1.5 h-1.5 -translate-y-1/2 bg-white/90 rotate-45 z-5 pointer-events-none"
      :style="{ left: `calc(${pct}% - 3px)` }"
    />

    <!-- Right Trim Handle -->
    <div
      class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
      :class="trackStyles.handle"
      @mousedown="onTrimRightStart"
    >
      <div class="w-0.5 h-3 bg-black/60 rounded" />
    </div>
  </div>

  <!-- Right-click transition menu (roadmap B3): type + duration presets,
       live-validated via core C5. Teleported to the body so the timeline's
       overflow can never clip it. -->
  <Teleport to="body">
    <div
      v-if="menuOpen"
      ref="menuEl"
      class="fixed z-120 w-56 rounded-lg border border-neutral-400 dark:border-neutral-700 bg-neutral-100/95 dark:bg-neutral-900/95 shadow-2xl p-2 text-xs text-neutral-700 dark:text-neutral-200 select-none"
      :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
      @contextmenu.prevent
    >
      <div class="flex items-center justify-between gap-2 px-1 pb-1.5">
        <span class="font-semibold text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {{ t('tmcut.clipMenu.transition') }}
        </span>
        <span class="text-[10px] font-mono text-neutral-500 truncate">{{ appliedLabel }}</span>
      </div>

      <!-- Transition types (core KNOWN_TRANSITIONS — single source) -->
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="type in KNOWN_TRANSITIONS"
          :key="type"
          type="button"
          class="rounded border px-1 py-1.5 text-[10px] leading-tight transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="clip.transitionIn?.type === type
            ? 'bg-primary/30 border-primary/60 text-primary-100'
            : 'bg-neutral-200/70 dark:bg-neutral-800/70 border-neutral-400 dark:border-neutral-700 hover:bg-neutral-300/70 dark:hover:bg-neutral-700/70 text-neutral-600 dark:text-neutral-300'"
          :disabled="!!reasonFor(type, menuDuration)"
          :title="titleFor(type, menuDuration)"
          @click="pickType(type)"
        >
          {{ t(`tmcut.clipMenu.types.${type}`) }}
        </button>
      </div>

      <!-- Duration presets (apply with the pending type) -->
      <div class="mt-1.5 px-1 text-[10px] uppercase tracking-wide text-neutral-500">
        {{ t('tmcut.clipMenu.duration') }}
      </div>
      <div class="mt-1 grid grid-cols-4 gap-1">
        <button
          v-for="d in DURATION_PRESETS"
          :key="d"
          type="button"
          class="rounded border px-1 py-1 text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="Math.abs((ticksToSec(clip.transitionIn?.duration ?? 0)) - d) < 0.001
            ? 'bg-primary/30 border-primary/60 text-primary-100'
            : 'bg-neutral-200/70 dark:bg-neutral-800/70 border-neutral-400 dark:border-neutral-700 hover:bg-neutral-300/70 dark:hover:bg-neutral-700/70 text-neutral-600 dark:text-neutral-300'"
          :disabled="!!reasonFor(menuType, d)"
          :title="titleFor(menuType, d)"
          @click="pickDuration(d)"
        >
          {{ d }}s
        </button>
      </div>

      <!-- Clear + honest scope note: the desktop render pipeline maps
           these transitions to xfade, so only the web build is honest
           about being preview-only (no FFmpeg there). -->
      <div class="mt-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          class="rounded border border-neutral-400 dark:border-neutral-700 bg-neutral-200/70 dark:bg-neutral-800/70 px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300/70 dark:hover:bg-neutral-700/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!hasTransition"
          @click="clearTransitionPick"
        >
          {{ t('tmcut.clipMenu.none') }}
        </button>
        <span v-if="!isDesktop" class="text-[9px] leading-tight text-neutral-500 text-right">
          {{ t('tmcut.clipMenu.previewOnly') }}
        </span>
      </div>

      <!-- Why the current selection cannot apply -->
      <p
        v-if="menuReason"
        class="mt-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-300"
      >
        {{ t(`tmcut.clipMenu.reason.${menuReason}`) }}
      </p>
    </div>
  </Teleport>
</template>
