<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { PdfFileArea, PdfFolderTreeNode } from '#shared/types/pdf'

withDefaults(defineProps<{
  tree: PdfFolderTreeNode[]
  currentFolder: string
  area?: PdfFileArea
  loading?: boolean
  title?: string
  selectedKey?: string
  canCreate?: boolean
  rootLabel?: string
  lazy?: boolean
}>(), {
  area: 'input',
  loading: false,
  title: undefined,
  selectedKey: undefined,
  canCreate: true,
  rootLabel: undefined,
  lazy: false
})

const emit = defineEmits<{
  select: [folderPath: string, area?: PdfFileArea]
  create: [parentFolder: string, area?: PdfFileArea]
  rename: [folder: { path: string, name: string, area?: PdfFileArea }]
  delete: [folder: { path: string, name: string, area?: PdfFileArea }]
  expand: [folder: { path: string, area?: PdfFileArea }]
  search: [term: string]
}>()

const WIDTH_KEY = 'pdf.explorer.width'
const COLLAPSED_KEY = 'pdf.explorer.collapsed'
const MIN_WIDTH = 220
const MAX_WIDTH = 420
const RAIL_WIDTH = 36

const width = ref(300)
const collapsed = ref(false)
const resizing = ref(false)
let startX = 0
let startWidth = 300

// The collapse rail only exists on desktop; below that the tree stays visible.
const isDesktop = useMediaQuery('(min-width: 1024px)')
const isCollapsed = computed(() => collapsed.value && isDesktop.value)

onMounted(() => {
  const savedWidth = Number(localStorage.getItem(WIDTH_KEY))
  if (Number.isFinite(savedWidth) && savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) {
    width.value = savedWidth
  }
  collapsed.value = localStorage.getItem(COLLAPSED_KEY) === '1'
})

function persist() {
  localStorage.setItem(WIDTH_KEY, String(width.value))
  localStorage.setItem(COLLAPSED_KEY, collapsed.value ? '1' : '0')
}

function clamp(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value))
}

function startResize(event: PointerEvent) {
  if (isCollapsed.value) return
  resizing.value = true
  startX = event.clientX
  startWidth = width.value
  window.addEventListener('pointermove', onResize)
  window.addEventListener('pointerup', stopResize, { once: true })
}

function onResize(event: PointerEvent) {
  if (!resizing.value) return
  width.value = clamp(startWidth + event.clientX - startX)
}

function stopResize() {
  resizing.value = false
  window.removeEventListener('pointermove', onResize)
  persist()
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  persist()
}

const shellStyle = computed(() => ({
  '--pdf-aside-w': isCollapsed.value ? `${RAIL_WIDTH}px` : `${width.value}px`
}))
</script>

<template>
  <div class="pdf-workspace grid grid-cols-1 gap-4 lg:h-[calc(100vh-140px)] lg:min-h-[540px] lg:items-stretch"
    :style="shellStyle" :data-collapsed="isCollapsed ? 'true' : 'false'" :data-resizing="resizing ? 'true' : 'false'">
    <aside class="flex flex-col lg:h-full lg:min-h-0">
      <button v-if="isCollapsed" type="button"
        class="hidden h-full w-full items-center justify-center rounded-lg border border-default bg-elevated/40 text-muted transition-colors hover:text-default lg:flex"
        :title="$t('pdf.explorer.expand')" :aria-label="$t('pdf.explorer.expand')" @click="toggleCollapsed">
        <UIcon name="i-lucide-panel-left-open" class="size-4" />
      </button>
      <PdfFolderTree v-else :tree="tree" :current-folder="currentFolder" :area="area" :loading="loading" :title="title"
        :selected-key="selectedKey" :can-create="canCreate" :root-label="rootLabel" :lazy="lazy" class="h-full min-h-0"
        @select="(folder, nodeArea) => emit('select', folder, nodeArea)"
        @create="(folder, nodeArea) => emit('create', folder, nodeArea)" @rename="folder => emit('rename', folder)"
        @delete="folder => emit('delete', folder)" @expand="folder => emit('expand', folder)"
        @search="term => emit('search', term)" @collapse="toggleCollapsed" />
    </aside>

    <div v-if="!isCollapsed"
      class="pdf-splitter hidden cursor-col-resize items-center justify-center rounded-full bg-elevated/50 transition-colors hover:bg-primary/40 lg:flex"
      role="separator" aria-orientation="vertical" :aria-label="$t('pdf.explorer.resize')"
      @pointerdown.prevent="startResize">
      <span class="h-8 w-px bg-default" />
    </div>

    <main class="flex min-h-0 min-w-0 flex-col gap-4 lg:h-full lg:overflow-y-auto lg:scroll-thin">
      <slot />
    </main>
  </div>
</template>

<style scoped>
@media (min-width: 1024px) {
  .pdf-workspace {
    grid-template-columns: var(--pdf-aside-w, 300px) 8px minmax(0, 1fr);
  }

  .pdf-workspace[data-collapsed='true'] {
    grid-template-columns: var(--pdf-aside-w, 36px) 0 minmax(0, 1fr);
  }

  .pdf-workspace[data-resizing='true'] {
    cursor: col-resize;
    user-select: none;
  }
}
</style>
