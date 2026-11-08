<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PdfFileArea, PdfFileInfo } from '#shared/types/pdf'
import { isDesktopRuntime, openLocalPath, revealLocalPath } from '~/utils/desktop'

export interface PdfOperationResultItem {
  label: string
  ok: boolean
  detail?: string
}

/** Post-run summary: what was written, where it landed, how to open it. */
const props = withDefaults(defineProps<{
  status: 'success' | 'partial' | 'failed'
  summary: string
  items?: PdfOperationResultItem[]
  outputArea: string
  outputFolder?: string
  openable?: boolean
  /** Files the run actually wrote, so each one can be previewed or revealed. */
  files?: PdfFileInfo[]
  /** Area the files live in, needed to preview them. */
  area?: PdfFileArea
  /** Absolute folder of the output, so the desktop app can reveal it on disk. */
  folderPath?: string
}>(), {
  items: () => [],
  files: () => [],
  outputFolder: '',
  openable: false,
  area: 'output',
  folderPath: undefined
})

const emit = defineEmits<{ openOutput: [] }>()

const { t } = useI18n()
const desktop = isDesktopRuntime()

const statusIcon = computed(() => {
  switch (props.status) {
    case 'success': return 'i-lucide-circle-check'
    case 'partial': return 'i-lucide-circle-dashed'
    default: return 'i-lucide-circle-alert'
  }
})

const statusTone = computed(() => {
  switch (props.status) {
    case 'success': return 'text-(--ui-success)'
    case 'partial': return 'text-(--ui-warning)'
    default: return 'text-(--ui-error)'
  }
})

const folderMenu = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[] = []
  if (props.openable) {
    items.push({
      label: t('pdf.actions.openOutputFolder'),
      icon: 'i-lucide-folder-open',
      onSelect: () => emit('openOutput')
    })
  }
  if (desktop && props.folderPath) {
    items.push({
      label: t('pdf.actions.openFolder'),
      icon: 'i-lucide-folder',
      onSelect: () => openLocalPath(props.folderPath)
    })
    items.push({
      label: t('pdf.actions.revealFolder'),
      icon: 'i-lucide-folder-search',
      onSelect: () => revealLocalPath(props.folderPath)
    })
  }
  return items.length ? [items] : []
})

const failedItems = computed(() => props.items.filter(item => !item.ok))
</script>

<template>
  <section class="panel shrink-0 space-y-2 p-3 text-xs">
    <header class="flex items-center justify-between gap-3">
      <p class="flex min-w-0 items-center gap-2">
        <UIcon :name="statusIcon" class="size-4 shrink-0" :class="statusTone" />
        <span class="truncate font-medium">{{ summary }}</span>
      </p>
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          v-if="openable"
          icon="i-lucide-folder-open"
          :label="t('pdf.actions.openOutputFolder')"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="emit('openOutput')"
        />
        <UDropdownMenu v-if="folderMenu.length" :items="folderMenu" :content="{ align: 'end' }">
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
    </header>

    <ul v-if="failedItems.length" class="space-y-1 border-t border-default pt-2">
      <li
        v-for="item in failedItems"
        :key="item.label"
        class="flex items-center gap-2 text-(--ui-error)"
      >
        <UIcon name="i-lucide-x" class="size-3.5 shrink-0" />
        <span class="mono shrink-0 font-semibold uppercase">{{ item.label }}</span>
        <span v-if="item.detail" class="truncate">{{ item.detail }}</span>
      </li>
    </ul>

    <ul v-if="files.length" class="divide-y divide-default border-t border-default">
      <li v-for="file in files" :key="file.path">
        <PdfFileRow
          :area="area"
          :name="file.name"
          :relative-path="file.relativePath"
          :path="file.path"
          :size="file.size"
          :modified-at="file.modifiedAt"
          :deletable="false"
          :renamable="false"
          compact
        />
      </li>
    </ul>

    <p v-if="outputArea" class="mono flex items-center gap-1 border-t border-default pt-2 text-[11px] text-muted">
      <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" />
      <span class="truncate">{{ t('pdf.flow.savedTo', { area: outputArea, folder: outputFolder || '/' }) }}</span>
    </p>
  </section>
</template>
