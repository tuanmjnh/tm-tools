<script setup lang="ts">
import { ModelSelect as TmModelSelect } from '@tuanmjnh/tm-ui'
import type { ModelCheckResult } from '@tuanmjnh/tm-ui'
import type { AvailableModel } from '~/types/chat'

const props = withDefaults(defineProps<{
  modelValue: string
  models: AvailableModel[]
  loading?: boolean
  disabled?: boolean
  /** Width utilities, so toolbars keep a fixed width while forms go full width. */
  widthClass?: string
  showCheck?: boolean
}>(), {
  loading: false,
  disabled: false,
  widthClass: 'w-56 sm:w-72',
  showCheck: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()
const notify = useNotify()

const labels = computed(() => ({
  placeholder: t('chat.selectModel'),
  checking: t('chat.checkingModel'),
  available: ({ ms }: { ms: number }) => t('chat.modelAvailable', { ms }),
  unavailable: ({ status }: { status: number }) => t('chat.modelUnavailable', { status }),
  tooltip: t('chat.checkModelTooltip'),
  quotaExceeded: t('chat.modelQuotaExceeded'),
  quotaExceededHint: t('chat.modelQuotaExceededHint'),
  timeout: t('chat.modelTimeout'),
  timeoutHint: t('chat.modelTimeoutHint'),
  unauthorized: ({ status }: { status: number }) => t('chat.modelUnauthorized', { status }),
  unauthorizedHint: t('chat.modelUnauthorizedHint'),
  notFound: t('chat.modelNotFound'),
  overloaded: ({ status }: { status: number }) => t('chat.modelOverloaded', { status }),
  rawError: t('chat.modelRawError'),
  genericError: t('chat.errorGeneric'),
  retry: t('document.batch.retry'),
  checkAriaLabel: t('chat.checkModelTooltip')
}))

async function checkModel(modelKey: string, { signal }: { signal: AbortSignal }): Promise<ModelCheckResult> {
  const res = await $fetch<{ data: ModelCheckResult }>('/api/v1/ai/check', {
    method: 'POST',
    body: { modelKey },
    signal
  })
  return res.data
}

function onCheckSuccess(payload: { displayName: string, latencyMs: number }) {
  notify.success(t('chat.modelAvailable', { ms: payload.latencyMs }), payload.displayName)
}

function onCheckError(payload: { title: string, description: string }) {
  notify.error(payload.title, payload.description)
}
</script>

<template>
  <TmModelSelect
    :model-value="props.modelValue"
    :models="props.models"
    :loading="props.loading"
    :disabled="props.disabled"
    :width-class="props.widthClass"
    :show-check="props.showCheck"
    :labels="labels"
    :check-model="checkModel"
    @update:model-value="emit('update:modelValue', $event)"
    @check:success="onCheckSuccess"
    @check:error="onCheckError"
  />
</template>
