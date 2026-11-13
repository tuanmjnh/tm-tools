<script setup lang="ts">
import type { DocumentOperationDefinition } from '#shared/types/document'

const props = withDefaults(defineProps<{
  operation: DocumentOperationDefinition | null
  step?: 'choose' | 'process' | 'save'
  loading?: boolean
}>(), {
  step: 'choose',
  loading: false
})

const { t } = useI18n()

const steps = computed(() => [
  { key: 'choose' as const, label: t('document.shell.stepChoose'), icon: 'i-lucide-files' },
  { key: 'process' as const, label: t('document.shell.stepProcess'), icon: 'i-lucide-play' },
  { key: 'save' as const, label: t('document.shell.stepSave'), icon: 'i-lucide-download' }
])

const activeIndex = computed(() => steps.value.findIndex(entry => entry.key === props.step))
</script>

<template>
  <div class="flex flex-col gap-1 border-b border-default/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-2 text-xs">
      <template v-for="(entry, index) in steps" :key="entry.key">
        <div
          class="flex items-center gap-1.5"
          :class="index <= activeIndex ? 'text-primary-600 dark:text-primary-400' : 'text-muted'"
        >
          <UIcon :name="entry.icon" class="size-4" />
          <span class="font-medium">{{ entry.label }}</span>
        </div>
        <UIcon v-if="index < steps.length - 1" name="i-lucide-chevron-right" class="size-3.5 text-dimmed" />
      </template>
    </div>

    <div class="flex items-center gap-2 text-xs text-muted">
      <UIcon v-if="loading" name="i-lucide-loader-circle" class="size-4 animate-spin" />
      <span v-if="operation">{{ t(operation.titleKey) }}</span>
      <slot name="aside" />
    </div>
  </div>
</template>
