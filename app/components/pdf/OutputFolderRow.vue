<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  icon: string
  name: string
  path?: string
  meta?: string
  modifiedAt?: string
  primaryLabel: string
  primaryIcon: string
  primaryLoading?: boolean
  removable?: boolean
}>(), {
  path: undefined,
  meta: undefined,
  modifiedAt: undefined,
  primaryLoading: false,
  removable: true
})

const emit = defineEmits<{
  primary: []
  delete: []
}>()

const { t } = useI18n()
const { formatDateTime } = useDateTime()
const { folderItems } = usePdfMenus()

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [folderItems(props.path)]
  if (props.removable) {
    groups.push([{
      label: t('pdf.actions.removeFolder'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => emit('delete')
    }])
  }
  return groups.filter(group => group.length > 0)
})
</script>

<template>
  <PdfContextMenu :items="menuItems">
    <div class="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0 space-y-0.5">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon :name="icon" class="size-4 shrink-0 text-muted" />
          <span class="truncate text-sm font-medium" :title="name">{{ name }}</span>
          <UBadge
            v-if="meta"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ meta }}
          </UBadge>
        </div>
        <p v-if="modifiedAt" class="text-xs text-muted">
          {{ formatDateTime(modifiedAt) }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <UButton
          :icon="primaryIcon"
          :label="primaryLabel"
          color="neutral"
          variant="soft"
          size="xs"
          :loading="primaryLoading"
          @click="emit('primary')"
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
