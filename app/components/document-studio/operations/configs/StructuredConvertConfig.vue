<script setup lang="ts">
import type { StructuredConvertConfigModel } from '~/utils/documentStudio'

const props = withDefaults(defineProps<{
  modelValue?: StructuredConvertConfigModel
}>(), {
  modelValue: () => ({ target: 'json' })
})

const emit = defineEmits<{
  'update:modelValue': [value: StructuredConvertConfigModel]
}>()

const { t } = useI18n()

/** Tabular pair and markup pair are separate families; the server enforces it too. */
const tabular = computed(() => [
  { value: 'csv' as const, label: 'CSV', hint: t('document.structuredConvert.targetCsvHint') },
  { value: 'xlsx' as const, label: 'XLSX', hint: t('document.structuredConvert.targetXlsxHint') }
])
const markup = computed(() => [
  { value: 'xml' as const, label: 'XML', hint: t('document.structuredConvert.targetXmlHint') },
  { value: 'json' as const, label: 'JSON', hint: t('document.structuredConvert.targetJsonHint') }
])

const target = computed(() => props.modelValue?.target ?? 'json')

function selectTarget(value: 'csv' | 'xlsx' | 'xml' | 'json') {
  emit('update:modelValue', { ...props.modelValue, target: value })
}
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.structuredConvert.familyTabular')" :description="t('document.structuredConvert.familyTabularHint')">
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="entry in tabular"
          :key="entry.value"
          type="button"
          class="panel-flat flex flex-col items-center gap-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer"
          :class="target === entry.value
            ? 'border-primary ring-1 ring-primary/30 bg-primary/5 text-primary'
            : 'text-muted hover:border-primary/50 hover:bg-muted/10'"
          :aria-pressed="target === entry.value"
          :title="entry.hint"
          @click="selectTarget(entry.value)"
        >
          {{ entry.label }}
        </button>
      </div>
    </UFormField>

    <UFormField :label="t('document.structuredConvert.familyMarkup')" :description="t('document.structuredConvert.familyMarkupHint')">
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="entry in markup"
          :key="entry.value"
          type="button"
          class="panel-flat flex flex-col items-center gap-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer"
          :class="target === entry.value
            ? 'border-primary ring-1 ring-primary/30 bg-primary/5 text-primary'
            : 'text-muted hover:border-primary/50 hover:bg-muted/10'"
          :aria-pressed="target === entry.value"
          :title="entry.hint"
          @click="selectTarget(entry.value)"
        >
          {{ entry.label }}
        </button>
      </div>
    </UFormField>
  </div>
</template>
