<script setup lang="ts">
import VueDraggableResizable from 'vue-draggable-resizable'
import 'vue-draggable-resizable/style.css'
import type { FfmpegLabel } from '~/types'

defineOptions({ name: 'ToolsVideoPreview' })

const props = withDefaults(defineProps<{
  previewFile?: string
  background?: {
    type?: 'color' | 'boxblur' | 'file'
    color?: string
    boxblur?: number
    file?: string | null
  }
  labels?: FfmpegLabel[]
  baseSize?: { w: number, h: number }
  frameSize?: { w: number, h: number }
}>(), {
  previewFile: '',
  background: () => ({ type: 'color', color: '#000000', boxblur: 10, file: null }),
  labels: () => [],
  baseSize: () => ({ w: 1920, h: 1080 }),
  frameSize: () => ({ w: 480, h: 270 })
})

const emit = defineEmits<{
  (e: 'update:labels', labels: FfmpegLabel[]): void
}>()

const { t } = useI18n()

const sx = computed(() => props.frameSize.w / props.baseSize.w)
const sy = computed(() => props.frameSize.h / props.baseSize.h)

function toDisplay(value: number, scale: number): number {
  return Math.round(value * scale)
}

function toBase(value: number, scale: number): number {
  return Math.round(value / scale)
}

function mediaUrl(filePath: string): string {
  if (!filePath) return ''
  if (/^(file:|https?:|data:)/.test(filePath)) return filePath
  return 'file://' + filePath.replace(/\\/g, '/')
}

function isVideo(filePath: string): boolean {
  return /\.(mp4|mkv|webm|avi|mov|wmv|flv|ts|m4v)$/i.test(filePath)
}

function onDragStop(label: FfmpegLabel, dispX: number, dispY: number) {
  label.x = toBase(dispX, sx.value)
  label.y = toBase(dispY, sy.value)
  emit('update:labels', [...props.labels])
}

function onResizeStop(label: FfmpegLabel, dispX: number, dispY: number, dispW: number, dispH: number) {
  label.x = toBase(dispX, sx.value)
  label.y = toBase(dispY, sy.value)
  label.w = toBase(dispW, sx.value)
  label.h = toBase(dispH, sy.value)
  emit('update:labels', [...props.labels])
}

function removeLabel(id: number) {
  emit('update:labels', props.labels.filter((_, idx) => idx !== id))
}
</script>

<template>
  <div
    class="relative bg-black/80 border rounded-lg overflow-hidden select-none"
    :style="{ width: frameSize.w + 'px', height: frameSize.h + 'px' }"
  >
    <!-- Background layer -->
    <template v-if="background.type === 'file' && background.file">
      <video
        v-if="isVideo(background.file)"
        :src="mediaUrl(background.file)"
        autoplay
        loop
        muted
        playsinline
        class="absolute inset-0 w-full h-full object-cover"
      />
      <img v-else :src="mediaUrl(background.file)" class="absolute inset-0 w-full h-full object-cover">
    </template>
    <template v-else-if="background.type === 'boxblur' && previewFile">
      <video
        v-if="isVideo(previewFile)"
        :src="mediaUrl(previewFile)"
        autoplay
        loop
        muted
        playsinline
        class="absolute inset-0 w-full h-full object-cover"
        :style="`filter: blur(${background.boxblur || 10}px);`"
      />
      <img
        v-else
        :src="mediaUrl(previewFile)"
        class="absolute inset-0 w-full h-full object-cover"
        :style="`filter: blur(${background.boxblur || 10}px);`"
      >
    </template>
    <div v-else class="absolute inset-0" :style="{ backgroundColor: background.color || '#000000' }" />

    <!-- Main file -->
    <template v-if="previewFile">
      <video
        v-if="isVideo(previewFile)"
        :src="mediaUrl(previewFile)"
        autoplay
        loop
        muted
        playsinline
        class="absolute inset-0 w-full h-full object-contain"
      />
      <img v-else :src="mediaUrl(previewFile)" class="absolute inset-0 w-full h-full object-contain">
    </template>

    <!-- Labels overlays -->
    <VueDraggableResizable
      v-for="(label, idx) in labels"
      :key="idx"
      :x="toDisplay(label.x || 0, sx)"
      :y="toDisplay(label.y || 0, sy)"
      :w="toDisplay(label.w || 200, sx)"
      :h="toDisplay(label.h || 40, sy)"
      :parent="true"
      :min-width="20"
      :min-height="20"
      :handles="['tl', 'tm', 'tr', 'mr', 'br', 'bm', 'bl', 'ml']"
      :drag-handle="'.drag-handle'"
      class="z-10"
      @drag-stop="(x: number, y: number) => onDragStop(label, x, y)"
      @resize-stop="(x: number, y: number, w: number, h: number) => onResizeStop(label, x, y, w, h)"
    >
      <div class="drag-handle w-full h-full relative flex items-center justify-center rounded border border-dashed border-primary/60 bg-primary/5">
        <div
          class="text-center whitespace-pre-wrap leading-tight px-1"
          :style="{
            color: label.color,
            fontSize: `${label.size}px`
          }"
        >
          {{ label.text }}
        </div>
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="error"
          class="absolute -top-2 -right-2 z-20 size-5"
          :aria-label="t('tools.removeLabel')"
          @click.stop="removeLabel(idx)"
        />
      </div>
    </VueDraggableResizable>

    <div v-if="!labels.length" class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <p class="text-xs text-muted bg-black/50 px-2 py-1 rounded">
        {{ t('tools.noLabelsPreview') }}
      </p>
    </div>
  </div>
</template>

<style scoped></style>
