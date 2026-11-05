<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useDebounceFn } from '@vueuse/core'
import type { PdfFileArea, PdfFileInfo, PdfFolderInfo } from '#shared/types/pdf'
import { formatPdfBytes, openPdfPreview, pdfFileMeta } from '~/utils/pdfStudio'

const props = withDefaults(defineProps<{
  area: PdfFileArea
  title: string
  description?: string
  currentFolder: string
  folders: PdfFolderInfo[]
  files: PdfFileInfo[]
  breadcrumbs: Array<{ name: string, path: string }>
  parentFolder?: string | null
  loading?: boolean
  uploading?: boolean
  uploadAccept: string
  uploadLabel: string
  uploadDescription: string
  trashCount?: number
  listClass?: string
  selectedPath?: string
  selectable?: boolean
  fill?: boolean
  deletable?: boolean
  /** No uploads and no trash for this area (files still open and delete). */
  readonly?: boolean
  /** Subfolders can be created, renamed and deleted; area roots never. */
  foldersWritable?: boolean
  fileMenu?: (file: PdfFileInfo) => DropdownMenuItem[]
}>(), {
  description: undefined,
  parentFolder: null,
  loading: false,
  uploading: false,
  trashCount: 0,
  listClass: 'max-h-[440px]',
  selectedPath: undefined,
  selectable: false,
  fill: false,
  deletable: true,
  readonly: false,
  foldersWritable: true,
  fileMenu: undefined
})

const emit = defineEmits<{
  pick: [file: PdfFileInfo]
  upload: [files: File[]]
  refresh: []
  createFolder: [parentFolder: string]
  openTrash: []
  selectFolder: [folderPath: string]
  openFolder: [folder: PdfFolderInfo]
  renameFolder: [folder: PdfFolderInfo]
  deleteFolder: [folder: PdfFolderInfo]
  renameFile: [file: PdfFileInfo]
  deleteFile: [file: PdfFileInfo]
}>()

const { t } = useI18n()
const { formatDateTime } = useDateTime()
const { fileItems } = usePdfMenus()

