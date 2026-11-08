<script setup lang="ts">
import { PDF_EXPORT_FORMAT_META } from '~/utils/pdfStudio'
import type { PdfSourceExportFormat } from '#shared/types/pdf'

const props = defineProps<{
  modelValue?: PdfSourceExportFormat[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PdfSourceExportFormat[]]
}>()

const { t } = useI18n()

const selected = computed({
  get: () => props.modelValue ?? ['png'],
  set: (val) => emit('update:modelValue', val)
})

const formatEntries = computed(() =>
  (Object.keys(PDF_EXPORT_FORMAT_META) as PdfSourceExportFormat[])
    .map(format => ({ format, ...PDF_EXPORT_FORMAT_META[format] }))
)

function toggle(format: PdfSourceExportFormat, checked: boolean) {
  selected.value = checked
    ? [...new Set([...selected.value, format])]
    : selected.value.filter(entry => entry !== format)
}
</script>

<template>
  <div class="space-y-1.5">
    <p class="text-xs font-semibold uppercase tracking-wide text-muted">
      {{ t('document.export.formats') }}
    </p>
    <label
      v-for="entry in formatEntries"
      :key="entry.format"
      class="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/10"
    >
      <input
        type="checkbox"
        class="mt-0.5 size-3.5"
        :checked="selected.includes(entry.format)"
        @change="toggle(entry.format, ($event.target as HTMLInputElement).checked)"
      >
      <span class="min-w-0">
        <span class="flex items-center gap-1.5 text-sm font-medium">
          <UIcon :name="entry.icon" class="size-4 text-dimmed" />
          {{ t(entry.labelKey) }}
        </span>
        <span class="block text-xs text-muted">{{ t(entry.hintKey) }}</span>
      </span>
    </label>
    <p class="text-xs text-muted">
      {{ t('document.export.rowsHint') }}
    </p>
  </div>
</template>
