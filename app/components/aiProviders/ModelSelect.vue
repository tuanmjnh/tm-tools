<script setup lang="ts">
import { useInfiniteScroll } from '@vueuse/core'
import type { AvailableModel } from '~/types/chat'

const props = withDefaults(defineProps<{
  modelValue: string
  models: AvailableModel[]
  loading?: boolean
  disabled?: boolean
  /** Width utilities, so toolbars keep a fixed width while forms go full width. */
  widthClass?: string
}>(), {
  loading: false,
  disabled: false,
  widthClass: 'w-56 sm:w-72'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()

const INITIAL_LIMIT = 30
const PAGE_SIZE = 20

const searchTerm = ref('')
const displayLimit = ref(INITIAL_LIMIT)
const modelSelectMenuRef = useTemplateRef<{ viewportRef?: HTMLElement | null }>('modelSelectMenuRef')

const filteredModels = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()
  if (!query) return props.models
  return props.models.filter(m =>
    m.displayName.toLowerCase().includes(query)
    || m.modelId.toLowerCase().includes(query)
    || m.provider.toLowerCase().includes(query)
  )
})

function toOption(model: AvailableModel) {
  return {
    label: model.displayName,
    value: `${model.connectionId}:${model.modelId}`,
    icon: getProviderIcon(model.provider)
  }
}

const modelOptions = computed(() => {
  const options = filteredModels.value.slice(0, displayLimit.value).map(toOption)
  if (props.modelValue && !options.some(option => option.value === props.modelValue)) {
    const selected = props.models.find(m => `${m.connectionId}:${m.modelId}` === props.modelValue)
    if (selected) options.unshift(toOption(selected))
  }
  return options
})

watch(searchTerm, () => {
  displayLimit.value = INITIAL_LIMIT
})

function handleUpdate(value: unknown) {
  if (typeof value === 'string') emit('update:modelValue', value)
}

onMounted(() => {
  useInfiniteScroll(
    () => modelSelectMenuRef.value?.viewportRef,
    () => {
      if (displayLimit.value < filteredModels.value.length) {
        displayLimit.value += PAGE_SIZE
      }
    },
    {
      distance: 30,
      canLoadMore: () => displayLimit.value < filteredModels.value.length
    }
  )
})
</script>

<template>
  <USelectMenu ref="modelSelectMenuRef" v-model:search-term="searchTerm" :model-value="modelValue" :items="modelOptions"
    :loading="loading" value-key="value" label-key="label" virtualize ignore-filter
    :search-input="{ placeholder: t('chat.selectModel') }" :placeholder="t('chat.selectModel')" size="sm"
    :class="widthClass" :disabled="disabled || loading || models.length === 0" @update:model-value="handleUpdate" />
</template>
