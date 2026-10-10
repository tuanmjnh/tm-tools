<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject, TMCUT_DEFAULT_FADE_SEC } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { keyframeAt, setKeyframe, removeKeyframe, propsWithKeyframes, TICKS_PER_SECOND, withSpeed } from '@tmcut-core'

const { t } = useI18n()
const { selectedClip, selectedClipId, selectClip, updateClip, removeClip, pushHistory, pushHistoryCoalesced } = useTmcutProject()
const { currentProject, totalDuration, saveStatus, lastSavedAt } = useTmcutProject()
const { choices: fontChoices, ensureFonts } = useTmcutFonts()
const { formatTimecode, playhead } = useTmcutPlayback()

const clip = computed(() => selectedClip.value?.item)
const trackType = computed(() => selectedClip.value?.track)

// Clip property tabs (design #2): Video / Audio / Speed — the tab list
// follows the clip type so no dead (always-empty) tab ever shows.
const activeTab = ref<'video' | 'audio' | 'speed'>('video')

const availableTabs = computed<Array<'video' | 'audio' | 'speed'>>(() => {
  if (trackType.value === 'audio') return ['audio', 'speed']
  if (trackType.value === 'text') return ['video', 'speed']
  return ['video', 'audio', 'speed']
})

const currentTab = computed(() => (
  availableTabs.value.includes(activeTab.value) ? activeTab.value : availableTabs.value[0]
))

const tabItems = computed(() => availableTabs.value.map(key => ({
  key,
  label: key === 'video'
    ? t('tmcut.inspectorProps.tabVideo')
    : key === 'audio'
      ? t('tmcut.inspectorProps.tabAudio')
      : t('tmcut.inspectorProps.tabSpeed'),
  icon: key === 'video' ? 'i-lucide-film' : key === 'audio' ? 'i-lucide-volume-2' : 'i-lucide-gauge'
})))

// Speed options
const speedOptions = computed(() => [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: `1.0x (${t('tmcut.inspectorProps.normalSpeed')})`, value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 },
  { label: '3.0x', value: 3.0 },
  { label: '4.0x', value: 4.0 }
])

// Media fitting options (Phase 2)
const fitOptions = computed(() => [
  { label: t('tmcut.fit.fit'), value: 'fit' },
  { label: t('tmcut.fit.fill'), value: 'fill' },
  { label: t('tmcut.fit.crop'), value: 'crop' },
  { label: t('tmcut.fit.stretch'), value: 'stretch' },
  { label: t('tmcut.fit.smart'), value: 'smart' }
])

const isSmartFit = computed(() => (clip.value?.fit || 'fit') === 'smart' && trackType.value === 'video')
const isCropFit = computed(() => (clip.value?.fit || 'fit') === 'crop' && trackType.value === 'video')

function handleUpdate<K extends keyof NonNullable<typeof clip.value>>(field: K, value: NonNullable<typeof clip.value>[K]) {
  if (!selectedClipId.value) return
  // Roadmap B8: bursts of the same field (typing a text, dragging a
  // slider) record ONE undo entry through the coalescing history.
  pushHistoryCoalesced(`${selectedClipId.value}:${String(field)}`)
  updateClip(selectedClipId.value, { [field]: value })
}

// Font family (roadmap C-1): family (CSS preview) and file (drawtext
// fontfile= export) always travel together, so ONE coalesced history
// entry covers the pair — preview and export can never drift onto
// different faces.
function handleFontUpdate(family: string) {
  if (!selectedClipId.value || !family || family === 'null') return
  const choice = fontChoices.value.find(c => c.family === family)
  if (!choice) return
  pushHistoryCoalesced(`${selectedClipId.value}:font`)
  updateClip(selectedClipId.value, { fontFamily: choice.family, fontFile: choice.file })
}

// Keyframes (roadmap B1): the ⏱ buttons toggle a keyframe of the
// CURRENT field value at the playhead. Times are clip-local ticks
// (0 = clip start), so keyframes travel with the clip when it moves.
// The array is copied before mutation so updateClip receives one field
// patch, and pushHistory() below records exactly one discrete undo
// entry (roadmap B8). Keyframes are PREVIEW ONLY until the render
// pipeline supports them (Phase K roadmap item); the chip in the
// section headers says so.
type KfProp = 'scale' | 'x' | 'y' | 'opacity' | 'volume'

