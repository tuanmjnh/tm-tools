<script setup lang="ts">
import type { WatermarkConfigModel } from '~/utils/documentStudio'

const props = withDefaults(defineProps<{
  modelValue?: WatermarkConfigModel
  preview?: File | null
}>(), {
  modelValue: () => ({ mode: 'manual' }),
  preview: null
})

const emit = defineEmits<{
  'update:modelValue': [value: WatermarkConfigModel]
}>()

const { t } = useI18n()

const mode = computed(() => props.modelValue?.mode ?? 'manual')

const modes = computed(() => [
  { value: 'manual' as const, label: t('document.watermark.modeManual'), hint: t('document.watermark.modeManualHint') },
  { value: 'batch' as const, label: t('document.watermark.modeBatch'), hint: t('document.watermark.modeBatchHint') },
  { value: 'auto' as const, label: t('document.watermark.modeAuto'), hint: t('document.watermark.modeAutoHint') }
])

const activeHint = computed(() => modes.value.find(entry => entry.value === mode.value)?.hint ?? '')

const sourceUrl = ref<string | null>(null)
const natural = ref({ width: 0, height: 0 })
const stage = ref<HTMLElement | null>(null)
const draft = ref<{ x0: number, y0: number, x1: number, y1: number } | null>(null)

watch(() => props.preview, (file) => {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value)
  sourceUrl.value = file ? URL.createObjectURL(file) : null
  natural.value = { width: 0, height: 0 }
  draft.value = null
}, { immediate: true })

onBeforeUnmount(() => {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value)
})

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
}

/** CSS box of the current selection, as fractions of the preview. */
const box = computed(() => {
  const live = draft.value
  if (live) {
    return {
      left: Math.min(live.x0, live.x1),
      top: Math.min(live.y0, live.y1),
      width: Math.abs(live.x1 - live.x0),
      height: Math.abs(live.y1 - live.y0)
    }
  }
  const saved = props.modelValue?.regionRatio
  if (!saved || !(saved.widthRatio > 0) || !(saved.heightRatio > 0)) return null
  return { left: saved.xRatio, top: saved.yRatio, width: saved.widthRatio, height: saved.heightRatio }
})

const boxStyle = computed(() => {
  const current = box.value
  if (!current) return {}
  return {
    left: `${current.left * 100}%`,
    top: `${current.top * 100}%`,
    width: `${current.width * 100}%`,
    height: `${current.height * 100}%`
  }
})

const selectionLabel = computed(() => {
  const region = props.modelValue?.region
  if (!region) return ''
  return t('document.watermark.selection', { width: region.width, height: region.height })
})

function pointOf(event: PointerEvent): { x: number, y: number } | null {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return null
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height)
  }
}

function startDrag(event: PointerEvent) {
  if (!sourceUrl.value) return
  const point = pointOf(event)
  if (!point) return
  stage.value?.setPointerCapture(event.pointerId)
  draft.value = { x0: point.x, y0: point.y, x1: point.x, y1: point.y }
}

function moveDrag(event: PointerEvent) {
  if (!draft.value) return
  const point = pointOf(event)
  if (!point) return
  draft.value = { ...draft.value, x1: point.x, y1: point.y }
}

function endDrag(event: PointerEvent) {
  const current = draft.value
  const point = pointOf(event)
  if (!current || !point) {
    draft.value = null
    return
  }
  const left = Math.min(current.x0, point.x)
  const top = Math.min(current.y0, point.y)
  const width = Math.abs(point.x - current.x0)
  const height = Math.abs(point.y - current.y0)
  draft.value = null
  if (width < 0.005 || height < 0.005 || natural.value.width === 0) return

  const region = {
    x: Math.round(left * natural.value.width),
    y: Math.round(top * natural.value.height),
    width: Math.max(1, Math.round(width * natural.value.width)),
    height: Math.max(1, Math.round(height * natural.value.height))
  }
  emit('update:modelValue', {
    ...props.modelValue,
    mode: mode.value,
    region,
    regionRatio: { xRatio: left, yRatio: top, widthRatio: width, heightRatio: height }
  })
}

function selectMode(value: 'manual' | 'batch' | 'auto') {
  emit('update:modelValue', { ...props.modelValue, mode: value })
}
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.watermark.mode')">
      <div class="grid gap-2">
        <button
          v-for="entry in modes"
          :key="entry.value"
          type="button"
          class="panel-flat flex w-full items-start gap-3 rounded-md p-3 text-start transition-all cursor-pointer"
          :class="[
            mode === entry.value
              ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
              : 'border-default hover:border-default/80 hover:bg-muted/10'
          ]"
          :aria-pressed="mode === entry.value"
          @click="selectMode(entry.value)"
        >
          <div
            class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
            :class="mode === entry.value ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-500 bg-transparent'"
          >
            <UIcon v-if="mode === entry.value" name="i-lucide-check" class="size-3" />
          </div>
          <span class="text-sm font-medium">{{ entry.label }}</span>
        </button>
      </div>
    </UFormField>

    <div v-if="mode !== 'auto'" class="space-y-2">
      <div
        v-if="sourceUrl"
        ref="stage"
        class="relative w-full cursor-crosshair select-none overflow-hidden rounded-md border border-default bg-muted/10 touch-none"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <img
          :src="sourceUrl"
          alt=""
          draggable="false"
          class="block w-full"
          @load="onImageLoad"
        >
        <div
          v-if="box"
          class="pointer-events-none absolute border-2 border-primary bg-primary/20"
          :style="boxStyle"
        />
      </div>
      <p v-else class="rounded-md border border-dashed border-default p-3 text-xs text-muted">
        {{ t('document.watermark.noPreview') }}
      </p>
      <p v-if="selectionLabel" class="text-xs text-muted">
        {{ selectionLabel }}
      </p>
      <p v-else-if="sourceUrl" class="text-xs text-muted">
        {{ t('document.watermark.manualFallback') }}
      </p>
    </div>

    <p class="rounded-md bg-muted/20 p-2 text-xs text-muted">
      {{ activeHint }}
    </p>

    <p class="text-xs text-muted">
      {{ t('document.watermark.limitNote') }}
    </p>
  </div>
</template>
