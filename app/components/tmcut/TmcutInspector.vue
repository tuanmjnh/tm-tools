<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject } from '~/composables/useTmcutProject'

const { t } = useI18n()
const { selectedClip, selectedClipId, selectClip, updateClip, removeClip } = useTmcutProject()

const clip = computed(() => selectedClip.value?.item)
const trackType = computed(() => selectedClip.value?.track)

// Speed options
const speedOptions = computed(() => [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: `1.0x (${t('tmcut.inspectorProps.normalSpeed')})`, value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 },
  { label: '3.0x', value: 3.0 }
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
  updateClip(selectedClipId.value, { [field]: value })
}

function handleFitUpdate(value: string) {
  if (!selectedClipId.value) return
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

    <!-- Text Content Editor (If Text Track) -->
    <div
      v-if="trackType === 'text'"
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
    </div>

    <!-- Timing & Speed Settings -->
    <div class="space-y-3 pt-2 border-t border-neutral-800">
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
            @update:model-value="handleUpdate('speed', Number($event))"
          />
        </div>
      </div>
    </div>

    <!-- Media Fitting (Phase 2, video track only) -->
    <div
      v-if="trackType === 'video'"
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
      v-if="trackType !== 'audio'"
      class="space-y-3 pt-2 border-t border-neutral-800"
    >
      <span class="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">{{ t('tmcut.inspectorProps.transform') }}</span>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.scale') }}</label>
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
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.opacity') }}</label>
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

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.positionX') }}</label>
          <UInput
            type="number"
            :model-value="clip.x || 0"
            size="xs"
            @update:model-value="handleUpdate('x', Number($event))"
          />
        </div>
        <div>
          <label class="text-[10px] text-neutral-500">{{ t('tmcut.inspectorProps.positionY') }}</label>
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
      v-if="trackType === 'audio' || trackType === 'video'"
      class="space-y-2 pt-2 border-t border-neutral-800"
    >
      <span class="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">{{ t('tmcut.inspectorProps.volume') }}</span>
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
    class="text-neutral-500 text-xs text-center py-16"
  >
    <UIcon
      name="i-lucide-mouse-pointer"
      class="size-8 mx-auto mb-2 opacity-30"
    />
    {{ t('tmcut.inspectorProps.noClipSelected') }}
  </div>
</template>
