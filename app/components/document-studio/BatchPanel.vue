<script setup lang="ts">
import type { BatchItem, BatchStatus } from '~/composables/useDocumentBatch'
import { formatBytes } from '~/utils/formatBytes'

const props = withDefaults(defineProps<{
  items: BatchItem[]
  concurrency: number
  pauseMs: number
  maxRetry: number
  status: BatchStatus
  concurrencyCap: number
  disabled?: boolean
}>(), {
  disabled: false
})

const emit = defineEmits<{
  'update:concurrency': [value: number]
  'update:pauseMs': [value: number]
  'update:maxRetry': [value: number]
  'retry': [id: string]
}>()

const { t } = useI18n()

const concurrencyLocked = computed(() => props.concurrencyCap === 1)
const concurrencyHint = computed(() =>
  concurrencyLocked.value
    ? t('document.batch.extractLocked')
    : t('document.batch.concurrencyHint', { max: props.concurrencyCap })
)
const stopping = computed(() => props.status === 'stopping')

type DisplayStatus = BatchItem['status'] | 'retrying'

interface StatusMeta {
  icon: string
  color: 'neutral' | 'primary' | 'success' | 'error' | 'warning'
  text: string
}

const STATUS_META: Record<DisplayStatus, StatusMeta> = {
  waiting: { icon: 'i-lucide-clock', color: 'neutral', text: 'text-dimmed' },
  running: { icon: 'i-lucide-loader-circle', color: 'primary', text: 'text-primary' },
  retrying: { icon: 'i-lucide-rotate-cw', color: 'warning', text: 'text-warning' },
  done: { icon: 'i-lucide-check-circle-2', color: 'success', text: 'text-success' },
  failed: { icon: 'i-lucide-x-circle', color: 'error', text: 'text-error' },
  cancelled: { icon: 'i-lucide-ban', color: 'neutral', text: 'text-dimmed' }
}

function displayStatus(item: BatchItem): DisplayStatus {
  return item.status === 'running' && item.retry > 0 ? 'retrying' : item.status
}

function meta(item: BatchItem): StatusMeta {
  return STATUS_META[displayStatus(item)]
}

function canRetry(item: BatchItem): boolean {
  return (item.status === 'failed' || item.status === 'cancelled') && !stopping.value
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField
        name="batchConcurrency"
        :label="t('document.batch.concurrency')"
        :hint="concurrencyHint"
      >
        <UInput
          :model-value="concurrency"
          type="number"
          min="1"
          :max="concurrencyCap"
          class="w-full"
          :disabled="disabled || concurrencyLocked"
          @update:model-value="emit('update:concurrency', Number($event))"
        />
      </UFormField>

      <UFormField name="batchPauseMs" :label="t('document.batch.pauseBetween')">
        <UInput
          :model-value="pauseMs"
          type="number"
          min="0"
          step="50"
          class="w-full"
          :disabled="disabled"
          @update:model-value="emit('update:pauseMs', Number($event))"
        />
      </UFormField>

      <UFormField name="batchMaxRetry" :label="t('document.batch.maxRetry')">
        <UInput
          :model-value="maxRetry"
          type="number"
          min="0"
          max="5"
          class="w-full"
          :disabled="disabled"
          @update:model-value="emit('update:maxRetry', Number($event))"
        />
      </UFormField>
    </div>

    <div class="panel-flat rounded-md overflow-hidden">
      <div class="flex items-center justify-between border-b border-default/60 px-3 py-2 bg-muted/5">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          {{ t('document.batch.title') }}
        </p>
        <span class="text-xs text-muted">
          {{ t('document.batch.overall', { done: items.filter(i => i.status === 'done').length, total: items.length }) }}
        </span>
      </div>

      <ul
        v-if="items.length"
        class="max-h-64 divide-y divide-default/50 overflow-auto scroll-thin"
      >
        <li
          v-for="item in items"
          :key="item.id"
          class="flex items-center gap-2 px-3 py-2 transition-all duration-150 ease-out hover:bg-muted/10"
        >
          <UIcon
            :name="meta(item).icon"
            class="size-4 shrink-0 transition-colors duration-150 ease-out"
            :class="[meta(item).text, item.status === 'running' ? 'animate-pulse' : '']"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium" :title="item.name">
              {{ item.name }}
            </p>
            <div class="mt-1 flex items-center gap-2">
              <UProgress
                :model-value="item.progress"
                size="xs"
                class="flex-1"
              />
              <span class="shrink-0 text-[11px] text-muted">{{ formatBytes(item.size) }}</span>
            </div>
            <p
              v-if="item.error"
              class="mt-0.5 truncate text-[11px] text-error"
              :title="t(`document.errors.${item.error.code}`)"
            >
              {{ t(`document.errors.${item.error.code}`) }}
            </p>
          </div>
          <UBadge
            :color="meta(item).color"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            {{ t(`document.batch.status.${displayStatus(item)}`) }}
          </UBadge>
          <UButton
            v-if="canRetry(item)"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            icon="i-lucide-rotate-cw"
            :aria-label="t('document.batch.retry')"
            :title="t('document.batch.retry')"
            @click="emit('retry', item.id)"
          />
        </li>
      </ul>

      <div v-else class="px-3 py-6 text-center text-sm text-muted">
        {{ t('document.batch.empty') }}
      </div>
    </div>
  </div>
</template>
