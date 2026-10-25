<script setup lang="ts">
import VueDraggableResizable from 'vue-draggable-resizable'
import 'vue-draggable-resizable/style.css'
import type { FfmpegLabel, FfmpegSubFile } from '#shared/types/electron'
import { toURL, isVideoFile, hexToRgba, fontToStyle, getTextRenderTransform } from '~/utils/ffmpegHelper'

defineOptions({ name: 'ToolsVideoFramePreview' })

const props = withDefaults(defineProps<{
  previewFile?: { path: string, x: number, y: number, w: number, h: number } | null
  background?: {
    type: 'color' | 'boxblur' | 'file'
    color: string
    boxblur: number
    file: string | null
  }
  texts?: FfmpegLabel[]
  subs?: FfmpegSubFile[]
  baseSize: { w: number, h: number }
  frameSize: { w: number, h: number }
  readonly?: boolean
  allowFullscreen?: boolean
}>(), {
  previewFile: null,
  background: () => ({ type: 'color', color: '#000000', boxblur: 10, file: null }),
  texts: () => [],
  subs: () => [],
  readonly: false,
  allowFullscreen: true
})

const emit = defineEmits<{
  (e: 'update:main', value: { x: number, y: number, w: number, h: number }): void
  (e: 'update:texts', value: FfmpegLabel[]): void
  (e: 'update:subs', value: FfmpegSubFile[]): void
  (e: 'edit-label', value: FfmpegLabel): void
  (e: 'edit-sub-file', value: FfmpegSubFile): void
  (e: 'delete-label' | 'delete-sub-file', id: string): void
}>()

const { t } = useI18n()

const openFullscreenModal = ref(false)
const fullscreenContainerEl = ref<HTMLElement | null>(null)
const { width: fWidth, height: fHeight } = useElementSize(fullscreenContainerEl)

const fullscreenFrameSize = computed(() => {
  const { w, h } = props.baseSize
  const maxW = fWidth.value > 0 ? Math.max(fWidth.value - 32, 200) : 800
  const maxH = fHeight.value > 0 ? Math.max(fHeight.value - 32, 200) : 580
  const scale = Math.min(maxW / w, maxH / h, 1)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
})

const hasMainError = ref(false)
watch(() => props.previewFile?.path, () => {
  hasMainError.value = false
})

const sx = computed(() => props.frameSize.w / props.baseSize.w)
const sy = computed(() => props.frameSize.h / props.baseSize.h)

function toDisplay(value: number, scale: number): number {
  return Math.round(value * scale)
}

function toBase(value: number, scale: number): number {
  return Math.round(value / scale)
}

function onDragStopMain(x: number, y: number) {
  if (!props.previewFile) return
  emit('update:main', {
    x: toBase(x, sx.value),
    y: toBase(y, sy.value),
    w: props.previewFile.w,
    h: props.previewFile.h
  })
}

function onResizeStopMain(x: number, y: number, w: number, h: number) {
  if (!props.previewFile) return
  emit('update:main', {
    x: toBase(x, sx.value),
    y: toBase(y, sy.value),
    w: toBase(w, sx.value),
    h: toBase(h, sy.value)
  })
}

function onDragStop(el: FfmpegLabel | FfmpegSubFile, x: number, y: number) {
  el.x = toBase(x, sx.value)
  el.y = toBase(y, sy.value)
}

function onResizeStop(el: FfmpegLabel | FfmpegSubFile, x: number, y: number, w: number, h: number) {
  el.x = toBase(x, sx.value)
  el.y = toBase(y, sy.value)

  if ('text' in el) {
    const txt = el as FfmpegLabel
    const mode = txt.resizeMode || 'scale'
    const baseW = txt.w || 200
    const baseH = txt.h || 40
    const w_base = toBase(w, sx.value)
    const h_base = toBase(h, sy.value)

    if (mode === 'scale') {
      txt.scaleX = w_base / baseW
      txt.scaleY = h_base / baseH
    } else {
      txt.w = w_base
      txt.h = h_base
      txt.scaleX = 1
      txt.scaleY = 1
    }
  } else {
    el.w = toBase(w, sx.value)
    el.h = toBase(h, sy.value)
  }
}

