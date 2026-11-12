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

type CheckStatus = 'idle' | 'checking' | 'success' | 'error'
const checkStatus = ref<CheckStatus>('idle')
const lastLatency = ref<number | null>(null)
const lastError = ref<string>('')
const lastErrorTitle = ref<string>('')
const lastErrorDesc = ref<string>('')
const lastRawError = ref<string>('')

const CHECK_TIMEOUT_MS = 10_000
let abortController: AbortController | null = null

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

watch(() => props.modelValue, () => {
  checkStatus.value = 'idle'
  lastLatency.value = null
  lastError.value = ''
  lastErrorTitle.value = ''
  lastErrorDesc.value = ''
  lastRawError.value = ''
})

const checking = computed(() => checkStatus.value === 'checking')

const checkButtonIcon = computed(() => {
  if (checkStatus.value === 'success') return 'i-lucide-check-circle-2'
  if (checkStatus.value === 'error') return 'i-lucide-alert-circle'
  return 'i-lucide-activity'
})

const checkButtonColor = computed<'neutral' | 'success' | 'error'>(() => {
  if (checkStatus.value === 'success') return 'success'
  if (checkStatus.value === 'error') return 'error'
  return 'neutral'
})

const checkTooltipText = computed(() => {
  if (checking.value) return t('chat.checkingModel')
  if (checkStatus.value === 'success' && lastLatency.value !== null) {
    return t('chat.modelAvailable', { ms: lastLatency.value })
  }
  if (checkStatus.value === 'error') {
    return lastErrorTitle.value || t('chat.modelUnavailable', { status: 500 })
  }
  return t('chat.checkModelTooltip')
})

async function checkModel() {
  if (!props.modelValue || checking.value) return

  checkStatus.value = 'checking'
  lastError.value = ''
  lastErrorTitle.value = ''
  lastErrorDesc.value = ''
  lastRawError.value = ''

  abortController?.abort()
  abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController?.abort(new Error('TIMEOUT'))
  }, CHECK_TIMEOUT_MS)

  try {
    const res = await $fetch<{
      success: boolean
      data: {
        ok: boolean
        latencyMs: number
        status?: number
        reasonCode?: string
        error?: string
        rawError?: string
        model?: string
        provider?: string
      }
    }>('/api/v1/ai/check', {
      method: 'POST',
      body: {
        modelKey: props.modelValue
      },
      signal: abortController.signal
    })

    if (res?.data?.ok) {
      checkStatus.value = 'success'
      lastLatency.value = res.data.latencyMs
      const currentModelName = props.models.find(m => `${m.connectionId}:${m.modelId}` === props.modelValue)?.displayName || props.modelValue
      notify.success(
        t('chat.modelAvailable', { ms: res.data.latencyMs }),
        currentModelName
      )
    } else {
      checkStatus.value = 'error'
      lastLatency.value = res?.data?.latencyMs ?? null
      const code = res?.data?.reasonCode
      const status = res?.data?.status || 500
      const cleanMsg = res?.data?.error

      let title = t('chat.modelUnavailable', { status })
      let desc = cleanMsg || ''

      if (code === 'quota_exceeded' || status === 429) {
        title = t('chat.modelQuotaExceeded')
        desc = t('chat.modelQuotaExceededHint')
      } else if (code === 'timeout' || status === 408 || status === 504) {
        title = t('chat.modelTimeout')
        desc = t('chat.modelTimeoutHint')
      } else if (code === 'invalid_key' || status === 401 || status === 403) {
        title = t('chat.modelUnauthorized', { status })
        desc = t('chat.modelUnauthorizedHint')
      } else if (code === 'not_found' || status === 404) {
        title = t('chat.modelNotFound')
        desc = cleanMsg || t('chat.modelNotFound')
      } else if (code === 'server_overloaded' || status === 503 || status === 502) {
        title = t('chat.modelOverloaded', { status })
        desc = cleanMsg || t('chat.modelOverloaded', { status })
      }

      lastError.value = title
      lastErrorTitle.value = title
      lastErrorDesc.value = desc
      lastRawError.value = res?.data?.rawError || cleanMsg || ''
      notify.error(title, desc)
    }
  } catch (err: unknown) {
    checkStatus.value = 'error'
    const errObj = err as { data?: { message?: string, statusMessage?: string, data?: { detail?: string } }, message?: string, statusCode?: number, name?: string }
    const status = errObj?.statusCode || 500
    const raw = errObj?.data?.data?.detail || errObj?.data?.message || errObj?.message || ''
    const isTimeout = errObj?.name === 'AbortError' || errObj?.message === 'TIMEOUT' || status === 408 || status === 504 || /timed?[- ]?out|timeout/i.test(raw)
    const isQuota = status === 429 || /quota|rate[- ]?limit/i.test(raw)

    let title = t('chat.modelUnavailable', { status })
    let desc = raw.slice(0, 150) || t('chat.errorGeneric')

    if (isTimeout) {
      title = t('chat.modelTimeout')
      desc = t('chat.modelTimeoutHint')
    } else if (isQuota) {
      title = t('chat.modelQuotaExceeded')
      desc = t('chat.modelQuotaExceededHint')
    }

    lastError.value = title
    lastErrorTitle.value = title
    lastErrorDesc.value = desc
    lastRawError.value = raw
    notify.error(title, desc)
  } finally {
    clearTimeout(timeoutId)
  }
}

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

