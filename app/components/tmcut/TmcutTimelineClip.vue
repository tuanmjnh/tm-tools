<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type { TmcutTimelineItem } from '~/composables/useTmcutProject'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { useTmcutMedia } from '~/composables/useTmcutMedia'

const props = withDefaults(defineProps<{
  trackType: 'video' | 'text' | 'audio'
  clip: TmcutTimelineItem
  locked?: boolean
}>(), {
  locked: false
})

const { selectedClipId, selectClip, updateClip, pushHistory, currentProject } = useTmcutProject()
const { zoom, playhead } = useTmcutPlayback()
const { findAssetBySrc, loadWaveform, mediaUrl } = useTmcutMedia()

const isSelected = computed(() => selectedClipId.value === props.clip.id)

const duration = computed(() => {
  const speed = props.clip.speed || 1
  return Math.max(0.1, (props.clip.out - props.clip.in) / speed)
})

const clipLeft = computed(() => (props.clip.offset || 0) * zoom.value)
const clipWidth = computed(() => Math.max(20, duration.value * zoom.value))

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
        bg: 'bg-neutral-600/20 border-neutral-500/60 text-neutral-200 hover:bg-neutral-600/30',
        activeBg: 'bg-neutral-600/40 border-neutral-400 ring-2 ring-neutral-400',
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
  const offset = Math.round((props.clip.in || 0) * zoom.value)
  return {
    backgroundImage: `url('${mediaUrl(strip)}')`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${stripWidth}px 100%`,
    backgroundPosition: `-${offset}px center`
  }
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

// Magnetic snap candidates (seconds): playhead + every other clip edge.
function snapCandidates(): number[] {
  const points = [0, playhead.value]
  for (const track of currentProject.value?.timeline?.tracks || []) {
    for (const item of track.items || []) {
      if (item.id === props.clip.id) continue
      const dur = (item.out - item.in) / (item.speed || 1)
      points.push(item.offset || 0, (item.offset || 0) + dur)
    }
  }
  return points
}

function applySnap(targetSec: number): number {
  const threshold = 8 / zoom.value // 8px magnetic radius
  let best = targetSec
  let bestDist = threshold
  for (const c of snapCandidates()) {
    const dist = Math.abs(c - targetSec)
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return Math.max(0, Math.round(best * 100) / 100)
}

// Drag to move clip along timeline
function onDragStart(e: MouseEvent) {
  if (e.button !== 0) return // Left click only
  selectClip(props.clip.id)
  if (props.locked) return // Locked track: select only, no move
  pushHistory()

  const startX = e.clientX
  const initialOffset = props.clip.offset || 0

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = moveEvent.clientX - startX
    const deltaSec = deltaX / zoom.value
    const newOffset = applySnap(Math.max(0, initialOffset + deltaSec))
    updateClip(props.clip.id, { offset: newOffset })
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
    const deltaSec = deltaX / zoom.value
    const deltaSourceSec = deltaSec * speed

    const newIn = Math.max(0, Math.min(props.clip.out - 0.2, initialIn + deltaSourceSec))
    const actualDeltaIn = newIn - initialIn
    const newOffset = Math.max(0, initialOffset + actualDeltaIn / speed)

    updateClip(props.clip.id, {
      in: Math.round(newIn * 100) / 100,
      offset: Math.round(newOffset * 100) / 100
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

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = moveEvent.clientX - startX
    const deltaSec = deltaX / zoom.value
    const deltaSourceSec = deltaSec * speed

    const newOut = Math.max(props.clip.in + 0.2, initialOut + deltaSourceSec)
    updateClip(props.clip.id, {
      out: Math.round(newOut * 100) / 100
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
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
  >
    <!-- Left Trim Handle -->
    <div
      class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
      :class="trackStyles.handle"
      @mousedown="onTrimLeftStart"
    >
      <div class="w-0.5 h-3 bg-black/60 rounded" />
    </div>

    <!-- Clip Content Body -->
    <div class="flex-1 px-2.5 flex items-center gap-1.5 min-w-0 overflow-hidden pointer-events-none">
      <UIcon :name="trackStyles.icon" class="size-3.5 shrink-0 opacity-80" />
      <span class="truncate font-medium text-[11px] leading-tight">
        {{ clip.text || clip.name || 'Clip' }}
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

    <!-- Right Trim Handle -->
    <div
      class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
      :class="trackStyles.handle"
      @mousedown="onTrimRightStart"
    >
      <div class="w-0.5 h-3 bg-black/60 rounded" />
    </div>
  </div>
</template>
