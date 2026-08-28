<script setup lang="ts">
import Sortable from 'sortablejs'
import type { FfmpegConfig, FfmpegLabel, FfmpegSubFile } from '~/types'
import { generateId, getMediaSize, alignAll, scalePercentUI, scaleElementX, scaleElementY, isVideoFile } from '~/utils/ffmpegHelper'

defineOptions({ name: 'ToolsVideoConfigModal' })

const props = withDefaults(defineProps<{
  open?: boolean
  preset?: FfmpegConfig | null
  loading?: boolean
  previewFile?: string
}>(), {
  open: false,
  preset: null,
  loading: false,
  previewFile: ''
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', data: Partial<FfmpegConfig>): void
  (e: 'delete', preset: FfmpegConfig): void
}>()

const { t } = useI18n()
const { pickFile } = useFileSystem()

const labelEditorOpen = ref(false)
const editingLabelId = ref<string>()

const aspectRatioOptions = computed(() => [
  { label: t('tools.aspectOriginal'), value: 0 },
  { label: t('tools.aspect169'), value: 1 },
  { label: t('tools.aspect916'), value: 2 },
  { label: t('tools.aspect11'), value: 3 },
  { label: t('tools.aspect43'), value: 4 }
])

const aspectSizes: Record<number, { w: number, h: number }> = {
  0: { w: 1920, h: 1080 },
  1: { w: 1920, h: 1080 },
  2: { w: 1080, h: 1920 },
  3: { w: 1080, h: 1080 },
  4: { w: 1440, h: 1080 }
}

const form = reactive({
  title: '',
  aspect_ratio: 0,
  background_type: 'color' as 'color' | 'boxblur' | 'file',
  background_color: '#000000',
  background_boxblur: 10,
  background_file: '',
  center: 1,
  speed: 1,
  volume: 1,
  zoom_enable: 0,
  zoom_ratio: 1.1,
  zoom_time_start: 0,
  zoom_time_duration: 0,
  zoom_time_loop: 0,
  hflip_enable: 0,
  hflip_all: 1,
  hflip_time_start: 0,
  hflip_time_duration: 0,
  hflip_time_loop: 0,
  vflip_enable: 0,
  vflip_all: 1,
  vflip_time_start: 0,
  vflip_time_duration: 0,
  vflip_time_loop: 0,
  scale_x: 0,
  scale_y: 0,
  scale_w: 0,
  scale_h: 0,
  labels: [] as FfmpegLabel[],
  files: [] as FfmpegSubFile[],
  subtitle: '',
  render_code: ''
})

const scaleMainFile = reactive({
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  baseW: 100,
  baseH: 100,
  lastW: 100,
  lastH: 100,
  min: 1,
  max: 500,
  step: 1
})

const scaleMarks = [1, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500].reduce<Record<number, string>>((acc, cur) => {
  acc[cur] = `${cur}%`
  return acc
}, {})

const labelForm = reactive({
  text: '',
  size: 48,
  color: '#ffffff',
  x: 0,
  y: 0,
  w: 500,
  h: 100,
  box: 0,
  boxColor: '#000000',
  boxOpacity: 0.5,
  boxBorderW: 10,
  path: '',
  scaleText: false
})

const isEditMode = computed(() => !!props.preset?.id)

watch(() => props.open, async (open) => {
  if (open) {
    if (props.preset) populateForm(props.preset)
    else resetForm()
    await initPreview()
  }
})

function parseJsonArray(value: string | unknown[] | null | undefined): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return []
    }
  }
  return []
}

const isSaveDisabled = computed(() => props.loading || !form.title.trim())

function resetForm() {
  form.title = ''
  form.aspect_ratio = 0
  form.background_type = 'color'
  form.background_color = '#000000'
  form.background_boxblur = 10
  form.background_file = ''
  form.center = 1
  form.speed = 1
  form.volume = 1
  form.zoom_enable = 0
  form.zoom_ratio = 1.1
  form.zoom_time_start = 0
  form.zoom_time_duration = 0
  form.zoom_time_loop = 0
  form.hflip_enable = 0
  form.hflip_all = 1
  form.hflip_time_start = 0
  form.hflip_time_duration = 0
  form.hflip_time_loop = 0
  form.vflip_enable = 0
  form.vflip_all = 1
  form.vflip_time_start = 0
  form.vflip_time_duration = 0
  form.vflip_time_loop = 0
  form.scale_x = 0
  form.scale_y = 0
  form.scale_w = 0
  form.scale_h = 0
  form.labels = []
  form.files = []
  form.subtitle = ''
  form.render_code = ''
}

