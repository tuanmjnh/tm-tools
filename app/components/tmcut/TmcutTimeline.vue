<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { useFileSystem } from '~/composables/useFileSystem'
import { useTmcutMedia } from '~/composables/useTmcutMedia'
import { useTmcutUiPrefs } from '~/composables/useTmcutUiPrefs'
import { toURL } from '~/utils/ffmpegHelper'

const { t } = useI18n()

const {
  currentProject,
  selectedClipId,
  totalDuration,
  addClipToTrack,
  removeClip,
  splitClip,
  undo,
  redo,
  canUndo,
  canRedo,
  toggleTrackMute,
  toggleTrackLock,
  toggleTrackHidden,
  clipboard,
  rippleMode,
  copySelectedClips,
  pasteClipboardAt,
  duplicateSelectedClips,
  rippleDeleteSelected,
  flushDiskSave
} = useTmcutProject()

const {
  playhead,
  zoom,
  formatTimecode,
  seek,
  pause,
  renderIn,
  renderOut,
  renderRange,
  setRenderMark,
  clearRenderMarks
} = useTmcutPlayback()

const { pickFile, pickWebFiles } = useFileSystem()
const { isDesktop, importWebFiles } = useTmcutMedia()
const { tip, shortcutsOpen } = useTmcutUiPrefs()
const toast = useToast()

const tracksContainerRef = ref<HTMLDivElement | null>(null)
const rulerRef = ref<HTMLDivElement | null>(null)

// Total width of the timeline in pixels
const timelineWidth = computed(() => {
  return Math.max(1200, (totalDuration.value + 10) * zoom.value)
})

// Generate tick markers for ruler (every 1s, with major ticks every 5s)
const rulerTicks = computed(() => {
  const count = Math.ceil(totalDuration.value + 10)
  const ticks = []
  // Depending on zoom, choose interval
  const step = zoom.value < 30 ? 5 : zoom.value < 60 ? 2 : 1

  for (let s = 0; s <= count; s += step) {
    ticks.push({
      sec: s,
      left: s * zoom.value,
      isMajor: s % 5 === 0,
      label: formatTimecode(s).split('.')[0] // exclude frames on ruler label
    })
  }
  return ticks
})

// Playhead position in pixels
const playheadLeft = computed(() => playhead.value * zoom.value)

// In/Out render zone (export zone) overlay geometry — shown on the ruler
// (flags + tint) and across the track rows (transparent highlight band).
const renderZoneStyle = computed(() => {
  const range = renderRange.value
  if (!range) return null
  return {
    left: `${range.start * zoom.value}px`,
    width: `${Math.max(2, (range.end - range.start) * zoom.value)}px`
  }
})

const markInStyle = computed(() => (
  renderIn.value !== null ? { left: `${renderIn.value * zoom.value}px` } : null
))

const markOutStyle = computed(() => (
  renderOut.value !== null ? { left: `${renderOut.value * zoom.value}px` } : null
))

// Handle scrubbing on ruler (pauses playback, like other NLEs)
function onRulerMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  pause()
  updatePlayheadFromPointer(e)

  function onMouseMove(moveEvent: MouseEvent) {
    updatePlayheadFromPointer(moveEvent)
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function updatePlayheadFromPointer(e: MouseEvent) {
  if (!rulerRef.value) return
  // The ruler lives INSIDE the scroll container, so its
  // viewport rect already includes the horizontal scroll
  // offset. Adding scrollLeft here double-counted it and
  // shifted every scrub by the scroll distance (the
  // "playhead jumps / misaligns after scrolling" bug).
  const rect = rulerRef.value.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const targetSec = Math.max(0, clickX / zoom.value)
  seek(targetSec)
}

// Click empty track background to seek (CapCut-style). Clip interactions
// are guarded by [data-tmcut-clip] so drags/trims never trigger a seek.
function onTracksBackgroundMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('[data-tmcut-clip]')) return
  pause()
  updatePlayheadFromPointer(e)
}

