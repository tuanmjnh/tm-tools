<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { formatPdfBytes, openPdfPreview, pdfFileMeta, type PdfFileArea } from '~/utils/pdfStudio'

/** Shared row for every workspace list: icon, name, meta and file actions. */
const props = withDefaults(defineProps<{
  area: PdfFileArea
  name: string
  relativePath?: string
  path?: string
  size?: number
  modifiedAt?: string
  deletable?: boolean
  preview?: boolean
  /** Denser row spacing for long listings. */
  compact?: boolean
  /** This row is the active input of the current operation. */
  selected?: boolean
  /** Page-specific entries added on top of the shared file actions. */
  menu?: DropdownMenuItem[]
  onRename?: () => void
}>(), {
  deletable: true,
  preview: true,
  compact: false,
  selected: false
})

const emit = defineEmits<{ delete: [], rename: [] }>()
const { formatDateTime } = useDateTime()
const { fileItems } = usePdfMenus()
const meta = computed(() => pdfFileMeta(props.name))
const fileId = computed(() => props.relativePath || props.name)

const menuItems = computed(() => fileItems({
  area: props.area,
  name: props.name,
  relativePath: props.relativePath,
  path: props.path,
  deletable: props.deletable,
  preview: props.preview,
  extra: props.menu,
  onRename: props.onRename || (() => emit('rename')),
  onDelete: () => emit('delete')
}))
</script>

<template>
  <PdfContextMenu :items="menuItems">
    <div
      class="flex flex-col gap-3 px-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
      :class="[compact ? 'py-1.5' : 'py-3', selected ? 'bg-primary-50/40 dark:bg-primary-950/20' : '']"
    >
      <div class="min-w-0 space-y-0.5">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon :name="meta.icon" class="size-4 shrink-0" :class="meta.tone" />
          <button
            type="button"
            class="truncate text-start text-sm font-medium hover:underline"
            :title="name"
            @click="openPdfPreview(area, fileId, path)"
          >
            {{ name }}
          </button>
          <slot name="badges" />
        </div>
        <div
          v-if="!compact || size !== undefined || modifiedAt"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"
        >
          <span v-if="typeof size === 'number'" class="mono">{{ formatPdfBytes(size) }}</span>
          <span v-if="modifiedAt">{{ formatDateTime(modifiedAt) }}</span>
          <slot name="meta" />
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
        <PdfFileActions
          :area="area"
          :name="name"
          :relative-path="relativePath"
          :path="path"
          :deletable="deletable"
          :preview="preview"
          :extra="menu"
          @delete="emit('delete')"
          @rename="emit('rename')"
        />
      </div>
    </div>
  </PdfContextMenu>
</template>
