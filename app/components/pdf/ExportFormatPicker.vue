<script setup lang="ts">
import type { PdfSourceExportFormat } from '#shared/types/pdf'
import { PDF_SOURCE_EXPORT_FORMATS } from '#shared/types/pdf'
import { PDF_EXPORT_FORMAT_META } from '~/utils/pdfStudio'

/** Toggle cards for the export formats; v-model is the selected format list. */
const props = withDefaults(defineProps<{
  modelValue: PdfSourceExportFormat[]
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [PdfSourceExportFormat[]] }>()
const { t } = useI18n()

function toggle(format: PdfSourceExportFormat) {
  if (props.disabled) return
  const next = props.modelValue.includes(format)
    ? props.modelValue.filter(entry => entry !== format)
    : [...props.modelValue, format]
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
    <button
      v-for="format in PDF_SOURCE_EXPORT_FORMATS"
      :key="format"
      type="button"
      class="panel-flat flex items-start gap-2 p-2.5 text-start transition"
      :class="[
        modelValue.includes(format) ? 'border-(--ui-primary) ring-1 ring-(--ui-primary)/30' : 'hover:border-(--ui-primary)/60',
        disabled ? 'opacity-60' : ''
      ]"
      :aria-pressed="modelValue.includes(format)"
      :disabled="disabled"
      @click="toggle(format)"
    >
      <UIcon
        :name="modelValue.includes(format) ? 'i-lucide-check-circle-2' : PDF_EXPORT_FORMAT_META[format].icon"
        class="mt-0.5 size-4 shrink-0"
        :class="modelValue.includes(format) ? 'text-(--ui-primary)' : 'text-muted'"
      />
      <span class="min-w-0 space-y-0.5">
        <span class="block text-xs font-medium">{{ t(PDF_EXPORT_FORMAT_META[format].labelKey) }}</span>
        <span class="block text-[11px] leading-snug text-muted">{{ t(PDF_EXPORT_FORMAT_META[format].hintKey) }}</span>
      </span>
    </button>
  </div>
</template>