const clipLocalTicks = computed(() => {
  const c = clip.value
  if (!c) return 0
  return Math.round((playhead.value - (c.offset || 0)) * TICKS_PER_SECOND)
})

const clipHasKeyframes = computed(() => propsWithKeyframes(clip.value).length > 0)

function hasKfAtPlayhead(prop: KfProp): boolean {
  return !!keyframeAt(clip.value, prop, clipLocalTicks.value)
}

function kfTitle(prop: KfProp): string {
  return hasKfAtPlayhead(prop)
    ? t('tmcut.inspectorProps.removeKeyframe')
    : t('tmcut.inspectorProps.addKeyframe')
}

function kfCurrentValue(c: NonNullable<typeof clip.value>, prop: KfProp): number {
  if (prop === 'volume') return c.volume ?? 100
  if (prop === 'opacity') return c.opacity ?? 100
  if (prop === 'scale') return c.scale ?? 100
  if (prop === 'x') return c.x ?? 0
  return c.y ?? 0
}

function toggleKeyframe(prop: KfProp) {
  const c = clip.value
  if (!c || !selectedClipId.value) return
  const draft = { keyframes: [...(c.keyframes || [])] }
  if (keyframeAt(draft, prop, clipLocalTicks.value)) {
    removeKeyframe(draft, prop, clipLocalTicks.value)
  } else {
    setKeyframe(draft, prop, clipLocalTicks.value, kfCurrentValue(c, prop))
  }
  pushHistory() // discrete op → its own undo entry (roadmap B8)
  updateClip(selectedClipId.value, { keyframes: draft.keyframes })
}

// Fade in/out (roadmap C12 / core audio.mjs): the audio tab toggles a
// 0.5s default envelope per edge, with a slider while active. Values are
// TICKS on the v1 item (same passthrough heritage as keyframes and
// transitionIn); the preview ramps video.volume through core gainAt.
const DEFAULT_FADE_SEC = TMCUT_DEFAULT_FADE_SEC

const fadeInTicks = computed(() => clip.value?.fade?.in || 0)
const fadeOutTicks = computed(() => clip.value?.fade?.out || 0)

// Core clamps each edge to half the clip — the slider mirrors that cap.
const maxFadeSec = computed(() => {
  const c = clip.value
  if (!c) return 0
  return Math.max(0, Math.min(5, ((c.out - c.in) / (c.speed || 1)) / 2))
})

function fadePatch(edge: 'in' | 'out', ticks: number) {
  const c = clip.value
  if (!c) return { in: 0, out: 0 }
  return {
    in: edge === 'in' ? ticks : (c.fade?.in || 0),
    out: edge === 'out' ? ticks : (c.fade?.out || 0)
  }
}

function toggleFade(edge: 'in' | 'out') {
  const c = clip.value
  if (!c || !selectedClipId.value) return
  const current = edge === 'in' ? fadeInTicks.value : fadeOutTicks.value
  const ticks = current > 0 ? 0 : Math.round(DEFAULT_FADE_SEC * TICKS_PER_SECOND)
  pushHistory() // discrete toggle → its own undo entry (roadmap B8)
  updateClip(selectedClipId.value, { fade: fadePatch(edge, ticks) })
}

function handleFadeUpdate(edge: 'in' | 'out', seconds: number) {
  if (!selectedClipId.value) return
  const ticks = Math.max(0, Math.round(seconds * TICKS_PER_SECOND))
  // Slider bursts coalesce into one undo entry (roadmap B8/C15).
  pushHistoryCoalesced(`${selectedClipId.value}:fade-${edge}`)
  updateClip(selectedClipId.value, { fade: fadePatch(edge, ticks) })
}