type SelectedKey = 'file' | 'text'
interface SelectedItem { key: SelectedKey, value: FfmpegLabel | FfmpegSubFile }

const isContextmenu = ref(false)
const xContextmenu = ref(0)
const yContextmenu = ref(0)
const selectedItem = ref<SelectedItem>()

function handleContextMenu(e: MouseEvent, item: FfmpegLabel | FfmpegSubFile, key: SelectedKey) {
  if (props.readonly) return
  e.preventDefault()
  isContextmenu.value = false
  selectedItem.value = { key, value: item }
  nextTick().then(() => {
    isContextmenu.value = true
    xContextmenu.value = e.clientX
    yContextmenu.value = e.clientY
  })
}

function handleSelect(action: 'edit' | 'delete') {
  isContextmenu.value = false
  const item = selectedItem.value
  if (!item || props.readonly) return
  if (action === 'edit') {
    if (item.key === 'file') emit('edit-sub-file', item.value as FfmpegSubFile)
    else emit('edit-label', item.value as FfmpegLabel)
  } else {
    const id = (item.value as { id?: string }).id
    if (id) {
      if (item.key === 'file') emit('delete-sub-file', id)
      else emit('delete-label', id)
    }
  }
}

function onKeyDown(e: KeyboardEvent, el: FfmpegLabel | FfmpegSubFile, key: SelectedKey) {
  if (props.readonly) return
  const step = 5
  if (e.key === 'ArrowUp') el.y -= step
  if (e.key === 'ArrowDown') el.y += step
  if (e.key === 'ArrowLeft') el.x -= step
  if (e.key === 'ArrowRight') el.x += step
  if (e.key === 'Delete') {
    const id = (el as { id?: string }).id
    if (id) {
      if (key === 'file') emit('delete-sub-file', id)
      else emit('delete-label', id)
    }
  }
}

const contextOptions = computed(() => [
  { label: t('common.edit'), key: 'edit', icon: 'i-lucide-pencil' },
  { label: t('common.delete'), key: 'delete', icon: 'i-lucide-trash-2' }
])
</script>

