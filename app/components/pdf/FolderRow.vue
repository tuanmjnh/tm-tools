<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{
  name: string
  path: string
  relativePath: string
  fileCount: number
  modifiedAt?: string
  readonly?: boolean
  /** Denser row spacing for long listings. */
  compact?: boolean
}>()

const emit = defineEmits<{
  open: []
  rename: []
  delete: []
}>()

const { t } = useI18n()
const { formatDateTime } = useDateTime()
const { folderItems } = usePdfMenus()

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('pdf.actions.openFolder'),
      icon: 'i-lucide-folder-open',
      onSelect: () => emit('open')
    },
    ...(props.readonly
      ? []
      : [{
          label: t('pdf.actions.rename'),
          icon: 'i-lucide-pencil',
          onSelect: () => emit('rename')
        }])
  ],
  folderItems(props.path),
  ...(props.readonly
    ? []
    : [[
        {
          label: t('global.delete'),
          icon: 'i-lucide-trash-2',
          color: 'error' as const,
          onSelect: () => emit('delete')
        }
      ]])
])
</script>

<template>
  <PdfContextMenu :items="menuItems">
    <div
      class="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/10 transition-colors"
      :class="compact ? 'py-1.5' : 'py-3'"
    >
      <div class="min-w-0 space-y-0.5">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon name="i-lucide-folder" class="size-4 shrink-0 text-amber-500" />
          <button
            type="button"
            class="truncate text-start text-sm font-semibold hover:underline text-primary"
            :title="name"
            @click="emit('open')"
          >
            {{ name }}
          </button>
          <UBadge color="neutral" variant="subtle" size="xs">
            {{ t('pdf.folder.fileCount', { count: fileCount }) }}
          </UBadge>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span v-if="modifiedAt">{{ formatDateTime(modifiedAt) }}</span>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <UButton
          icon="i-lucide-folder-open"
          :label="t('common.open')"
          color="neutral"
          variant="soft"
          size="xs"
          @click="emit('open')"
        />
        <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :aria-label="t('common.actions')"
          />
        </UDropdownMenu>
      </div>
    </div>
  </PdfContextMenu>
</template>