// Split clip action
function handleSplit() {
  if (selectedClipId.value) {
    const success = splitClip(selectedClipId.value, playhead.value)
    if (success) {
      toast.add({ title: t('tmcut.timelineActions.splitClipAtPlayhead'), color: 'success' })
      return
    }
  }

  // Fallback: look for clip under playhead in video track
  const videoTrack = currentProject.value?.timeline?.tracks.find(t => t.type === 'video')
  if (videoTrack) {
    for (const clip of videoTrack.items) {
      const dur = (clip.out - clip.in) / (clip.speed || 1)
      if (playhead.value > clip.offset && playhead.value < clip.offset + dur) {
        splitClip(clip.id, playhead.value)
        toast.add({ title: t('tmcut.timelineActions.splitVideoAtPlayhead'), color: 'success' })
        return
      }
    }
  }

  toast.add({ title: t('tmcut.timelineActions.placePlayheadToSplit'), color: 'warning' })
}

// Delete clip action (ripple mode closes the gap via the core engine)
function handleDelete() {
  if (!selectedClipId.value) return
  if (rippleMode.value) {
    if (rippleDeleteSelected()) {
      // toast.add({ title: t('tmcut.timelineActions.clipDeleted'), color: 'success' })
    }
    return
  }
  removeClip(selectedClipId.value)
  // toast.add({ title: t('tmcut.timelineActions.clipDeleted'), color: 'success' })
}

// Clipboard actions (core copy/paste/duplicate, merged back by clip id)
function handleCopy() {
  if (copySelectedClips()) {
    toast.add({ title: t('tmcut.timelineActions.copied'), color: 'success' })
  }
}

function handlePaste() {
  const ids = pasteClipboardAt(playhead.value)
  if (ids.length > 0) {
    toast.add({ title: t('tmcut.timelineActions.pasted'), color: 'success' })
  }
}

function handleDuplicate() {
  const ids = duplicateSelectedClips()
  if (ids.length > 0) {
    toast.add({ title: t('tmcut.timelineActions.duplicated'), color: 'success' })
  }
}

// Add local video file
async function handleAddVideo() {
  if (!isDesktop.value) {
    const files = await pickWebFiles(['mp4', 'mov', 'webm', 'mkv', 'avi'], true)
    if (files.length === 0) return
    const imported = await importWebFiles(files)
    for (const asset of imported) {
      if (asset.kind !== 'video') continue
      addClipToTrack('video', {
        name: asset.name,
        src: asset.path,
        in: 0,
        out: asset.meta.durationSec > 0 ? Math.round(asset.meta.durationSec * 100) / 100 : 10,
        speed: 1
      })
      toast.add({ title: t('tmcut.timelineActions.videoAdded', { name: asset.name }), color: 'success' })
    }
    return
  }
  const filePath = await pickFile({
    title: t('tmcut.timelineActions.selectVideoToAdd'),
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] }]
  })

  if (!filePath || typeof filePath !== 'string') return

  // Probe media metadata using HTML5 Video element
  // (toURL serves the file through the privileged media://local protocol)
  const mediaUrl = toURL(filePath)
  const tempVideo = document.createElement('video')
  tempVideo.src = mediaUrl
  tempVideo.preload = 'metadata'

  tempVideo.onloadedmetadata = () => {
    const dur = tempVideo.duration || 10
    const filename = filePath.split(/[\\/]/).pop() || 'Video'
    addClipToTrack('video', {
      name: filename,
      src: filePath,
      in: 0,
      out: Math.round(dur * 100) / 100,
      speed: 1
    })
    toast.add({ title: t('tmcut.timelineActions.videoAdded', { name: filename }), color: 'success' })
  }

  tempVideo.onerror = () => {
    // Fallback if metadata fails
    const filename = filePath.split(/[\\/]/).pop() || 'Video'
    addClipToTrack('video', {
      name: filename,
      src: filePath,
      in: 0,
      out: 10,
      speed: 1
    })
    toast.add({ title: t('tmcut.timelineActions.videoAdded', { name: filename }), color: 'success' })
  }
}