const selected = ref<File[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

const searchInput = ref('')
const query = ref('')
const sortKey = ref<'name' | 'modified' | 'size'>('name')
const compact = ref(false)

const applySearch = useDebounceFn(() => {
  query.value = searchInput.value.trim().toLowerCase()
}, 180)

watch(searchInput, applySearch)

const sortItems = computed(() => [
  { label: t('pdf.browser.sortName'), value: 'name' },
  { label: t('pdf.browser.sortModified'), value: 'modified' },
  { label: t('pdf.browser.sortSize'), value: 'size' }
])

const visibleFolders = computed(() => {
  const term = query.value
  const list = term
    ? props.folders.filter(folder => folder.name.toLowerCase().includes(term))
    : [...props.folders]
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
})

const visibleFiles = computed(() => {
  const term = query.value
  const list = term
    ? props.files.filter(file => file.name.toLowerCase().includes(term))
    : [...props.files]
  return list.sort((a, b) => {
    if (sortKey.value === 'modified') return b.modifiedAt.localeCompare(a.modifiedAt)
    if (sortKey.value === 'size') return b.size - a.size
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
})

const isFiltered = computed(() => query.value.length > 0)
const isFilterEmpty = computed(() => isFiltered.value && !visibleFolders.value.length && !visibleFiles.value.length)

const isEmpty = computed(() => !props.folders.length && !props.files.length)
const rootClass = computed(() => props.fill ? 'panel flex min-h-0 flex-col lg:flex-1' : 'panel flex shrink-0 flex-col')
const listClasses = computed(() => [
  'overflow-y-auto scroll-thin divide-y divide-default',
  props.fill ? 'flex-1 min-h-0' : props.listClass
])

function relativePath(folder: PdfFolderInfo) {
  return folder.relativePath || folder.name
}

function isSelected(file: PdfFileInfo) {
  return props.selectedPath === (file.relativePath || file.name)
}

function openFile(file: PdfFileInfo) {
  if (props.selectable) {
    emit('pick', file)
    return
  }
  openPdfPreview(props.area, file.relativePath || file.name, file.path)
}

function selectionMenu(file: PdfFileInfo): DropdownMenuItem[][] {
  return fileItems({
    area: props.area,
    name: file.name,
    relativePath: file.relativePath,
    path: file.path,
    deletable: false,
    extra: [{
      label: t('pdf.browser.useSource'),
      icon: 'i-lucide-check',
      onSelect: () => emit('pick', file)
    }]
  })
}

function triggerUpload() {
  fileInputRef.value?.click()
}

function selectParent() {
  if (typeof props.parentFolder === 'string') emit('selectFolder', props.parentFolder)
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('upload', Array.from(target.files))
  target.value = ''
}

watch(selected, (files) => {
  if (!files.length) return
  const batch = [...files]
  selected.value = []
  emit('upload', batch)
})
</script>

<template>
  <section :class="rootClass">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-2.5">
      <div class="min-w-0 space-y-0.5">
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="truncate text-sm font-semibold">
            {{ title }}
          </h2>
          <UBadge
            v-if="files.length"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ files.length }}
          </UBadge>
          <UBadge
            v-if="trashCount"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ t('pdf.trash.badge', { count: trashCount }) }}
          </UBadge>
        </div>
        <p v-if="description" class="truncate text-xs text-muted">
          {{ description }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <slot name="header-actions" />

        <input
          ref="fileInputRef"
          type="file"
          multiple
          :accept="uploadAccept"
          class="hidden"
          @change="onFileInputChange"
        >

        <UButton
          v-if="!isEmpty && !readonly"
          icon="i-lucide-upload"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.actions.upload')"
          :title="t('pdf.actions.upload')"
          :loading="uploading"
          @click="triggerUpload"
        />
        <UButton
          v-if="foldersWritable"
          icon="i-lucide-folder-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.folder.new')"
          :title="t('pdf.folder.new')"
          @click="emit('createFolder', currentFolder)"
        />
        <UButton
          v-if="trashCount && foldersWritable"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.trash.title')"
          :title="t('pdf.trash.title')"
          @click="emit('openTrash')"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.actions.refresh')"
          :title="t('pdf.actions.refresh')"
          :loading="loading"
          @click="emit('refresh')"
        />
      </div>
    </header>

    <div
      v-if="currentFolder || breadcrumbs.length || parentFolder !== null"
      class="flex items-center gap-1 overflow-x-auto border-b border-default bg-muted/5 px-3 py-1.5 text-xs scroll-thin"
    >
      <UButton
        icon="i-lucide-home"
        :label="t('pdf.folder.root')"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="!currentFolder"
        @click="emit('selectFolder', '')"
      />
      <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
        <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
        <UButton
          :label="crumb.name"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="idx === breadcrumbs.length - 1"
          @click="emit('selectFolder', crumb.path)"
        />
      </template>
    </div>

    <div
      v-if="!isEmpty || isFiltered"
      class="flex flex-wrap items-center gap-2 border-b border-default px-3 py-1.5"
    >
      <UInput
        v-model="searchInput"
        icon="i-lucide-search"
        :placeholder="t('pdf.browser.search')"
        size="xs"
        class="min-w-40 flex-1"
      >
        <template v-if="searchInput" #trailing>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="link"
            size="xs"
            :aria-label="t('pdf.browser.clearSearch')"
            @click="searchInput = ''"
          />
        </template>
      </UInput>

      <USelect
        v-model="sortKey"
        :items="sortItems"
        size="xs"
        icon="i-lucide-arrow-up-down"
        :aria-label="t('pdf.browser.sort')"
        class="w-32"
      />

      <UButton
        :icon="compact ? 'i-lucide-align-justify' : 'i-lucide-list'"
        color="neutral"
        :variant="compact ? 'soft' : 'ghost'"
        size="xs"
        square
        :aria-label="t('pdf.browser.density')"
        :title="compact ? t('pdf.browser.densityCompact') : t('pdf.browser.densityComfortable')"
        @click="compact = !compact"
      />
    </div>

    <div v-if="isEmpty" class="space-y-3 p-4">
      <div
        v-if="readonly"
        class="panel-flat flex flex-col items-center gap-1 p-6 text-center"
      >
        <UIcon name="i-lucide-folder-open" class="size-6 text-dimmed" />
        <p class="text-sm font-medium">
          {{ t('pdf.library.emptyArea') }}
        </p>
      </div>
      <UFileUpload
        v-else
        v-model="selected"
        multiple
        :accept="uploadAccept"
        icon="i-lucide-upload"
        :label="uploadLabel"
        :description="uploadDescription"
        :preview="false"
        :disabled="uploading"
        class="w-full min-h-28"
      />

      <p v-if="currentFolder" class="text-center text-xs font-medium text-primary-600 dark:text-primary-400">
        {{ t('pdf.folder.createIn', { folder: currentFolder }) }}
      </p>

      <p v-if="uploading" class="flex items-center justify-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </p>

      <slot name="empty-extra" />
    </div>

    <div v-else class="min-h-0" :class="listClasses">
      <p v-if="isFilterEmpty" class="px-4 py-6 text-center text-xs text-muted">
        {{ t('pdf.browser.noMatch') }}
      </p>

      <button
        v-if="parentFolder !== null && parentFolder !== undefined"
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2 text-start text-xs text-muted transition-colors hover:bg-muted/10"
        @click="selectParent"
      >
        <UIcon name="i-lucide-corner-left-up" class="size-4 shrink-0 text-dimmed" />
        <span class="font-medium text-foreground">{{ t('pdf.folder.back') }}</span>
      </button>

      <PdfFolderRow
        v-for="folder in visibleFolders"
        :key="folder.path"
        :name="folder.name"
        :path="folder.path"
        :relative-path="relativePath(folder)"
        :file-count="folder.fileCount"
        :modified-at="folder.modifiedAt"
        :readonly="!foldersWritable"
        :compact="compact"
        @open="emit('openFolder', folder)"
        @rename="emit('renameFolder', folder)"
        @delete="emit('deleteFolder', folder)"
      />

      <template v-for="file in visibleFiles" :key="file.path">
        <PdfFileRow
          v-if="!selectable"
          :area="area"
          :name="file.name"
          :relative-path="file.relativePath"
          :path="file.path"
          :size="file.size"
          :modified-at="file.modifiedAt"
          :deletable="deletable"
          :compact="compact"
          :menu="fileMenu?.(file)"
          @rename="emit('renameFile', file)"
          @delete="emit('deleteFile', file)"
        >
          <template #actions>
            <slot name="file-actions" :file="file" />
          </template>
        </PdfFileRow>

        <PdfContextMenu v-else :items="selectionMenu(file)">
          <div
            class="flex items-center justify-between gap-3 px-4 transition-colors hover:bg-muted/10"
            :class="[compact ? 'py-1.5' : 'py-3', isSelected(file) ? 'bg-primary-50/40 dark:bg-primary-950/20' : '']"
          >
            <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-start" @click="openFile(file)">
              <UIcon :name="pdfFileMeta(file.name).icon" class="size-4 shrink-0" :class="pdfFileMeta(file.name).tone" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium" :title="file.name">{{ file.name }}</span>
                <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span class="mono">{{ formatPdfBytes(file.size) }}</span>
                  <span>{{ formatDateTime(file.modifiedAt) }}</span>
                </span>
              </span>
            </button>

            <div class="flex shrink-0 items-center gap-1.5">
              <UBadge
                v-if="isSelected(file)"
                color="primary"
                variant="subtle"
                size="xs"
              >
                {{ t('pdf.browser.selected') }}
              </UBadge>
              <UButton
                v-else
                icon="i-lucide-check"
                color="primary"
                variant="ghost"
                size="xs"
                square
                :aria-label="t('pdf.browser.useSource')"
                :title="t('pdf.browser.useSource')"
                @click="emit('pick', file)"
              />
            </div>
          </div>
        </PdfContextMenu>
      </template>
    </div>

    <footer
      v-if="$slots.footer"
      class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-default px-4 py-2"
    >
      <slot name="footer" />
    </footer>
  </section>
</template>
