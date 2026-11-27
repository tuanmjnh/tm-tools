<script setup lang="ts">
import type { AvailableModel } from '~/types/chat'
import type { OfficeConvertConfigModel } from '~/utils/documentStudio'

const props = defineProps<{
  modelValue: OfficeConvertConfigModel
}>()

const emit = defineEmits<{
  'update:modelValue': [value: OfficeConvertConfigModel]
}>()

const { t } = useI18n()

const modelList = ref<(AvailableModel & { isDefault?: boolean })[]>([])
const modelsLoading = ref(false)

const local = computed<OfficeConvertConfigModel>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

const targetOptions = computed(() => [
  { label: t('document.officeConvert.targetAuto'), value: 'auto' },
  { label: t('document.officeConvert.targetXlsx'), value: 'xlsx' },
  { label: t('document.officeConvert.targetDocx'), value: 'docx' },
  { label: t('document.officeConvert.targetCsv'), value: 'csv' },
  { label: t('document.officeConvert.targetMd'), value: 'md' },
  { label: t('document.officeConvert.targetJson'), value: 'json' },
  { label: t('document.officeConvert.targetXml'), value: 'xml' }
])

const selectedTarget = computed({
  get: () => local.value.target || 'auto',
  set: (value: 'auto' | 'xlsx' | 'docx' | 'csv' | 'md' | 'json' | 'xml') => {
    local.value = { ...local.value, target: value }
  }
})

const useAi = computed({
  get: () => Boolean(local.value.useAi),
  set: (value: boolean) => {
    local.value = { ...local.value, useAi: value }
  }
})

const aiPrompt = computed({
  get: () => String(local.value.aiPrompt ?? ''),
  set: (value: string) => {
    local.value = { ...local.value, aiPrompt: value }
  }
})

const selectedModelKey = computed({
  get: () => {
    if (!local.value.model) return ''
    return local.value.connectionId ? `${local.value.connectionId}:${local.value.model}` : local.value.model
  },
  set: (val: string) => {
    if (!val) {
      local.value = { ...local.value, connectionId: '', model: '' }
      return
    }
    const match = modelList.value.find(m => `${m.connectionId}:${m.modelId}` === val)
    local.value = {
      ...local.value,
      connectionId: match?.connectionId ?? '',
      model: match?.modelId ?? val
    }
  }
})

async function loadModels() {
  modelsLoading.value = true
  try {
    const res = await $fetch<{ data: (AvailableModel & { isDefault?: boolean })[] }>('/api/v1/pdf/extract/models')
    modelList.value = res.data || []
    const stillListed = modelList.value.some(m =>
      m.modelId === local.value.model && (!local.value.connectionId || m.connectionId === local.value.connectionId)
    )
    if (!stillListed) {
      const fallback = modelList.value.find(m => m.isDefault || m.isPrimary) ?? modelList.value[0]
      if (fallback) {
        local.value = { ...local.value, connectionId: fallback.connectionId, model: fallback.modelId }
      }
    }
  } catch {
    modelList.value = []
  } finally {
    modelsLoading.value = false
  }
}

watch(useAi, (enabled) => {
  if (enabled && !modelList.value.length && !modelsLoading.value) {
    void loadModels()
  }
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <UFormField :label="t('document.officeConvert.target')">
      <USelect
        v-model="selectedTarget"
        :items="targetOptions"
        value-key="value"
        class="w-full"
      />
    </UFormField>

    <div class="space-y-3 rounded-md border border-default/60 bg-muted/5 p-3">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-0.5">
          <p class="text-sm font-medium">
            {{ t('document.officeConvert.useAi') }}
          </p>
          <p class="text-xs text-muted">
            {{ t('document.officeConvert.useAiHint') }}
          </p>
        </div>
        <USwitch v-model="useAi" />
      </div>

      <div v-if="useAi" class="space-y-3 pt-1">
        <UFormField :label="t('document.officeConvert.model')">
          <AiProvidersModelSelect
            v-model="selectedModelKey"
            :models="modelList"
            :loading="modelsLoading"
            width-class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('document.officeConvert.aiPrompt')"
          :description="t('document.officeConvert.aiPromptHint')"
        >
          <UTextarea
            v-model="aiPrompt"
            class="w-full"
            :rows="3"
            :maxrows="6"
            autoresize
            :placeholder="t('document.officeConvert.aiPromptPlaceholder')"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>