<template>
  <div
    class="relative group bg-black/80 border border-gray-300 dark:border-gray-800 rounded-lg overflow-hidden select-none"
    :style="{ width: `${frameSize.w}px`, height: `${frameSize.h}px` }"
  >
    <!-- Background layer -->
    <template v-if="background.type === 'file' && background.file">
      <video
        v-if="isVideoFile(background.file)"
        :src="toURL(background.file)"
        autoplay
        loop
        muted
        playsinline
        class="absolute inset-0 w-full h-full object-cover"
        @loadedmetadata="($event.target as HTMLVideoElement).play()"
      />
      <img v-else :src="toURL(background.file)" class="absolute inset-0 w-full h-full object-cover">
    </template>
    <template v-else-if="background.type === 'boxblur' && previewFile && previewFile.path">
      <video
        v-if="isVideoFile(previewFile.path)"
        :src="toURL(previewFile.path)"
        autoplay
        loop
        muted
        playsinline
        class="absolute inset-0 w-full h-full object-cover"
        :style="`filter: blur(${background.boxblur}px)`"
        @loadedmetadata="($event.target as HTMLVideoElement).play()"
      />
      <img
        v-else
        :src="toURL(previewFile.path)"
        class="absolute inset-0 w-full h-full object-cover"
        :style="`filter: blur(${background.boxblur}px)`"
      >
    </template>
    <div v-else class="absolute inset-0" :style="{ backgroundColor: background.color }" />

    <!-- Main file -->
    <VueDraggableResizable
      v-if="previewFile && previewFile.path && !hasMainError"
      :x="toDisplay(previewFile.x, sx)"
      :y="toDisplay(previewFile.y, sy)"
      :w="Math.max(toDisplay(previewFile.w, sx), 20)"
      :h="Math.max(toDisplay(previewFile.h, sy), 20)"
      :parent="false"
      :lock-aspect-ratio="false"
      :draggable="!readonly"
      :resizable="!readonly"
      :handles="readonly ? [] : ['tl', 'tm', 'tr', 'mr', 'br', 'bm', 'bl', 'ml']"
      :drag-handle="readonly ? '' : '.drag-handle'"
      class="z-10"
      @drag-stop="onDragStopMain"
      @resize-stop="onResizeStopMain"
    >
      <div
        :class="readonly ? 'w-full h-full overflow-hidden' : 'drag-handle w-full h-full bg-white/10 overflow-hidden'"
      >
        <video
          v-if="isVideoFile(previewFile.path)"
          :src="toURL(previewFile.path)"
          autoplay
          loop
          muted
          playsinline
          class="w-full h-full object-fill"
          @loadedmetadata="($event.target as HTMLVideoElement).play()"
          @error="hasMainError = true"
        />
        <img
          v-else
          :src="toURL(previewFile.path)"
          class="w-full h-full object-fill"
          @error="hasMainError = true"
        >
      </div>
    </VueDraggableResizable>

    <!-- Corrupted / Error overlay -->
    <div
      v-if="hasMainError"
      class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-red-950/70 backdrop-blur-xs border rounded-lg border-red-500/50 p-4 text-center select-none"
    >
      <UIcon name="i-lucide-alert-triangle" class="size-8 text-red-400 mb-2 shrink-0 animate-pulse" />
      <p class="text-xs font-semibold text-red-200 mb-0.5">
        {{ t('tools.invalidMediaFile') }}
      </p>
      <p class="text-[11px] text-red-300/80 leading-relaxed max-w-[85%]">
        {{ t('tools.corruptedMedia') }}
      </p>
    </div>

    <!-- Sub files -->
    <VueDraggableResizable
      v-for="sub in subs.filter(s => !s.hidden)"
      :key="sub.id || sub.path"
      :x="toDisplay(sub.x, sx)"
      :y="toDisplay(sub.y, sy)"
      :w="Math.max(toDisplay(sub.w, sx), 20)"
      :h="Math.max(toDisplay(sub.h, sy), 20)"
      :parent="false"
      :lock-aspect-ratio="false"
      :draggable="!readonly"
      :resizable="!readonly"
      :handles="readonly ? [] : ['tl', 'tm', 'tr', 'mr', 'br', 'bm', 'bl', 'ml']"
      :drag-handle="readonly ? '' : '.drag-handle'"
      :class="[!readonly && selectedItem?.key === 'file' && selectedItem?.value === sub ? 'ring-2 ring-primary' : '']"
      class="z-20"
      tabindex="0"
      @contextmenu.prevent="handleContextMenu($event, sub, 'file')"
      @keydown="onKeyDown($event, sub, 'file')"
      @drag-stop="(x: number, y: number) => onDragStop(sub, x, y)"
      @resize-stop="(x: number, y: number, w: number, h: number) => onResizeStop(sub, x, y, w, h)"
    >
      <div
        :class="readonly ? 'w-full h-full overflow-hidden' : 'drag-handle w-full h-full bg-white/10 overflow-hidden'"
      >
        <video
          v-if="isVideoFile(sub.path)"
          :src="toURL(sub.path)"
          autoplay
          loop
          muted
          playsinline
          class="w-full h-full object-fill"
          @loadedmetadata="($event.target as HTMLVideoElement).play()"
        />
        <img v-else :src="toURL(sub.path)" class="w-full h-full object-fill">
      </div>
    </VueDraggableResizable>

    <!-- Text labels -->
    <VueDraggableResizable
      v-for="txt in texts.filter(t => !t.hidden)"
      :key="txt.id || txt.text"
      :x="toDisplay(txt.x, sx)"
      :y="toDisplay(txt.y, sy)"
      :w="Math.max(toDisplay(getTextRenderTransform(txt).width, sx), 20)"
      :h="Math.max(toDisplay(getTextRenderTransform(txt).height, sy), 20)"
      :parent="false"
      :lock-aspect-ratio="(txt.resizeMode || 'scale') === 'scale'"
      :draggable="!readonly"
      :resizable="!readonly"
      :handles="readonly ? [] : ['tl', 'tm', 'tr', 'mr', 'br', 'bm', 'bl', 'ml']"
      :drag-handle="readonly ? '' : '.drag-handle'"
      :class="[!readonly && selectedItem?.key === 'text' && selectedItem?.value === txt ? 'ring-2 ring-primary' : '']"
      class="z-30"
      tabindex="0"
      @contextmenu.prevent="handleContextMenu($event, txt, 'text')"
      @keydown="onKeyDown($event, txt, 'text')"
      @drag-stop="(x: number, y: number) => onDragStop(txt, x, y)"
      @resize-stop="(x: number, y: number, w: number, h: number) => onResizeStop(txt, x, y, w, h)"
    >
      <div
        :class="readonly ? 'w-full h-full flex items-center justify-center' : 'drag-handle w-full h-full flex items-center justify-center cursor-move'"
      >
        <div
          class="text-center leading-tight flex items-center justify-center h-full w-full"
          :class="txt.resizeMode === 'box' ? 'whitespace-pre-wrap' : 'whitespace-nowrap'"
          :style="{
            color: txt.color,
            fontSize: `${(getTextRenderTransform(txt).fontSize * sx).toFixed(2)}px`,
            backgroundColor: txt.box ? hexToRgba(txt.boxColor || '#A3A3A3', txt.boxOpacity || 0.5) : 'transparent',
            padding: txt.box ? `${Math.max(toDisplay(getTextRenderTransform(txt).boxBorderW, sx), 1)}px` : '0',
            ...fontToStyle(txt)
          }"
        >
          {{ txt.text }}
        </div>
      </div>
    </VueDraggableResizable>

    <div
      v-if="!texts.length && !subs.length && !previewFile"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <p class="text-xs text-muted bg-black/50 px-2 py-1 rounded">
        {{ t('tools.noPreview') }}
      </p>
    </div>

    <!-- Hover Fullscreen Action Button -->
    <div
      v-if="allowFullscreen && !hasMainError && (previewFile || texts.length || subs.length)"
      class="absolute top-2 right-2 z-40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto"
    >
      <UButton
        icon="i-lucide-maximize-2"
        size="xs"
        color="neutral"
        variant="solid"
        :title="t('global.fullscreen')"
        class="bg-black/60 hover:bg-black/90 text-white backdrop-blur-xs rounded shadow cursor-pointer"
        @click.stop="openFullscreenModal = true"
      />
    </div>

    <!-- Context menu -->
    <div
      v-if="isContextmenu"
      class="fixed z-50 min-w-3.75 rounded-lg border border-default bg-elevated shadow-lg p-1"
      :style="{ left: `${xContextmenu}px`, top: `${yContextmenu}px` }"
      @click.stop
    >
      <UButton
        v-for="opt in contextOptions"
        :key="opt.key"
        block
        size="sm"
        variant="ghost"
        :icon="opt.icon"
        :label="opt.label"
        :color="opt.key === 'delete' ? 'error' : 'neutral'"
        class="justify-start"
        @click="handleSelect(opt.key as 'edit' | 'delete')"
      />
    </div>
    <div
      v-if="isContextmenu"
      class="fixed inset-0 z-40"
      @click="isContextmenu = false"
      @contextmenu.prevent="isContextmenu = false"
    />
  </div>

  <!-- Fullscreen Preview Modal -->
  <BaseResponsiveModal
    v-if="allowFullscreen"
    v-model:open="openFullscreenModal"
    v-model="openFullscreenModal"
    :title="t('tools.previewVideo')"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <div
      ref="fullscreenContainerEl"
      class="w-full flex items-center justify-center p-4 bg-neutral-950/90 dark:bg-black/90 rounded-xl min-h-[60vh] max-h-[75vh] overflow-hidden"
    >
      <ToolsVideoFramePreview
        :preview-file="previewFile"
        :background="background"
        :texts="texts"
        :subs="subs"
        :base-size="baseSize"
        :frame-size="fullscreenFrameSize"
        :readonly="true"
        :allow-fullscreen="false"
      />
    </div>
  </BaseResponsiveModal>
</template>

<style scoped></style>