// Speed changes go through core C4 (roadmap B2): the speed is validated
// and the source span keeps the 0.2 s floor — only the touched fields are
// sent so undo history stays one clean entry. The timeline duration
// derives from (out - in) / speed everywhere (editor + export R25).
function handleSpeedUpdate(value: number) {
  const c = clip.value
  if (!c || !selectedClipId.value) return
  const next = withSpeed(c, Number(value))
  pushHistory() // discrete preset change → its own undo entry (B8)
  updateClip(selectedClipId.value, { speed: next.speed, out: next.out })
}

function handleFitUpdate(value: string) {
  if (!selectedClipId.value) return
  pushHistory() // discrete fit change → its own undo entry (B8)
  const fit = value as 'fit' | 'fill' | 'crop' | 'stretch' | 'smart'
  if (fit === 'smart' && (clip.value?.focusX === undefined || clip.value?.focusY === undefined)) {
    updateClip(selectedClipId.value, { fit, focusX: 0.5, focusY: 0.5 })
    return
  }
  if (fit === 'crop' && !clip.value?.cropRect) {
    updateClip(selectedClipId.value, { fit, cropRect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } })
    return
  }
  updateClip(selectedClipId.value, { fit })
}

function handleDelete() {
  if (selectedClipId.value) {
    removeClip(selectedClipId.value)
  }
}

// Project details (CapCut-style "Details" panel when no clip is selected)
const storagePath = ref('')
onMounted(async () => {
  void ensureFonts()
  try {
    const dirs = await window.electronAPI?.tmcut?.getPaths()
    storagePath.value = dirs?.projects || ''
  } catch {
    storagePath.value = ''
  }
})

const detailRows = computed(() => {
  const project = currentProject.value
  const tracks = project?.timeline?.tracks || []
  const clipCount = tracks.reduce((n, tr) => n + (tr.items?.length || 0), 0)
  return [
    { label: t('tmcut.details.name'), value: project?.name || '—' },
    {
      label: t('tmcut.details.resolution'),
      value: project?.canvas ? `${project.canvas.width}x${project.canvas.height}` : '—'
    },
    {
      label: t('tmcut.details.fps'),
      value: project?.canvas ? `${project.canvas.fps}fps` : '—'
    },
    { label: t('tmcut.details.duration'), value: formatTimecode(totalDuration.value) },
    { label: t('tmcut.details.tracks'), value: String(tracks.length) },
    { label: t('tmcut.details.clips'), value: String(clipCount) },
    {
      label: t('tmcut.details.lastSaved'),
      value: lastSavedAt.value ? new Date(lastSavedAt.value).toLocaleString() : '—'
    }
  ]
})

const saveStateLabel = computed(() => {
  if (saveStatus.value === 'saving') return t('tmcut.save.saving')
  if (saveStatus.value === 'saved') return t('tmcut.save.saved')
  if (saveStatus.value === 'error') return t('tmcut.save.error')
  return '—'
})
</script>

