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
const selectedFormats = ref<PdfOfficeFormat[]>(props.modelValue?.formats || ['csv', 'xlsx', 'json', 'docx', 'xml'])
const force = ref(Boolean(props.modelValue?.force))

const modelList = ref<ExtractModel[]>([])
const modelsLoading = ref(true)
const presets = ref<ExtractPreset[]>([])

const formatOptions: { format: PdfOfficeFormat, label: string }[] = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel (XLSX)' },
  { format: 'json', label: 'JSON' },
  { format: 'docx', label: 'Word (DOCX)' },
  { format: 'xml', label: 'XML' }
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

function toggleFormat(fmt: PdfOfficeFormat, checked: boolean) {
  selectedFormats.value = checked
    ? [...new Set([...selectedFormats.value, fmt])]
    : selectedFormats.value.filter(f => f !== fmt)
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
      <USelect
        v-else
        :model-value="selectedModel"
        :items="modelList.map(m => ({ label: `${m.displayName} (${m.connectionName})`, value: m.modelId }))"
        class="w-full"
        @update:model-value="onModelSelected"
      />
    </UFormField>

    <!-- Preset selection -->
    <UFormField :label="t('pdf.extract.presets')">
      <USelect
        v-model="selectedPresetId"
        :items="[
          { label: t('pdf.extract.presetDefault'), value: '__none__' },
          ...presets.map(p => ({ label: p.name, value: p.id }))
        ]"
        class="w-full"
      />
    </UFormField>

    <!-- Export formats -->
    <div class="space-y-1.5">
      <label class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ t('pdf.extract.outputFormats') }}
      </label>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label
          v-for="item in formatOptions"
          :key="item.format"
          class="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted/10"
        >
          <input
            type="checkbox"
            class="size-3.5"
            :checked="selectedFormats.includes(item.format)"
            @change="toggleFormat(item.format, ($event.target as HTMLInputElement).checked)"
          >
          <span class="text-sm font-medium">{{ item.label }}</span>
        </label>
      </div>
    </div>

    <!-- Force re-extract checkbox -->
    <div class="flex items-center gap-2 pt-1">
      <input id="force-check" v-model="force" type="checkbox" class="size-3.5">
      <label for="force-check" class="text-xs text-muted cursor-pointer">
        {{ t('pdf.extract.force') }}
      </label>
    </div>
  </div>
</template>
