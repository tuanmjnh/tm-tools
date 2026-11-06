<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea } from '~/utils/pdfStudio'

/**
 * One dropdown for every file in the PDF workspace: preview in its own window,
 * download, reveal on disk, copy, delete. The same list drives the right-click
 * menu of the row, so both stay identical.
 */
const props = withDefaults(defineProps<{
  area: PdfFileArea
  name: string
  relativePath?: string
  path?: string
  deletable?: boolean
  /** Hide the rename entry for rows the server cannot rename. */
  renamable?: boolean
  preview?: boolean
  download?: boolean
  extra?: DropdownMenuItem[]
  onRename?: () => void
}>(), {
  deletable: true,
  renamable: true,
  preview: true,
  download: true
})

const emit = defineEmits<{ delete: [], rename: [] }>()
const { t } = useI18n()
const { fileItems } = usePdfMenus()

const items = computed(() => fileItems({
  area: props.area,
  name: props.name,
  relativePath: props.relativePath,
  path: props.path,
  deletable: props.deletable,
  preview: props.preview,
  download: props.download,
  extra: props.extra,
  onRename: props.renamable ? (props.onRename || (() => emit('rename'))) : undefined,
  onDelete: () => emit('delete')
}))
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-ellipsis-vertical"
      color="neutral"
      variant="ghost"
      size="xs"
      square
      :aria-label="t('common.actions')"
    />
  </UDropdownMenu>
</template>