onBeforeUnmount(() => {
  abortController?.abort()
})
</script>

<template>
  <div :class="['flex items-center gap-1.5', widthClass]">
    <USelectMenu
      ref="modelSelectMenuRef"
      v-model:search-term="searchTerm"
      :model-value="modelValue"
      :items="modelOptions"
      :loading="loading"
      value-key="value"
      label-key="label"
      virtualize
      ignore-filter
      :search-input="{ placeholder: t('chat.selectModel') }"
      :placeholder="t('chat.selectModel')"
      size="sm"
      class="flex-1 min-w-0"
      :disabled="disabled || loading || models.length === 0"
      @update:model-value="handleUpdate"
    />

    <!-- Hover Popover when in error state -->
    <UPopover
      v-if="showCheck && checkStatus === 'error'"
      mode="hover"
      :content="{ side: 'bottom', align: 'end', sideOffset: 6 }"
    >
      <UButton
        :icon="checkButtonIcon"
        :color="checkButtonColor"
        variant="ghost"
        size="sm"
        :loading="checking"
        :disabled="disabled || loading || !modelValue"
        :aria-label="t('chat.checkModelTooltip')"
        class="shrink-0"
        @click="checkModel"
      />

      <template #content>
        <div class="p-3 w-80 max-w-sm space-y-2 text-xs">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 text-error mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-foreground text-xs leading-snug">
                {{ lastErrorTitle }}
              </p>
              <p v-if="lastErrorDesc" class="mt-1 text-muted text-xs leading-relaxed">
                {{ lastErrorDesc }}
              </p>
              <div v-if="lastRawError" class="mt-2 space-y-1">
                <span class="text-[10px] font-medium text-dimmed uppercase tracking-wider">
                  {{ t('chat.modelRawError') }}
                </span>
                <div class="rounded bg-muted/20 p-2 font-mono text-[11px] text-muted select-all break-all max-h-28 overflow-y-auto border border-default/40">
                  {{ lastRawError }}
                </div>
              </div>
            </div>
          </div>
          <div class="pt-2 flex items-center justify-between border-t border-default/50 text-[11px] text-muted">
            <span>{{ lastLatency !== null ? `${lastLatency}ms` : '' }}</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 text-primary hover:underline font-medium cursor-pointer"
              @click="checkModel"
            >
              <UIcon name="i-lucide-rotate-cw" class="size-3" />
              {{ t('document.batch.retry') }}
            </button>
          </div>
        </div>
      </template>
    </UPopover>

    <!-- Standard Tooltip when idle / checking / success -->
    <UTooltip
      v-else-if="showCheck"
      :text="checkTooltipText"
    >
      <UButton
        :icon="checkButtonIcon"
        :color="checkButtonColor"
        variant="ghost"
        size="sm"
        :loading="checking"
        :disabled="disabled || loading || !modelValue"
        :aria-label="t('chat.checkModelTooltip')"
        class="shrink-0"
        @click="checkModel"
      />
    </UTooltip>
  </div>
</template>
