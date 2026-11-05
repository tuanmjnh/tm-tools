<script setup lang="ts">
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
}>(), {
  items: () => [],
  outputFolder: '',
  openable: false
})

const emit = defineEmits<{ openOutput: [] }>()

const { t } = useI18n()

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
</script>

<template>
  <section class="panel shrink-0 space-y-2 p-3 text-xs">
    <header class="flex items-center justify-between gap-3">
      <p class="flex min-w-0 items-center gap-2">
        <UIcon :name="statusIcon" class="size-4 shrink-0" :class="statusTone" />
        <span class="truncate font-medium">{{ summary }}</span>
      </p>
      <UButton
        v-if="openable"
        icon="i-lucide-folder-open"
        :label="t('pdf.actions.openOutputFolder')"
        color="neutral"
        variant="ghost"
        size="xs"
        class="shrink-0"
        @click="emit('openOutput')"
      />
    </header>

    <ul v-if="items.length" class="space-y-1 border-t border-default pt-2">
      <li
        v-for="item in items"
        :key="item.label"
        class="flex items-center gap-2"
        :class="item.ok ? 'text-muted' : 'text-(--ui-error)'"
      >
        <UIcon
          :name="item.ok ? 'i-lucide-check' : 'i-lucide-x'"
          class="size-3.5 shrink-0"
        />
        <span class="mono shrink-0 font-semibold uppercase">{{ item.label }}</span>
        <span v-if="item.detail" class="truncate">{{ item.detail }}</span>
      </li>
    </ul>

    <p v-if="outputArea" class="mono flex items-center gap-1 border-t border-default pt-2 text-[11px] text-muted">
      <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" />
      <span class="truncate">{{ t('pdf.flow.savedTo', { area: outputArea, folder: outputFolder || '/' }) }}</span>
    </p>
  </section>
</template>
