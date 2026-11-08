<script setup lang="ts">
import type { PdfOfficeFormat } from '#shared/types/pdf'
import type { AvailableModel } from '~/types/chat'

interface ExtractModel {
  connectionId: string
  connectionName: string
  provider: string
  modelId: string
  displayName: string
  isDefault: boolean
}

interface ExtractPreset {
  id: string
  name: string
  description: string
  sample: string
  updatedAt: string
}

const props = defineProps<{
  modelValue?: {
    model?: string
    connectionId?: string
    presetId?: string
    formats?: PdfOfficeFormat[]
    force?: boolean
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [val: any]
}>()

const { t } = useI18n()

const selectedModel = ref(props.modelValue?.model || '')
const selectedConnectionId = ref(props.modelValue?.connectionId || '')
const selectedPresetId = ref(props.modelValue?.presetId || '__none__')
const selectedFormats = ref<PdfOfficeFormat[]>(props.modelValue?.formats || ['csv']) // , 'xlsx', 'json', 'docx', 'xml'
const force = ref(Boolean(props.modelValue?.force))

const modelList = ref<ExtractModel[]>([])
const modelsLoading = ref(true)
const presets = ref<ExtractPreset[]>([])

const formatOptions: { format: PdfOfficeFormat, label: string, icon: string, hintKey: string }[] = [
  { format: 'csv', label: 'CSV', icon: 'i-lucide-table-2', hintKey: 'pdf.formats.csvHint' },
  { format: 'xlsx', label: 'Excel (XLSX)', icon: 'i-lucide-file-spreadsheet', hintKey: 'pdf.formats.xlsxHint' },
  { format: 'json', label: 'JSON', icon: 'i-lucide-braces', hintKey: 'pdf.formats.jsonHint' },
  { format: 'docx', label: 'Word (DOCX)', icon: 'i-lucide-file-type-2', hintKey: 'pdf.formats.docxHint' },
  { format: 'xml', label: 'XML', icon: 'i-lucide-code-xml', hintKey: 'pdf.formats.xmlHint' }
]

function emitUpdate() {
  emit('update:modelValue', {
    model: selectedModel.value,
    connectionId: selectedConnectionId.value,
    presetId: selectedPresetId.value,
    formats: selectedFormats.value,
    force: force.value
  })
}

watch([selectedModel, selectedConnectionId, selectedPresetId, selectedFormats, force], emitUpdate, { deep: true })

onMounted(async () => {
  try {
    const res = await $fetch<{ data: ExtractModel[] }>('/api/v1/pdf/extract/models')
    modelList.value = res.data || []
    if (!selectedModel.value && modelList.value.length > 0) {
      const defaultModel = modelList.value.find(m => m.isDefault) || modelList.value[0]
      if (defaultModel) {
        selectedModel.value = defaultModel.modelId
        selectedConnectionId.value = defaultModel.connectionId
      }
    }
  } catch {
    modelList.value = []
  } finally {
    modelsLoading.value = false
  }

  try {
    const res = await $fetch<{ data: ExtractPreset[] }>('/api/v1/pdf/extract/presets')
    presets.value = res.data || []
  } catch {
    presets.value = []
  }
})

function onModelSelected(modelId: string) {
  selectedModel.value = modelId
  const match = modelList.value.find(m => m.modelId === modelId)
  if (match) selectedConnectionId.value = match.connectionId
}

function toggleFormat(fmt: PdfOfficeFormat) {
  selectedFormats.value = selectedFormats.value.includes(fmt)
    ? selectedFormats.value.filter(f => f !== fmt)
    : [...selectedFormats.value, fmt]
}
</script>

<template>
  <div class="space-y-4">
    <!-- Model selection -->
    <UFormField :label="t('pdf.extract.model')">
      <div v-if="modelsLoading" class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </div>
      <USelect v-else :model-value="selectedModel"
        :items="modelList.map(m => ({ label: `${m.displayName} (${m.connectionName})`, value: m.modelId }))"
        class="w-full" @update:model-value="onModelSelected" />
    </UFormField>

    <!-- Preset selection -->
    <UFormField :label="t('pdf.extract.presets')">
      <USelect v-model="selectedPresetId" :items="[
        { label: t('pdf.extract.presetDefault'), value: '__none__' },
        ...presets.map(p => ({ label: p.name, value: p.id }))
      ]" class="w-full" />
    </UFormField>

    <!-- Export formats -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold uppercase tracking-wide text-muted">
          {{ t('pdf.extract.outputFormats') }}
        </label>
        <span class="text-[11px] font-medium text-muted">
          {{ selectedFormats.length }} / {{ formatOptions.length }}
        </span>
      </div>
      <div class="flex flex-col gap-2">
        <button v-for="item in formatOptions" :key="item.format" type="button"
          class="panel-flat flex items-start gap-3 rounded-lg p-3 text-start transition-all cursor-pointer" :class="[
            selectedFormats.includes(item.format)
              ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
              : 'hover:border-primary/50 hover:bg-muted/10'
          ]" :aria-pressed="selectedFormats.includes(item.format)" @click="toggleFormat(item.format)">
          <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors"
            :class="[
              selectedFormats.includes(item.format)
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-default/60 bg-muted/15 text-muted'
            ]">
            <UIcon :name="selectedFormats.includes(item.format) ? 'i-lucide-check-circle-2' : item.icon"
              class="size-4" />
          </div>
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-highlighted"
                :class="{ 'text-primary': selectedFormats.includes(item.format) }">
                {{ item.label }}
              </span>
              <span v-if="selectedFormats.includes(item.format)"
                class="text-[10px] font-medium uppercase tracking-wider text-primary">
                {{ t('pdf.browser.selected') }}
              </span>
            </div>
            <p class="text-[11px] leading-relaxed text-muted">
              {{ t(item.hintKey) }}
            </p>
          </div>
        </button>
      </div>
    </div>

    <!-- Force re-extract checkbox -->
    <div class="flex items-center gap-2 pt-1 pb-2">
      <input id="force-check" v-model="force" type="checkbox" class="size-3.5">
      <label for="force-check" class="text-xs text-muted cursor-pointer">
        {{ t('pdf.extract.force') }}
      </label>
    </div>
  </div>
</template>
