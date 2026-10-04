<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { useFileSystem } from '~/composables/useFileSystem'

const { t } = useI18n()

const {
  currentProject,
  selectedClipId,
  totalDuration,
  addClipToTrack,
  removeClip,
  splitClip
} = useTmcutProject()

const {
  playhead,
  zoom,
  formatTimecode,
  seek,
  zoomIn,
  zoomOut
} = useTmcutPlayback()

const { pickFile } = useFileSystem()
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

// Handle scrubbing on ruler
function onRulerMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
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
  const rect = rulerRef.value.getBoundingClientRect()
  const scrollLeft = tracksContainerRef.value?.scrollLeft || 0
  const clickX = e.clientX - rect.left + scrollLeft
  const targetSec = Math.max(0, clickX / zoom.value)
  seek(targetSec)
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

// Delete clip action
function handleDelete() {
  if (selectedClipId.value) {
    removeClip(selectedClipId.value)
    toast.add({ title: t('tmcut.timelineActions.clipDeleted'), color: 'neutral' })
  }
}

// Add local video file
async function handleAddVideo() {
  const filePath = await pickFile({
    title: t('tmcut.timelineActions.selectVideoToAdd'),
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] }]
  })

  if (!filePath || typeof filePath !== 'string') return

  // Probe media metadata using HTML5 Video element
  const mediaUrl = `media://?file=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
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
  const filePath = await pickFile({
    title: t('tmcut.timelineActions.selectAudio'),
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'] }]
  })

  if (!filePath || typeof filePath !== 'string') return

  const mediaUrl = `media://?file=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
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
</script>

<template>
  <div class="h-full flex flex-col bg-neutral-900 border-t border-neutral-800 text-neutral-200 select-none">
    <!-- Timeline Toolbar -->
    <div class="h-10 px-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/90 shrink-0">
      <!-- Left: Tools (Split, Delete, Add Media) -->
      <div class="flex items-center gap-1.5">
        <UButton
          icon="i-lucide-scissors"
          size="xs"
          variant="soft"
          color="neutral"
          :title="t('tmcut.timelineActions.split')"
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
          :title="t('tmcut.timelineActions.delete')"
          @click="handleDelete"
        >
          {{ t('tmcut.timelineActions.delete') }}
        </UButton>

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
      <div class="font-mono text-xs flex items-center gap-1 bg-neutral-950 px-2.5 py-0.5 rounded border border-neutral-800">
        <span class="text-primary font-semibold">{{ formatTimecode(playhead) }}</span>
        <span class="text-neutral-500">/</span>
        <span class="text-neutral-400">{{ formatTimecode(totalDuration) }}</span>
      </div>

      <!-- Right: Timeline Zoom -->
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-zoom-out"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="zoomOut"
        />
        <span class="text-[10px] font-mono text-neutral-400 w-8 text-center">{{ zoom }}px</span>
        <UButton
          icon="i-lucide-zoom-in"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="zoomIn"
        />
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

        <!-- Track Labels -->
        <div class="flex-1 flex flex-col divide-y divide-neutral-800/60 overflow-hidden">
          <div
            v-for="track in currentProject?.timeline?.tracks || []"
            :key="track.id"
            class="h-14 px-3 flex items-center justify-between text-xs font-medium text-neutral-300"
          >
            <div class="flex items-center gap-2 truncate">
              <UIcon
                :name="track.type === 'video' ? 'i-lucide-film' : track.type === 'text' ? 'i-lucide-type' : 'i-lucide-music'"
                class="size-4 shrink-0"
                :class="track.type === 'video' ? 'text-blue-400' : track.type === 'text' ? 'text-amber-400' : 'text-emerald-400'"
              />
              <span class="truncate">{{ track.name || track.type }}</span>
            </div>
            <div class="flex items-center gap-1 text-neutral-500">
              <UIcon name="i-lucide-layers" class="size-3" />
              <span class="text-[10px]">{{ track.items.length }}</span>
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
            <div
              class="w-px bg-neutral-700"
              :class="tick.isMajor ? 'h-3.5 bg-neutral-500' : 'h-2'"
            />
            <span
              v-if="tick.isMajor"
              class="absolute -top-0.5 left-1 text-[9px] font-mono text-neutral-500 select-none pointer-events-none"
            >
              {{ tick.label }}
            </span>
          </div>
        </div>

        <!-- Tracks Canvas -->
        <div
          class="flex-1 flex flex-col divide-y divide-neutral-800/60 relative"
          :style="{ width: `${timelineWidth}px` }"
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
          >
            <!-- Clips inside track -->
            <TmcutTimelineClip
              v-for="clip in track.items"
              :key="clip.id"
              :track-type="track.type"
              :clip="clip"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