function populateForm(c: FfmpegConfig) {
  form.title = c?.title || ''
  form.aspect_ratio = c?.aspect_ratio ?? 0
  form.background_type = (c?.background_type || 'color') as 'color' | 'boxblur' | 'file'
  form.background_color = c?.background_color || '#000000'
  form.background_boxblur = c?.background_boxblur ?? 10
  form.background_file = c?.background_file || ''
  form.center = c?.center ?? 1
  form.speed = c?.speed ?? 1
  form.volume = c?.volume ?? 1
  form.zoom_enable = c?.zoom_enable ?? 0
  form.zoom_ratio = c?.zoom_ratio ?? 1.1
  form.zoom_time_start = c?.zoom_time_start ?? 0
  form.zoom_time_duration = c?.zoom_time_duration ?? 0
  form.zoom_time_loop = c?.zoom_time_loop ?? 0
  form.hflip_enable = c?.hflip_enable ?? 0
  form.hflip_all = c?.hflip_all ?? 1
  form.hflip_time_start = c?.hflip_time_start ?? 0
  form.hflip_time_duration = c?.hflip_time_duration ?? 0
  form.hflip_time_loop = c?.hflip_time_loop ?? 0
  form.vflip_enable = c?.vflip_enable ?? 0
  form.vflip_all = c?.vflip_all ?? 1
  form.vflip_time_start = c?.vflip_time_start ?? 0
  form.vflip_time_duration = c?.vflip_time_duration ?? 0
  form.vflip_time_loop = c?.vflip_time_loop ?? 0
  form.scale_x = c?.scale_x ?? 0
  form.scale_y = c?.scale_y ?? 0
  form.scale_w = c?.scale_w ?? 0
  form.scale_h = c?.scale_h ?? 0
  form.labels = parseJsonArray(c?.labels) as FfmpegLabel[]
  form.files = parseJsonArray(c?.files) as FfmpegSubFile[]
  form.subtitle = c?.subtitle || ''
  form.render_code = c?.render_code || ''
}

const background = computed(() => ({
  type: form.background_type,
  color: form.background_color,
  boxblur: form.background_boxblur,
  file: form.background_file || null
}))

const baseSize = computed(() => {
  const size = aspectSizes[form.aspect_ratio] ?? { w: 1920, h: 1080 }
  return { w: size.w, h: size.h }
})

const previewContainer = ref<HTMLElement | null>(null)
const { width: containerWidth, height: containerHeight } = useElementSize(previewContainer)

const frameSize = computed(() => {
  const { w, h } = baseSize.value
  const maxW = containerWidth.value > 0 ? Math.max(containerWidth.value - 32, 100) : 300
  const maxH = containerHeight.value > 0 ? Math.max(containerHeight.value - 32, 100) : 300
  const scale = Math.min(maxW / w, maxH / h, 1)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
})

watch(frameSize, (newVal) => {
  if (newVal.w > 100 && form.labels.some(lbl => lbl.resizeMode === undefined)) {
    const scale = baseSize.value.w / newVal.w
    form.labels = form.labels.map(lbl => {
      if (lbl.resizeMode === undefined) {
        return {
          ...lbl,
          size: Math.round(lbl.size * scale),
          w: lbl.w ?? 200,
          h: lbl.h ?? 60,
          scaleX: 1,
          scaleY: 1,
          resizeMode: 'scale'
        }
      }
      return lbl
    })
  }
}, { immediate: true })

const previewFile = computed(() => {
  if (!props.previewFile) return null
  return {
    path: props.previewFile,
    x: form.scale_x,
    y: form.scale_y,
    w: form.scale_w || baseSize.value.w,
    h: form.scale_h || baseSize.value.h
  }
})

async function initPreview() {
  const mediaSize = props.previewFile ? await getMediaSize(props.previewFile) : baseSize.value
  form.scale_w = form.scale_w || mediaSize.w
  form.scale_h = form.scale_h || mediaSize.h
  scaleMainFile.baseW = mediaSize.w
  scaleMainFile.baseH = mediaSize.h
  scaleMainFile.w = scalePercentUI(form.scale_w, mediaSize.w)
  scaleMainFile.h = scalePercentUI(form.scale_h, mediaSize.h)
  scaleMainFile.lastW = scaleMainFile.w
  scaleMainFile.lastH = scaleMainFile.h
}

function onUpdateMain(el: { x: number, y: number, w: number, h: number }) {
  form.scale_x = el.x
  form.scale_y = el.y
  form.scale_w = el.w
  form.scale_h = el.h
  scaleMainFile.w = scalePercentUI(el.w, scaleMainFile.baseW)
  scaleMainFile.h = scalePercentUI(el.h, scaleMainFile.baseH)
  scaleMainFile.lastW = scaleMainFile.w
  scaleMainFile.lastH = scaleMainFile.h
}

