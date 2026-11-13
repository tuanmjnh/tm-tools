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
  set: val => emit('update:modelValue', val)
})

const formatEntries = computed(() =>
  (Object.keys(PDF_EXPORT_FORMAT_META) as PdfSourceExportFormat[])
    .map(format => ({ format, ...PDF_EXPORT_FORMAT_META[format] }))
)

function toggle(format: PdfSourceExportFormat) {
  selected.value = selected.value.includes(format)
    ? selected.value.filter(entry => entry !== format)
    : [...selected.value, format]
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ t('document.export.formats') }}
      </p>
      <span class="text-[11px] font-medium text-muted">
        {{ selected.length }} / {{ formatEntries.length }}
      </span>
    </div>
    <div class="flex flex-col gap-2">
      <button
        v-for="entry in formatEntries"
        :key="entry.format"
        type="button"
        class="panel-flat flex items-start gap-3 rounded-lg p-3 text-start transition-all cursor-pointer"
        :class="[
          selected.includes(entry.format)
            ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
            : 'hover:border-primary/50 hover:bg-muted/10'
        ]"
        :aria-pressed="selected.includes(entry.format)"
        @click="toggle(entry.format)"
      >
        <div
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors"
          :class="[
            selected.includes(entry.format)
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-default/60 bg-muted/15 text-muted'
          ]"
        >
          <UIcon
            :name="selected.includes(entry.format) ? 'i-lucide-check-circle-2' : entry.icon"
            class="size-4"
          />
        </div>
        <div class="min-w-0 flex-1 space-y-0.5">
          <div class="flex items-center justify-between gap-2">
            <span
              class="text-xs font-semibold text-highlighted"
              :class="{ 'text-primary': selected.includes(entry.format) }"
            >
              {{ t(entry.labelKey) }}
            </span>
            <span
              v-if="selected.includes(entry.format)"
              class="text-[10px] font-medium uppercase tracking-wider text-primary"
            >
              {{ t('pdf.browser.selected') }}
            </span>
          </div>
          <p class="text-[11px] leading-relaxed text-muted">
            {{ t(entry.hintKey) }}
          </p>
        </div>
      </button>
    </div>
    <p class="text-xs text-muted">
      {{ t('document.export.rowsHint') }}
    </p>
  </div>
</template>