<template>
  <div
    v-if="clip"
    class="space-y-4 text-xs select-none"
  >
    <!-- Header with Name & Deselect -->
    <div class="flex items-center justify-between pb-3 border-b border-neutral-800">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon
          :name="trackType === 'video' ? 'i-lucide-film' : trackType === 'text' ? 'i-lucide-type' : 'i-lucide-music'"
          class="size-4 shrink-0"
          :class="trackType === 'video' ? 'text-blue-400' : trackType === 'text' ? 'text-amber-400' : 'text-emerald-400'"
        />
        <span class="font-medium text-neutral-100 truncate text-sm">
          {{ clip.name || clip.text || t('tmcut.project') }}
        </span>
      </div>
      <UButton
        icon="i-lucide-x"
        size="xs"
        variant="soft"
        color="neutral"
        @click="selectClip(null)"
      />
    </div>

    <!-- Clip property tabs (design #2): Video / Audio / Speed -->
    <div class="flex items-center gap-1 bg-neutral-900/60 border border-neutral-800 rounded-lg p-1">
      <button
        v-for="tab in tabItems"
        :key="tab.key"
        type="button"
        class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
        :class="currentTab === tab.key ? 'bg-primary/15 text-primary' : 'text-neutral-400 hover:text-neutral-200'"
        @click="activeTab = tab.key"
      >
        <UIcon :name="tab.icon" class="size-3" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Text Content Editor (If Text Track) -->
    <div
      v-if="currentTab === 'video' && trackType === 'text'"
      class="space-y-2"
    >
      <label class="font-medium text-neutral-400">{{ t('tmcut.inspectorProps.textContent') }}</label>
      <UTextarea
        :model-value="clip.text || ''"
        :placeholder="t('tmcut.inspectorProps.textPlaceholder')"
        :rows="3"
        class="w-full text-xs font-sans"
        @update:model-value="handleUpdate('text', $event)"
      />

      <div class="grid grid-cols-2 gap-2 pt-1">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.fontSize') }}</label>
          <UInput
            type="number"
            :model-value="clip.fontSize || 36"
            :min="12"
            :max="120"
            size="xs"
            @update:model-value="handleUpdate('fontSize', Number($event))"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.textColor') }}</label>
          <div class="flex items-center gap-1.5 mt-0.5">
            <input
              type="color"
              :value="clip.color || '#ffffff'"
              class="w-6 h-6 rounded border border-neutral-700 bg-transparent cursor-pointer"
              @input="handleUpdate('color', ($event.target as HTMLInputElement).value)"
            >
            <span class="font-mono text-[10px] text-neutral-400">{{ clip.color || '#ffffff' }}</span>
          </div>
        </div>
      </div>

      <!-- Font family (roadmap C-1): one choice per family from the
           main-process font scanner. Empty on web (no IPC) or when the
           addon fails — hidden rather than a fake or dead list. -->
      <div v-if="fontChoices.length" class="pt-1">
        <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.font') }}</label>
        <USelectMenu
          :items="fontChoices"
          value-key="family"
          label-key="family"
          class="w-full"
          :model-value="clip.fontFamily ?? null"
          :placeholder="t('tmcut.inspectorProps.fontDefault')"
          size="xs"
          :search-input="{ icon: 'i-lucide-search', placeholder: t('global.search') }"
          @update:model-value="handleFontUpdate(String($event))"
        />
      </div>
    </div>

    <!-- Timing & Speed Settings -->
    <div v-if="currentTab === 'speed'" class="space-y-3 pt-2 border-t border-neutral-800">
      <span class="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">{{ t('tmcut.inspectorProps.timingAndSpeed') }}</span>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.inPoint') }}</label>
          <UInput
            type="number"
            step="0.1"
            :model-value="clip.in"
            size="xs"
            @update:model-value="handleUpdate('in', Number($event))"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.outPoint') }}</label>
          <UInput
            type="number"
            step="0.1"
            :model-value="clip.out"
            size="xs"
            @update:model-value="handleUpdate('out', Number($event))"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.offset') }}</label>
          <UInput
            type="number"
            step="0.1"
            :model-value="clip.offset"
            size="xs"
            @update:model-value="handleUpdate('offset', Number($event))"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.speed') }}</label>
          <USelect
            :items="speedOptions"
            :model-value="clip.speed || 1"
            size="xs"
            @update:model-value="handleSpeedUpdate(Number($event))"
          />
        </div>
      </div>

      <!-- Reverse playback (roadmap B2): preview seeks backwards
           (seek-driven like the J shuttle — the element cannot play
           native) and export applies reverse/areverse (R25). Hidden for
           TEXT clips: a text overlay has no directional playback, so the
           toggle would change nothing anywhere (dead control). -->
      <div
        v-if="trackType !== 'text'"
        class="flex items-center justify-between"
      >
        <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.reverse') }}</label>
        <USwitch
          :model-value="!!clip.reverse"
          @update:model-value="handleUpdate('reverse', !!$event)"
        />
      </div>
    </div>

    <!-- Media Fitting (Phase 2, video track only) -->
    <div
      v-if="currentTab === 'video' && trackType === 'video'"
      class="space-y-3 pt-2 border-t border-neutral-800"
    >
      <span class="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">{{ t('tmcut.fit.label') }}</span>

      <div>
        <USelect
          :items="fitOptions"
          :model-value="clip.fit || 'fit'"
          size="xs"
          @update:model-value="handleFitUpdate(String($event))"
        />
      </div>

      <div v-if="isSmartFit" class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.fit.focusX') }}</label>
          <UInput
            type="number"
            step="0.05"
            :min="0"
            :max="1"
            :model-value="clip.focusX ?? 0.5"
            size="xs"
            @update:model-value="handleUpdate('focusX', Number($event))"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.fit.focusY') }}</label>
          <UInput
            type="number"
            step="0.05"
            :min="0"
            :max="1"
            :model-value="clip.focusY ?? 0.5"
            size="xs"
            @update:model-value="handleUpdate('focusY', Number($event))"
          />
        </div>
      </div>

      <div v-if="isCropFit" class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.fit.cropX') }}</label>
          <UInput
            type="number"
            step="0.05"
            :min="0"
            :max="1"
            :model-value="clip.cropRect?.x ?? 0.1"
            size="xs"
            @update:model-value="handleUpdate('cropRect', { ...(clip.cropRect || { x: 0, y: 0, w: 1, h: 1 }), x: Number($event) })"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.fit.cropY') }}</label>
          <UInput
            type="number"
            step="0.05"
            :min="0"
            :max="1"
            :model-value="clip.cropRect?.y ?? 0.1"
            size="xs"
            @update:model-value="handleUpdate('cropRect', { ...(clip.cropRect || { x: 0, y: 0, w: 1, h: 1 }), y: Number($event) })"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.fit.cropW') }}</label>
          <UInput
            type="number"
            step="0.05"
            :min="0.05"
            :max="1"
            :model-value="clip.cropRect?.w ?? 0.8"
            size="xs"
            @update:model-value="handleUpdate('cropRect', { ...(clip.cropRect || { x: 0, y: 0, w: 1, h: 1 }), w: Number($event) })"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.fit.cropH') }}</label>
          <UInput
            type="number"
            step="0.05"
            :min="0.05"
            :max="1"
            :model-value="clip.cropRect?.h ?? 0.8"
            size="xs"
            @update:model-value="handleUpdate('cropRect', { ...(clip.cropRect || { x: 0, y: 0, w: 1, h: 1 }), h: Number($event) })"
          />
        </div>
      </div>
    </div>

    <!-- Transform Settings (Video & Text) -->
    <div
      v-if="currentTab === 'video' && trackType !== 'audio'"
      class="space-y-3 pt-2 border-t border-neutral-800"
    >
      <div class="flex items-center justify-between">
        <span class="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">{{ t('tmcut.inspectorProps.transform') }}</span>
        <span
          v-if="clipHasKeyframes"
          class="text-[9px] leading-none rounded bg-amber-500/15 text-amber-400 px-1.5 py-0.5"
          :title="t('tmcut.inspectorProps.previewOnlyKeyframes')"
        >
          {{ t('tmcut.inspectorProps.previewOnlyKeyframes') }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="flex items-center justify-between">
            <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.scale') }}</label>
            <button
              type="button"
              class="rounded p-0.5 transition-colors"
              :class="hasKfAtPlayhead('scale') ? 'text-primary bg-primary/15' : 'text-neutral-600 hover:text-neutral-300'"
              :title="kfTitle('scale')"
              @click="toggleKeyframe('scale')"
            >
              <UIcon name="i-lucide-diamond" class="size-3" />
            </button>
          </div>
          <UInput
            type="number"
            :min="10"
            :max="300"
            :model-value="clip.scale || 100"
            size="xs"
            @update:model-value="handleUpdate('scale', Number($event))"
          />
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.opacity') }}</label>
            <button
              type="button"
              class="rounded p-0.5 transition-colors"
              :class="hasKfAtPlayhead('opacity') ? 'text-primary bg-primary/15' : 'text-neutral-600 hover:text-neutral-300'"
              :title="kfTitle('opacity')"
              @click="toggleKeyframe('opacity')"
            >
              <UIcon name="i-lucide-diamond" class="size-3" />
            </button>
          </div>
          <UInput
            type="number"
            :min="0"
            :max="100"
            :model-value="clip.opacity ?? 100"
            size="xs"
            @update:model-value="handleUpdate('opacity', Number($event))"
          />
        </div>
      </div>

      <!-- Rotation: exposed for VIDEO clips only — text rotation is not
           exported yet (drawtext has no angle; roadmap R12), and showing
           the slider for text would be a dead control. -->
      <div v-if="trackType === 'video'">
        <div class="flex items-center justify-between">
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.rotation') }}</label>
          <span class="text-[10px] font-mono text-neutral-400">{{ clip.rotation || 0 }}°</span>
        </div>
        <USlider
          :model-value="clip.rotation || 0"
          :min="-180"
          :max="180"
          :step="1"
          :tooltip="true"
          class="mt-1.5"
          @update:model-value="handleUpdate('rotation', Number($event))"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="flex items-center justify-between">
            <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.positionX') }}</label>
            <button
              type="button"
              class="rounded p-0.5 transition-colors"
              :class="hasKfAtPlayhead('x') ? 'text-primary bg-primary/15' : 'text-neutral-600 hover:text-neutral-300'"
              :title="kfTitle('x')"
              @click="toggleKeyframe('x')"
            >
              <UIcon name="i-lucide-diamond" class="size-3" />
            </button>
          </div>
          <UInput
            type="number"
            :model-value="clip.x || 0"
            size="xs"
            @update:model-value="handleUpdate('x', Number($event))"
          />
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.positionY') }}</label>
            <button
              type="button"
              class="rounded p-0.5 transition-colors"
              :class="hasKfAtPlayhead('y') ? 'text-primary bg-primary/15' : 'text-neutral-600 hover:text-neutral-300'"
              :title="kfTitle('y')"
              @click="toggleKeyframe('y')"
            >
              <UIcon name="i-lucide-diamond" class="size-3" />
            </button>
          </div>
          <UInput
            type="number"
            :model-value="clip.y || 0"
            size="xs"
            @update:model-value="handleUpdate('y', Number($event))"
          />
        </div>
      </div>
    </div>

    <!-- Audio / Volume Settings -->
    <div
      v-if="currentTab === 'audio'"
      class="space-y-2 pt-2 border-t border-neutral-800"
    >
      <div class="flex items-center justify-between">
        <span class="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">{{ t('tmcut.inspectorProps.volume') }}</span>
        <div class="flex items-center gap-1.5">
          <span
            v-if="clipHasKeyframes"
            class="text-[9px] leading-none rounded bg-amber-500/15 text-amber-400 px-1.5 py-0.5"
            :title="t('tmcut.inspectorProps.previewOnlyKeyframes')"
          >
            {{ t('tmcut.inspectorProps.previewOnlyKeyframes') }}
          </span>
          <!-- Keyframe toggle: only for VIDEO clips — a timeline audio
               clip has no preview engine yet, so a keyframe there would
               change nothing visible (dead control, roadmap B1). -->
          <button
            v-if="trackType === 'video'"
            type="button"
            class="rounded p-0.5 transition-colors"
            :class="hasKfAtPlayhead('volume') ? 'text-primary bg-primary/15' : 'text-neutral-600 hover:text-neutral-300'"
            :title="kfTitle('volume')"
            @click="toggleKeyframe('volume')"
          >
            <UIcon name="i-lucide-diamond" class="size-3" />
          </button>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <UIcon
          name="i-lucide-volume-2"
          class="size-4 text-neutral-400 shrink-0"
        />
        <input
          type="range"
          min="0"
          max="150"
          :value="clip.volume ?? 100"
          class="w-full accent-primary cursor-pointer"
          @input="handleUpdate('volume', Number(($event.target as HTMLInputElement).value))"
        >
        <span class="font-mono text-xs w-10 text-right">{{ clip.volume ?? 100 }}%</span>
      </div>

      <!-- Fade in/out (roadmap C12): toggle a 0.5s envelope per edge, the
           slider appears while active. The preview ramps through core
           gainAt; export follows with the compiler round (R5), the same
           gap family as the volume slider above. -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded px-2 py-1 text-[11px] transition-colors shrink-0"
            :class="fadeInTicks > 0 ? 'text-primary bg-primary/15' : 'text-neutral-400 bg-neutral-800/60 hover:text-neutral-200'"
            :title="t('tmcut.inspectorProps.fadeIn')"
            @click="toggleFade('in')"
          >
            {{ t('tmcut.inspectorProps.fadeIn') }}
          </button>
          <template v-if="fadeInTicks > 0">
            <input
              type="range"
              min="0"
              :max="maxFadeSec"
              step="0.1"
              :value="fadeInTicks / TICKS_PER_SECOND"
              class="w-full accent-primary cursor-pointer"
              @input="handleFadeUpdate('in', Number(($event.target as HTMLInputElement).value))"
            >
            <span class="font-mono text-xs w-10 text-right">{{ (fadeInTicks / TICKS_PER_SECOND).toFixed(1) }}s</span>
          </template>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded px-2 py-1 text-[11px] transition-colors shrink-0"
            :class="fadeOutTicks > 0 ? 'text-primary bg-primary/15' : 'text-neutral-400 bg-neutral-800/60 hover:text-neutral-200'"
            :title="t('tmcut.inspectorProps.fadeOut')"
            @click="toggleFade('out')"
          >
            {{ t('tmcut.inspectorProps.fadeOut') }}
          </button>
          <template v-if="fadeOutTicks > 0">
            <input
              type="range"
              min="0"
              :max="maxFadeSec"
              step="0.1"
              :value="fadeOutTicks / TICKS_PER_SECOND"
              class="w-full accent-primary cursor-pointer"
              @input="handleFadeUpdate('out', Number(($event.target as HTMLInputElement).value))"
            >
            <span class="font-mono text-xs w-10 text-right">{{ (fadeOutTicks / TICKS_PER_SECOND).toFixed(1) }}s</span>
          </template>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="pt-4 border-t border-neutral-800">
      <UButton
        icon="i-lucide-trash"
        color="error"
        variant="soft"
        block
        size="xs"
        @click="handleDelete"
      >
        {{ t('tmcut.inspectorProps.deleteClip') }}
      </UButton>
    </div>
  </div>

  <div
    v-else
    class="text-xs select-none"
  >
    <!-- Project details header -->
    <div class="flex items-center gap-2 pb-3 border-b border-neutral-800">
      <UIcon name="i-lucide-clapperboard" class="size-4 shrink-0 text-primary" />
      <span class="font-medium text-neutral-100 truncate text-sm">
        {{ currentProject?.name || t('tmcut.project') }}
      </span>
    </div>

    <!-- Detail rows (CapCut-style details panel) -->
    <div class="py-2 divide-y divide-neutral-800/60">
      <div v-for="row in detailRows" :key="row.label" class="flex items-start justify-between gap-3 py-1.5">
        <span class="text-neutral-500 shrink-0">{{ row.label }}</span>
        <span class="text-neutral-200 text-right break-all font-mono text-[11px]">{{ row.value }}</span>
      </div>
      <div class="flex items-start justify-between gap-3 py-1.5">
        <span class="text-neutral-500 shrink-0">{{ t('tmcut.details.saveState') }}</span>
        <span
          class="text-right text-[11px]"
          :class="saveStatus === 'error' ? 'text-red-400' : 'text-emerald-400'"
        >
          {{ saveStateLabel }}
        </span>
      </div>
    </div>

    <!-- Storage path -->
    <div v-if="storagePath" class="pt-2 border-t border-neutral-800">
      <p class="text-[10px] text-neutral-500 mb-1">
        {{ t('tmcut.details.storage') }}
      </p>
      <p class="font-mono text-[10px] text-neutral-400 break-all leading-relaxed">
        {{ storagePath }}
      </p>
    </div>

    <p class="text-neutral-500 text-[11px] text-center pt-4">
      {{ t('tmcut.inspectorProps.noClipSelected') }}
    </p>
  </div>
</template>