function onScaleChange(type: 'w' | 'h') {
  if (type === 'w') {
    if (scaleMainFile.lastW !== scaleMainFile.w) {
      scaleMainFile.lastW = scaleMainFile.w
      scaleElementX(form, baseSize.value.w, scaleMainFile)
    }
  } else {
    if (scaleMainFile.lastH !== scaleMainFile.h) {
      scaleMainFile.lastH = scaleMainFile.h
      scaleElementY(form, baseSize.value.h, scaleMainFile)
    }
  }
}

function onAlignCenter(value: string) {
  const frame = baseSize.value
  const [target, mode] = value.split('-') as ['all' | 'labels' | 'files', 'both' | 'horizontal' | 'vertical']
  if (target === 'all') {
    form.labels = alignAll(form.labels, frame, 'both')
    form.files = alignAll(form.files, frame, 'both')
  } else if (target === 'labels') {
    form.labels = alignAll(form.labels, frame, mode)
  } else {
    form.files = alignAll(form.files, frame, mode)
  }
}

function onSave() {
  if (isSaveDisabled.value) return
  emit('save', {
    ...form,
    id: props.preset?.id
  })
}

async function pickSubFile() {
  const file = await pickFile({
    title: t('tools.inputSubFile'),
    filters: [
      { name: 'Media (Image & Video)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'mkv', 'webm', 'avi', 'mov'] },
      { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
      { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov'] }
    ]
  })
  if (typeof file === 'string' && file) {
    const { w, h } = await getMediaSize(file)
    form.files.push({
      id: generateId(),
      path: file,
      type: isVideoFile(file) ? 'video' : 'image',
      x: 0,
      y: 0,
      w,
      h
    })
  }
}

async function onEditSubFile(sub: FfmpegSubFile) {
  const file = await pickFile({
    title: t('tools.inputSubFile'),
    filters: [
      { name: 'Media (Image & Video)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'mkv', 'webm', 'avi', 'mov'] },
      { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
      { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov'] }
    ]
  })
  if (typeof file === 'string' && file) {
    sub.path = file
    sub.type = isVideoFile(file) ? 'video' : 'image'
  }
}

function openAddLabel() {
  editingLabelId.value = undefined
  labelForm.text = ''
  labelForm.size = 48
  labelForm.color = '#ffffff'
  labelForm.box = 0
  labelForm.boxColor = '#000000'
  labelForm.boxOpacity = 0.5
  labelForm.boxBorderW = 10
  labelForm.scaleText = false
  labelEditorOpen.value = true
}

function onEditLabel(label: FfmpegLabel) {
  editingLabelId.value = label.id
  labelForm.text = label.text
  labelForm.size = label.size
  labelForm.color = label.color
  labelForm.box = label.box || 0
  labelForm.boxColor = label.boxColor || '#000000'
  labelForm.boxOpacity = label.boxOpacity ?? 0.5
  labelForm.boxBorderW = label.boxBorderW ?? 10
  labelForm.scaleText = label.resizeMode !== 'box'
  labelEditorOpen.value = true
}

function onSaveLabel() {
  if (!labelForm.text.trim()) return
  const existing = editingLabelId.value ? form.labels.find(el => el.id === editingLabelId.value) : null
  const data: FfmpegLabel = {
    id: editingLabelId.value || generateId(),
    text: labelForm.text,
    size: labelForm.size,
    color: labelForm.color,
    x: existing ? existing.x : 0,
    y: existing ? existing.y : 0,
    w: existing ? existing.w : labelForm.w,
    h: existing ? existing.h : labelForm.h,
    scaleX: existing?.scaleX ?? 1,
    scaleY: existing?.scaleY ?? 1,
    resizeMode: labelForm.scaleText ? 'scale' : 'box',
    box: labelForm.box,
    boxColor: labelForm.boxColor,
    boxOpacity: labelForm.boxOpacity,
    boxBorderW: labelForm.boxBorderW
  }
  if (editingLabelId.value) {
    const idx = form.labels.findIndex(el => el.id === editingLabelId.value)
    if (idx > -1) form.labels[idx] = data
  } else {
    form.labels.push(data)
  }
  labelEditorOpen.value = false
}

function removeLabel(id: string | undefined) {
  form.labels = form.labels.filter(el => el.id !== id)
}

const showDeleteSubModal = ref(false)
const subToDelete = ref<string | null>(null)

function openDeleteSubFile(id: string | undefined) {
  if (!id) return
  subToDelete.value = id
  showDeleteSubModal.value = true
}

function doDeleteSubFile() {
  if (subToDelete.value) {
    form.files = form.files.filter(el => el.id !== subToDelete.value)
    subToDelete.value = null
  }
  showDeleteSubModal.value = false
}

const showDeleteLabelModal = ref(false)
const labelToDelete = ref<string | null>(null)

function openDeleteLabel(id: string | undefined) {
  if (!id) return
  labelToDelete.value = id
  showDeleteLabelModal.value = true
}

function doDeleteLabel() {
  if (labelToDelete.value) {
    form.labels = form.labels.filter(el => el.id !== labelToDelete.value)
    labelToDelete.value = null
  }
  showDeleteLabelModal.value = false
}

const showDeleteSubtitleModal = ref(false)

function openDeleteSubtitle() {
  showDeleteSubtitleModal.value = true
}

function doDeleteSubtitle() {
  form.subtitle = ''
  showDeleteSubtitleModal.value = false
}

const alignOptions = computed(() => [
  [
    { label: t('tools.alignAll'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('all-both') },
    { label: t('tools.alignText'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('labels-both') },
    { label: t('tools.alignTextH'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('labels-horizontal') },
    { label: t('tools.alignTextV'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('labels-vertical') },
    { label: t('tools.alignFile'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('files-both') },
    { label: t('tools.alignFileH'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('files-horizontal') },
    { label: t('tools.alignFileV'), icon: 'i-lucide-align-center-horizontal', onSelect: () => onAlignCenter('files-vertical') }
  ]
])

const subFilesListEl = ref<HTMLElement | null>(null)
const sortableSubFiles = ref<any | null>(null)

function destroySubFilesSortable() {
  if (sortableSubFiles.value) {
    sortableSubFiles.value.destroy()
    sortableSubFiles.value = null
  }
}

function initSubFilesSortable() {
  destroySubFilesSortable()
  nextTick().then(() => {
    if (!subFilesListEl.value) return
    sortableSubFiles.value = new Sortable(subFilesListEl.value, {
      draggable: '.sub-file-item',
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      fallbackClass: 'sortable-fallback',
      forceFallback: true,
      swapThreshold: 0.65,
      onUpdate: (evt: any) => {
        const { oldIndex, newIndex } = evt
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        const updated = [...form.files]
        const [movedItem] = updated.splice(oldIndex, 1)
        if (movedItem) {
          updated.splice(newIndex, 0, movedItem)
          form.files = updated
        }
      }
    })
  })
}

const labelsListEl = ref<HTMLElement | null>(null)
const sortableLabels = ref<any | null>(null)

function destroyLabelsSortable() {
  if (sortableLabels.value) {
    sortableLabels.value.destroy()
    sortableLabels.value = null
  }
}

function initLabelsSortable() {
  destroyLabelsSortable()
  nextTick().then(() => {
    if (!labelsListEl.value) return
    sortableLabels.value = new Sortable(labelsListEl.value, {
      draggable: '.label-item',
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      fallbackClass: 'sortable-fallback',
      forceFallback: true,
      swapThreshold: 0.65,
      onUpdate: (evt: any) => {
        const { oldIndex, newIndex } = evt
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        const updated = [...form.labels]
        const [movedItem] = updated.splice(oldIndex, 1)
        if (movedItem) {
          updated.splice(newIndex, 0, movedItem)
          form.labels = updated
        }
      }
    })
  })
}

const addOptions = computed(() => [
  [
    { label: t('tools.addText'), icon: 'i-lucide-type', onSelect: () => openAddLabel() },
    { label: t('tools.addMedia'), icon: 'i-lucide-image-plus', onSelect: () => pickSubFile() }
  ]
])

const showDeleteBgModal = ref(false)

function openDeleteBackground() {
  showDeleteBgModal.value = true
}

function doDeleteBackground() {
  form.background_file = ''
  form.background_type = 'color'
  showDeleteBgModal.value = false
}

watch(subFilesListEl, (el) => {
  if (el) {
    initSubFilesSortable()
  } else {
    destroySubFilesSortable()
  }
})

watch(labelsListEl, (el) => {
  if (el) {
    initLabelsSortable()
  } else {
    destroyLabelsSortable()
  }
})

onUnmounted(() => {
  destroySubFilesSortable()
  destroyLabelsSortable()
})
</script>

<template>
  <UModal :open="open" fullscreen :title="isEditMode ? t('common.edit') : t('common.create')"
    :description="t('tools.configPreset')" :dismissible="true" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex h-full gap-6 overflow-hidden">
        <!-- Left: preview -->
        <div ref="previewContainer"
          class="flex items-center justify-center flex-1 min-w-0 border-r border-default pr-6 h-full">
          <ToolsVideoFramePreview :preview-file="previewFile" :background="background" :texts="form.labels"
            :subs="form.files" :base-size="baseSize" :frame-size="frameSize" @update:main="onUpdateMain"
            @update:texts="form.labels = $event" @update:subs="form.files = $event" @edit-label="onEditLabel"
            @edit-sub-file="onEditSubFile" @delete-label="openDeleteLabel" @delete-sub-file="openDeleteSubFile" />
        </div>

        <!-- Right: properties -->
        <div class="flex-1 overflow-y-auto pr-2 space-y-6 min-w-0">
          <!-- 1. Basic Settings Section -->
          <div
            class="bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-100 dark:border-neutral-800 p-4 rounded-xl space-y-4">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-settings" />
              {{ t('tools.basic') }}
            </p>

            <UFormField :label="t('tools.configTitle')" :required="true">
              <UInput v-model="form.title" :placeholder="t('tools.configTitlePrompt')" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField :label="t('tools.aspectRatio')">
                <USelect v-model.number="form.aspect_ratio" :items="aspectRatioOptions" class="w-full" />
              </UFormField>
              <UFormField :label="t('tools.bgType')">
                <USelect v-model="form.background_type" :items="[
                  { label: 'Color', value: 'color' },
                  { label: 'Box Blur', value: 'boxblur' },
                  { label: t('tools.bgFile'), value: 'file' }
                ]" class="w-full" />
              </UFormField>
            </div>

            <div class="space-y-3 pt-2">
              <!-- Color Background Config -->
              <div :class="[
                'p-3.5 border rounded-xl transition duration-150 cursor-pointer',
                form.background_type === 'color'
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-default bg-neutral-100/10 dark:bg-neutral-800/10 opacity-60 hover:opacity-80'
              ]" @click="form.background_type = 'color'">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-default">
                    <UIcon name="i-lucide-palette" class="size-3.5" />
                    {{ t('tools.bgColor') }}
                  </span>
                  <span v-if="form.background_type === 'color'" class="text-xs font-semibold text-primary">
                    {{ t('tools.active') }}
                  </span>
                </div>
                <div class="flex gap-2" @click.stop>
                  <UInput v-model="form.background_color" type="color" class="w-12 h-9 p-0 border-0 cursor-pointer" :disabled="form.background_type !== 'color'" />
                  <UInput v-model="form.background_color" placeholder="#000000" class="flex-1" :disabled="form.background_type !== 'color'" />
                </div>
              </div>

              <!-- Box Blur Background Config -->
              <div :class="[
                'p-3.5 border rounded-xl transition duration-150 cursor-pointer',
                form.background_type === 'boxblur'
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-default bg-neutral-100/10 dark:bg-neutral-800/10 opacity-60 hover:opacity-80'
              ]" @click="form.background_type = 'boxblur'">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-default">
                    <UIcon name="i-lucide-droplet" class="size-3.5" />
                    {{ t('tools.bgBlur') }}
                  </span>
                  <span v-if="form.background_type === 'boxblur'" class="text-xs font-semibold text-primary">
                    {{ t('tools.active') }}
                  </span>
                </div>
                <div class="flex items-center gap-4" @click.stop>
                  <USlider v-model="form.background_boxblur" :min="5" :max="50" class="flex-1" :disabled="form.background_type !== 'boxblur'" />
                  <span class="text-sm font-medium w-8 text-right text-default">{{ form.background_boxblur }}</span>
                </div>
              </div>

              <!-- Media File Background Config -->
              <div :class="[
                'p-3.5 border rounded-xl transition duration-150 cursor-pointer',
                form.background_type === 'file'
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-default bg-neutral-100/10 dark:bg-neutral-800/10 opacity-60 hover:opacity-80'
              ]" @click="form.background_type = 'file'">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 text-default">
                    <UIcon name="i-lucide-image" class="size-3.5" />
                    {{ t('tools.bgFile') }}
                  </span>
                  <span v-if="form.background_type === 'file'" class="text-xs font-semibold text-primary">
                    {{ t('tools.active') }}
                  </span>
                </div>
                <div class="flex gap-2 w-full" @click.stop>
                  <BaseFilePicker v-model="form.background_file" mode="file" placeholder="D:/backgrounds/bg.png" :filters="[
                    { name: 'Media (Image & Video)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'mkv', 'webm', 'avi', 'mov'] },
                    { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
                    { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov'] }
                  ]" class="flex-1" :disabled="form.background_type !== 'file'" />
                  <UButton v-if="form.background_file" icon="i-lucide-trash-2" color="error" variant="soft"
                    @click.stop="openDeleteBackground" />
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Playback Adjustments Section -->
          <div
            class="bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-100 dark:border-neutral-800 p-4 rounded-xl space-y-4">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-gauge" />
              {{ t('tools.speedVolume') }}
            </p>
            <div class="grid grid-cols-2 gap-4">
              <UFormField :label="t('tools.speed')">
                <div class="flex items-center gap-3">
                  <USlider v-model="form.speed" :min="0.5" :max="3.0" :step="0.1" class="flex-1" />
                  <span class="text-xs font-semibold w-10 text-right shrink-0">{{ form.speed }}x</span>
                </div>
              </UFormField>
              <UFormField :label="t('tools.volume')">
                <div class="flex items-center gap-3">
                  <USlider v-model="form.volume" :min="0.0" :max="3.0" :step="0.1" class="flex-1" />
                  <span class="text-xs font-semibold w-10 text-right shrink-0">{{ Math.round(form.volume * 100)
                    }}%</span>
                </div>
              </UFormField>
            </div>
          </div>

          <!-- 3. Transformations & Zoom Section -->
          <div
            class="bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-100 dark:border-neutral-800 p-4 rounded-xl space-y-4">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-move-3d" />
              {{ t('tools.flips') }}
            </p>

            <!-- Zoom Controls -->
            <div class="border-b border-default pb-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ t('tools.zoom') }}</span>
                <USwitch v-model="form.zoom_enable" :true-value="1" :false-value="0" />
              </div>
              <div v-if="form.zoom_enable === 1" class="space-y-4 pt-2">
                <UFormField :label="t('tools.zoomRatio')">
                  <div class="flex items-center gap-4">
                    <USlider v-model="form.zoom_ratio" :min="1.0" :max="2.0" :step="0.05" class="flex-1" />
                    <span class="text-sm font-medium w-12 text-right">{{ form.zoom_ratio }}x</span>
                  </div>
                </UFormField>
                <div class="grid grid-cols-3 gap-4">
                  <UFormField :label="t('tools.zoomStart')">
                    <UInput v-model.number="form.zoom_time_start" type="number" min="0" />
                  </UFormField>
                  <UFormField :label="t('tools.zoomDuration')">
                    <UInput v-model.number="form.zoom_time_duration" type="number" min="0" />
                  </UFormField>
                  <UFormField :label="t('tools.zoomLoop')">
                    <UInput v-model.number="form.zoom_time_loop" type="number" min="0" />
                  </UFormField>
                </div>
              </div>
            </div>

            <!-- Horizontal Flip Controls -->
            <div class="border-b border-default pb-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ t('tools.hflip') }}</span>
                <USwitch v-model="form.hflip_enable" :true-value="1" :false-value="0" />
              </div>
              <div v-if="form.hflip_enable === 1" class="space-y-4 pt-2">
                <UCheckbox v-model="form.hflip_all" :true-value="1" :false-value="0" :label="t('tools.flipAll')" />
                <div v-if="form.hflip_all === 0" class="grid grid-cols-3 gap-4">
                  <UFormField :label="t('tools.zoomStart')">
                    <UInput v-model.number="form.hflip_time_start" type="number" min="0" />
                  </UFormField>
                  <UFormField :label="t('tools.zoomDuration')">
                    <UInput v-model.number="form.hflip_time_duration" type="number" min="0" />
                  </UFormField>
                  <UFormField :label="t('tools.zoomLoop')">
                    <UInput v-model.number="form.hflip_time_loop" type="number" min="0" />
                  </UFormField>
                </div>
              </div>
            </div>

            <!-- Vertical Flip Controls -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ t('tools.vflip') }}</span>
                <USwitch v-model="form.vflip_enable" :true-value="1" :false-value="0" />
              </div>
              <div v-if="form.vflip_enable === 1" class="space-y-4 pt-2">
                <UCheckbox v-model="form.vflip_all" :true-value="1" :false-value="0" :label="t('tools.flipAll')" />
                <div v-if="form.vflip_all === 0" class="grid grid-cols-3 gap-4">
                  <UFormField :label="t('tools.zoomStart')">
                    <UInput v-model.number="form.vflip_time_start" type="number" min="0" />
                  </UFormField>
                  <UFormField :label="t('tools.zoomDuration')">
                    <UInput v-model.number="form.vflip_time_duration" type="number" min="0" />
                  </UFormField>
                  <UFormField :label="t('tools.zoomLoop')">
                    <UInput v-model.number="form.vflip_time_loop" type="number" min="0" />
                  </UFormField>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Scale Section -->
          <div
            class="bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-100 dark:border-neutral-800 p-4 rounded-xl space-y-4">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-maximize-2" />
              {{ t('tools.scale') }}
            </p>
            <UFormField :label="t('tools.scaleHorizontal')">
              <div class="flex items-center gap-4">
                <USlider v-model="scaleMainFile.w" :min="scaleMainFile.min" :max="scaleMainFile.max"
                  :step="scaleMainFile.step" :marks="scaleMarks" class="flex-1" @change="onScaleChange('w')" />
                <UInput v-model.number="scaleMainFile.w" type="number" class="w-20" :min="scaleMainFile.min"
                  :max="scaleMainFile.max" />
              </div>
            </UFormField>
            <UFormField :label="t('tools.scaleVertical')">
              <div class="flex items-center gap-4">
                <USlider v-model="scaleMainFile.h" :min="scaleMainFile.min" :max="scaleMainFile.max"
                  :step="scaleMainFile.step" :marks="scaleMarks" class="flex-1" @change="onScaleChange('h')" />
                <UInput v-model.number="scaleMainFile.h" type="number" class="w-20" :min="scaleMainFile.min"
                  :max="scaleMainFile.max" />
              </div>
            </UFormField>
          </div>

          <!-- 5. Overlays & Watermarks Section -->
          <div
            class="bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-100 dark:border-neutral-800 p-4 rounded-xl space-y-4">
            <div class="flex items-center justify-between border-b border-default pb-3">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-layers" />
                {{ t('tools.labels') }}
              </p>
              <div class="flex items-center gap-1.5">
                <UDropdownMenu :items="alignOptions">
                  <UButton icon="i-lucide-align-center-horizontal" size="xs" variant="soft" color="neutral"
                    :label="t('tools.align')" />
                </UDropdownMenu>
                <UDropdownMenu :items="addOptions">
                  <UButton icon="i-lucide-plus" size="xs" variant="soft" color="primary"
                    :label="t('common.add')" />
                </UDropdownMenu>
              </div>
            </div>

            <div v-if="!form.labels.length && !form.files.length" class="text-sm text-muted py-4 text-center">
              {{ t('tools.noLabelsPreview') }}
            </div>

            <div v-else class="space-y-4 max-h-80 overflow-y-auto pr-1">
              <!-- 1. Media Overlays -->
              <div v-if="form.files.length" class="space-y-1.5">
                <div class="text-xs font-bold text-muted/80 uppercase tracking-wider flex items-center gap-1.5">
                  <UIcon name="i-lucide-layers" class="size-3.5" />
                  {{ t('tools.addMedia') }} ({{ form.files.length }})
                </div>
                <div ref="subFilesListEl" class="space-y-2">
                  <div v-for="sub in form.files" :key="sub.id" :data-id="sub.id"
                    :class="[
                      'sub-file-item flex items-center justify-between p-2.5 border border-default rounded-lg transition duration-150',
                      sub.hidden 
                        ? 'bg-neutral-100/5 dark:bg-neutral-800/5 border-dashed opacity-50' 
                        : 'bg-neutral-100/20 dark:bg-neutral-800/10 hover:bg-neutral-100/40 dark:hover:bg-neutral-800/20'
                    ]">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="drag-handle text-muted shrink-0 flex items-center justify-center p-1 cursor-grab">
                        <UIcon name="i-lucide-grip-vertical" class="size-4 pointer-events-none" />
                      </span>
                      <span class="p-1.5 bg-neutral-100 dark:bg-neutral-800 text-default rounded">
                        <UIcon :name="sub.type === 'video' ? 'i-lucide-film' : 'i-lucide-image'"
                          class="flex size-3 shrink-0" />
                      </span>
                      <span class="text-sm font-medium truncate">{{ sub.path.split(/[\\/]/).pop() }}</span>
                    </div>
                    <div class="flex gap-1 shrink-0">
                      <UButton :icon="sub.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" size="xs" variant="ghost"
                        :color="sub.hidden ? 'neutral' : 'primary'" @click="sub.hidden = !sub.hidden" />
                      <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral"
                        @click="onEditSubFile(sub)" />
                      <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error"
                        @click="openDeleteSubFile(sub.id)" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- 2. Text Overlays -->
              <div v-if="form.labels.length" class="space-y-1.5">
                <div class="text-xs font-bold text-muted/80 uppercase tracking-wider flex items-center gap-1.5">
                  <UIcon name="i-lucide-type" class="size-3.5" />
                  {{ t('tools.addText') }} ({{ form.labels.length }})
                </div>
                <div ref="labelsListEl" class="space-y-2">
                  <div v-for="label in form.labels" :key="label.id" :data-id="label.id"
                    :class="[
                      'label-item flex items-center justify-between p-2.5 border border-default rounded-lg transition duration-150',
                      label.hidden 
                        ? 'bg-neutral-100/5 dark:bg-neutral-800/5 border-dashed opacity-50' 
                        : 'bg-neutral-100/20 dark:bg-neutral-800/10 hover:bg-neutral-100/40 dark:hover:bg-neutral-800/20'
                    ]">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="drag-handle text-muted shrink-0 flex items-center justify-center p-1 cursor-grab">
                        <UIcon name="i-lucide-grip-vertical" class="size-4 pointer-events-none" />
                      </span>
                      <span class="p-1.5 bg-primary/10 dark:bg-primary/20 text-primary rounded">
                        <UIcon name="i-lucide-type" class="flex size-3 shrink-0" />
                      </span>
                      <span class="text-sm font-medium truncate">{{ label.text }}</span>
                    </div>
                    <div class="flex gap-1 shrink-0">
                      <UButton :icon="label.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" size="xs" variant="ghost"
                        :color="label.hidden ? 'neutral' : 'primary'" @click="label.hidden = !label.hidden" />
                      <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral"
                        @click="onEditLabel(label)" />
                      <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error"
                        @click="openDeleteLabel(label.id)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 6. Subtitle File Section -->
          <div
            class="bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-100 dark:border-neutral-800 p-4 rounded-xl space-y-4 pb-6">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <UIcon name="i-lucide-file-text" />
              {{ t('tools.subtitle') }}
            </p>
            <UFormField :label="t('tools.subtitleFile')">
              <div class="flex gap-2 w-full">
                <BaseFilePicker v-model="form.subtitle" mode="file" placeholder="D:/subs/subtitle.srt"
                  :filters="[{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }]" class="flex-1" />
                <UButton v-if="form.subtitle" icon="i-lucide-trash-2" color="error" variant="soft"
                  @click="openDeleteSubtitle" />
              </div>
            </UFormField>
          </div>
        </div>
      </div>

      <!-- Label editor modal -->
      <UModal v-model:open="labelEditorOpen" :title="editingLabelId ? t('common.edit') : t('tools.addText')"
        class="max-w-lg" :ui="{ footer: 'justify-end' }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('tools.labelText')" :required="true">
              <UInput v-model="labelForm.text" :placeholder="t('tools.labelText')" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
              <UFormField :label="t('tools.labelSize')">
                <UInput v-model.number="labelForm.size" type="number" :min="8" :max="500" class="w-full" />
              </UFormField>
              <UFormField :label="t('tools.labelColor')">
                <div class="flex gap-2">
                  <UInput v-model="labelForm.color" type="color" class="w-12 h-9 p-0 border-0" />
                  <UInput v-model="labelForm.color" placeholder="#ffffff" class="flex-1" />
                </div>
              </UFormField>
            </div>
            <div class="flex items-center gap-6">
              <UCheckbox v-model="labelForm.box" :true-value="1" :false-value="0" :label="t('tools.box')" />
              <UCheckbox v-model="labelForm.scaleText" :label="t('tools.scaleText')" />
            </div>
            <template v-if="labelForm.box === 1">
              <div class="grid grid-cols-2 gap-4">
                <UFormField :label="t('tools.boxColor')">
                  <div class="flex gap-2">
                    <UInput v-model="labelForm.boxColor" type="color" class="w-12 h-9 p-0 border-0" />
                    <UInput v-model="labelForm.boxColor" placeholder="#000000" class="flex-1" />
                  </div>
                </UFormField>
                <UFormField :label="t('tools.opacity')">
                  <UInput v-model.number="labelForm.boxOpacity" type="number" :min="0.1" :max="1" :step="0.1"
                    class="w-full" />
                </UFormField>
                <UFormField :label="t('tools.boxBorderW')">
                  <UInput v-model.number="labelForm.boxBorderW" type="number" :min="0" :max="200" class="w-full" />
                </UFormField>
              </div>
            </template>
          </div>
        </template>
        <template #footer>
          <UButton color="neutral" variant="ghost" :label="t('global.cancel')" @click="labelEditorOpen = false" />
          <UButton color="primary" variant="soft" :label="t('global.update')" @click="onSaveLabel" />
        </template>
      </UModal>

      <LazyBaseConfirmModal v-model:open="showDeleteSubModal" :title="t('tools.confirmDeleteMediaTitle')"
        :description="t('tools.confirmDeleteMediaDesc')" confirm-icon="i-lucide-trash-2" color="error"
        @confirm="doDeleteSubFile" />

      <LazyBaseConfirmModal v-model:open="showDeleteLabelModal" :title="t('tools.confirmDeleteLabelTitle')"
        :description="t('tools.confirmDeleteLabelDesc')" confirm-icon="i-lucide-trash-2" color="error"
        @confirm="doDeleteLabel" />

      <LazyBaseConfirmModal v-model:open="showDeleteSubtitleModal" :title="t('tools.confirmDeleteSubtitleTitle')"
        :description="t('tools.confirmDeleteSubtitleDesc')" confirm-icon="i-lucide-trash-2" color="error"
        @confirm="doDeleteSubtitle" />

      <LazyBaseConfirmModal v-model:open="showDeleteBgModal" :title="t('tools.confirmDeleteBgTitle')"
        :description="t('tools.confirmDeleteBgDesc')" confirm-icon="i-lucide-trash-2" color="error"
        @confirm="doDeleteBackground" />
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-2 w-full">
        <UButton v-if="isEditMode && props.preset" variant="ghost" color="error" icon="i-lucide-trash-2"
          :label="t('global.delete')" @click="emit('delete', props.preset)" />
        <div class="flex items-center gap-2 ml-auto">
          <UButton variant="ghost" color="neutral" :label="t('global.cancel')" @click="emit('update:open', false)" />
          <UButton variant="soft" color="primary" icon="i-lucide-save" :label="t('global.save')" :loading="loading"
            :disabled="isSaveDisabled" @click="onSave" />
        </div>
      </div>
    </template>
  </UModal>
</template>