// Add text overlay
function handleAddText() {
  addClipToTrack('text', {
    name: t('tmcut.timelineActions.newText'),
    text: t('tmcut.inspectorProps.textPlaceholder'),
    in: 0,
    out: 4,
    offset: playhead.value,
    fontSize: 42,
    color: '#ffffff'
  })
  toast.add({ title: t('tmcut.timelineActions.textAdded'), color: 'success' })
}

// Add audio file
async function handleAddAudio() {
  if (!isDesktop.value) {
    const files = await pickWebFiles(['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'], true)
    if (files.length === 0) return
    const imported = await importWebFiles(files)
    for (const asset of imported) {
      if (asset.kind !== 'audio') continue
      addClipToTrack('audio', {
        name: asset.name,
        src: asset.path,
        in: 0,
        out: asset.meta.durationSec > 0 ? Math.round(asset.meta.durationSec * 100) / 100 : 15,
        volume: 100
      })
      toast.add({ title: t('tmcut.timelineActions.audioAdded', { name: asset.name }), color: 'success' })
    }
    return
  }
  const filePath = await pickFile({
    title: t('tmcut.timelineActions.selectAudio'),
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'] }]
  })

  if (!filePath || typeof filePath !== 'string') return

  const mediaUrl = toURL(filePath)
  const tempAudio = new Audio(mediaUrl)

  tempAudio.onloadedmetadata = () => {
    const dur = tempAudio.duration || 15
    const filename = filePath.split(/[\\/]/).pop() || 'Audio'
    addClipToTrack('audio', {
      name: filename,
      src: filePath,
      in: 0,
      out: Math.round(dur * 100) / 100,
      volume: 100
    })
    toast.add({ title: t('tmcut.timelineActions.audioAdded', { name: filename }), color: 'success' })
  }

  tempAudio.onerror = () => {
    const filename = filePath.split(/[\\/]/).pop() || 'Audio'
    addClipToTrack('audio', {
      name: filename,
      src: filePath,
      in: 0,
      out: 15,
      volume: 100
    })
    toast.add({ title: t('tmcut.timelineActions.audioAdded', { name: filename }), color: 'success' })
  }
}

// Synchronize horizontal scrolling between ruler and tracks
function onTracksScroll(e: Event) {
  const target = e.target as HTMLElement
  if (rulerRef.value) {
    rulerRef.value.scrollLeft = target.scrollLeft
  }
}

// Global shortcuts (timeline scope):
// Ctrl/Cmd+Z/Y undo-redo, Ctrl/Cmd+C/V/D clipboard, Ctrl/Cmd+S save,
// Ctrl/Cmd+E export, Ctrl/Cmd+K help, S split, Delete/Backspace remove,
// R ripple toggle, I/O render marks, ?/F1 shortcuts help (§65.1).
const emit = defineEmits<{
  (e: 'open-export'): void
}>()

// Shared help overlay state (useTmcutUiPrefs.shortcutsOpen) — also opened
// from the editor header button, so one instance is used everywhere.

function handleGlobalKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  const key = e.key.toLowerCase()
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault()
      redo()
    } else if (key === 'c') {
      e.preventDefault()
      handleCopy()
    } else if (key === 'v') {
      e.preventDefault()
      handlePaste()
    } else if (key === 'd') {
      e.preventDefault()
      handleDuplicate()
    } else if (key === 's') {
      e.preventDefault()
      flushDiskSave()
    } else if (key === 'e') {
      e.preventDefault()
      emit('open-export')
    } else if (key === 'k') {
      // Ctrl+K opens the help; the modal focuses its own search field
      e.preventDefault()
      shortcutsOpen.value = true
    }
    return
  }
  // While the help overlay is open only ?/F1 stay active (toggle to close),
  // so editing keys cannot fire behind the modal.
  if (shortcutsOpen.value) {
    if (key === '?' || key === 'f1') {
      e.preventDefault()
      shortcutsOpen.value = false
    }
    return
  }
  if (key === 's') {
    handleSplit()
  } else if (key === 'delete' || key === 'backspace') {
    e.preventDefault()
    handleDelete()
  } else if (key === 'r') {
    // R toggles ripple editing (the toolbar button shows the state)
    rippleMode.value = !rippleMode.value
  } else if (key === 'i') {
    setRenderMark('in')
  } else if (key === 'o') {
    setRenderMark('out')
  } else if (key === '?' || key === 'f1') {
    e.preventDefault()
    shortcutsOpen.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="h-full flex flex-col bg-neutral-900 border-t border-neutral-800 text-neutral-200 select-none">
    <!-- Timeline Toolbar -->
    <div class="h-10 px-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/90 shrink-0">
      <!-- Left: History + Tools (Undo, Redo, Split, Delete, Add Media) -->
      <div class="flex items-center gap-1.5">
        <UButton
          icon="i-lucide-undo-2"
          size="xs"
          variant="ghost"
          color="neutral"
          :disabled="!canUndo"
          :title="tip(t('tmcut.timelineActions.undo'), 'Ctrl+Z')"
          @click="undo"
        />
        <UButton
          icon="i-lucide-redo-2"
          size="xs"
          variant="ghost"
          color="neutral"
          :disabled="!canRedo"
          :title="tip(t('tmcut.timelineActions.redo'), 'Ctrl+Shift+Z')"
          @click="redo"
        />

        <div class="h-4 w-px bg-neutral-800 mx-1" />

        <UButton
          icon="i-lucide-scissors"
          size="xs"
          variant="soft"
          color="neutral"
          :title="tip(t('tmcut.timelineActions.split'), 'S')"
          @click="handleSplit"
        >
          {{ t('tmcut.timelineActions.split') }}
        </UButton>
        <UButton
          icon="i-lucide-trash"
          size="xs"
          variant="soft"
          color="error"
          :disabled="!selectedClipId"
          :title="tip(t('tmcut.timelineActions.delete'), 'Del')"
          @click="handleDelete"
        >
          {{ t('tmcut.timelineActions.delete') }}
        </UButton>
        <UButton
          icon="i-lucide-copy"
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="!selectedClipId"
          :title="tip(t('tmcut.timelineActions.duplicate'), 'Ctrl+D')"
          @click="handleDuplicate"
        />
        <UButton
          icon="i-lucide-clipboard-paste"
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="!clipboard"
          :title="tip(t('tmcut.timelineActions.paste'), 'Ctrl+V')"
          @click="handlePaste"
        />
        <UButton
          icon="i-lucide-fold-horizontal"
          size="xs"
          :variant="rippleMode ? 'solid' : 'soft'"
          :color="rippleMode ? 'primary' : 'neutral'"
          :title="tip(t('tmcut.timelineActions.ripple'), 'R')"
          @click="rippleMode = !rippleMode"
        />

        <div class="h-4 w-px bg-neutral-800 mx-1" />

        <UButton
          icon="i-lucide-plus"
          size="xs"
          variant="soft"
          color="primary"
          @click="handleAddVideo"
        >
          + Video
        </UButton>
        <UButton
          icon="i-lucide-type"
          size="xs"
          variant="soft"
          color="primary"
          @click="handleAddText"
        >
          + {{ t('tmcut.addText') }}
        </UButton>
        <UButton
          icon="i-lucide-music"
          size="xs"
          variant="soft"
          color="primary"
          @click="handleAddAudio"
        >
          + {{ t('tmcut.addAudio') }}
        </UButton>
      </div>

      <!-- Center: Timecode Info -->
      <div
        class="font-mono text-xs flex items-center gap-1 bg-neutral-950 px-2.5 py-0.5 rounded border border-neutral-800"
      >
        <span class="text-primary font-semibold">{{ formatTimecode(playhead) }}</span>
        <span class="text-neutral-500">/</span>
        <span class="text-neutral-400">{{ formatTimecode(totalDuration) }}</span>
      </div>

      <!-- In/Out render zone chip (clears on click) -->
      <div
        v-if="renderIn !== null || renderOut !== null"
        class="font-mono text-[10px] flex items-center gap-1.5 bg-primary/10 px-2 py-0.5 rounded border border-primary/30 text-primary select-none"
        :title="t('tmcut.timelineActions.clearMarks')"
        @click="clearRenderMarks()"
      >
        <span>I {{ renderIn !== null ? formatTimecode(renderIn) : '--:--' }}</span>
        <span class="opacity-50">→</span>
        <span>O {{ renderOut !== null ? formatTimecode(renderOut) : '--:--' }}</span>
        <UIcon
          name="i-lucide-x"
          class="size-3 hover:text-red-400 cursor-pointer"
        />
      </div>

      <!-- Right: Shortcuts help + Timeline Zoom Slider -->
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-keyboard"
          size="xs"
          variant="ghost"
          color="neutral"
          :title="tip(t('tmcut.hotkeys.title'), '?, F1')"
          @click="shortcutsOpen = true"
        />
        <UIcon name="i-lucide-zoom-out" class="size-3.5 text-neutral-500" />
        <input
          v-model.number="zoom"
          type="range"
          min="15"
          max="200"
          step="5"
          class="w-24 accent-primary cursor-pointer"
          :title="t('tmcut.timelineActions.zoom')"
        >
        <UIcon name="i-lucide-zoom-in" class="size-3.5 text-neutral-500" />
        <span class="text-[10px] font-mono text-neutral-400 w-11 text-right">{{ zoom }}px</span>
      </div>
    </div>

    <!-- Timeline Workspace -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Fixed Left Track Headers (w-44) -->
      <div class="w-44 border-r border-neutral-800 bg-neutral-950/80 flex flex-col shrink-0 z-20">
        <!-- Ruler Corner -->
        <div class="h-6 border-b border-neutral-800 flex items-center px-2 text-[10px] font-mono text-neutral-500">
          TRACKS
        </div>

        <!-- Track Labels with eye / lock / mute (CapCut-style) -->
        <div class="flex-1 flex flex-col divide-y divide-neutral-800/60 overflow-hidden">
          <div
            v-for="track in currentProject?.timeline?.tracks || []"
            :key="track.id"
            class="h-14 px-2 flex items-center justify-between gap-1 text-xs font-medium text-neutral-300"
          >
            <div class="flex items-center gap-1.5 truncate min-w-0">
              <UIcon
                :name="track.type === 'video' ? 'i-lucide-film' : track.type === 'text' ? 'i-lucide-type' : 'i-lucide-music'"
                class="size-4 shrink-0"
                :class="track.type === 'video' ? 'text-blue-400' : track.type === 'text' ? 'text-amber-400' : 'text-emerald-400'"
              />
              <span class="truncate">{{ track.name || track.type }}</span>
            </div>
            <div class="flex items-center shrink-0">
              <UButton
                :icon="track.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                size="xs"
                variant="ghost"
                :color="track.hidden ? 'warning' : 'neutral'"
                :title="track.hidden ? t('tmcut.tracks.show') : t('tmcut.tracks.hide')"
                @click="toggleTrackHidden(track.id)"
              />
              <UButton
                :icon="track.locked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
                size="xs"
                variant="ghost"
                :color="track.locked ? 'warning' : 'neutral'"
                :title="track.locked ? t('tmcut.tracks.unlock') : t('tmcut.tracks.lock')"
                @click="toggleTrackLock(track.id)"
              />
              <UButton
                v-if="track.type !== 'text'"
                :icon="track.muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
                size="xs"
                variant="ghost"
                :color="track.muted ? 'warning' : 'neutral'"
                :title="track.muted ? t('tmcut.tracks.unmute') : t('tmcut.tracks.mute')"
                @click="toggleTrackMute(track.id)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Scrollable Tracks & Ruler Area -->
      <div
        ref="tracksContainerRef"
        class="flex-1 flex flex-col overflow-x-auto overflow-y-hidden relative select-none"
        @scroll="onTracksScroll"
      >
        <!-- Time Ruler Bar (Sticky at top of tracks) -->
        <div
          ref="rulerRef"
          class="h-6 border-b border-neutral-800 bg-neutral-950/60 relative cursor-pointer overflow-hidden shrink-0"
          :style="{ width: `${timelineWidth}px` }"
          @mousedown="onRulerMouseDown"
        >
          <!-- Ruler Ticks -->
          <div
            v-for="tick in rulerTicks"
            :key="tick.sec"
            class="absolute top-0 bottom-0 flex flex-col justify-end"
            :style="{ left: `${tick.left}px` }"
          >
            <div class="w-px bg-neutral-700" :class="tick.isMajor ? 'h-3.5 bg-neutral-500' : 'h-2'" />
            <span
              v-if="tick.isMajor"
              class="absolute -top-0.5 left-1 text-[9px] font-mono text-neutral-500 select-none pointer-events-none"
            >
              {{ tick.label }}
            </span>
          </div>

          <!-- In/Out render zone tint + edge flags on the ruler -->
          <div
            v-if="renderZoneStyle"
            class="absolute top-0 bottom-0 bg-primary/10 border-x border-primary/50 pointer-events-none"
            :style="renderZoneStyle"
          />
          <div
            v-if="markInStyle"
            class="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none"
            :style="markInStyle"
          >
            <span class="absolute top-0 left-1 text-[9px] font-mono font-bold text-primary leading-none">I</span>
          </div>
          <div
            v-if="markOutStyle"
            class="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none"
            :style="markOutStyle"
          >
            <span class="absolute top-0 left-1 text-[9px] font-mono font-bold text-primary leading-none">O</span>
          </div>
        </div>

        <!-- Tracks Canvas -->
        <div
          class="flex-1 flex flex-col divide-y divide-neutral-800/60 relative"
          :style="{ width: `${timelineWidth}px` }"
          @mousedown="onTracksBackgroundMouseDown"
        >
          <!-- Red Vertical Playhead Line -->
          <div
            class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
            :style="{ left: `${playheadLeft}px` }"
          >
            <!-- Top Playhead Needle Head -->
            <div class="absolute -top-6 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45 rounded-xs" />
          </div>

          <!-- Background Time Grid Lines -->
          <div
            v-for="tick in rulerTicks"
            v-show="tick.isMajor"
            :key="'grid-' + tick.sec"
            class="absolute top-0 bottom-0 w-px bg-neutral-800/30 pointer-events-none"
            :style="{ left: `${tick.left}px` }"
          />

          <!-- Track Rows -->
          <div
            v-for="track in currentProject?.timeline?.tracks || []"
            :key="track.id"
            class="h-14 relative bg-neutral-900/40 hover:bg-neutral-800/20 transition-colors"
            :class="track.hidden ? 'opacity-40' : ''"
          >
            <!-- Clips inside track -->
            <TmcutTimelineClip
              v-for="clip in track.items"
              :key="clip.id"
              :track-type="track.type"
              :clip="clip"
              :locked="!!track.locked"
            />
          </div>

          <!-- In/Out render zone band across tracks (export zone) -->
          <div
            v-if="renderZoneStyle"
            class="absolute top-0 bottom-0 bg-primary/5 border-x-2 border-primary/40 z-20 pointer-events-none"
            :style="renderZoneStyle"
          />
        </div>
      </div>
    </div>

    <!-- Keyboard shortcuts help -->
    <TmcutShortcutsModal v-model:open="shortcutsOpen" />
  </div>
</template>
