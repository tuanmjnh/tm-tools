<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ToolTaskItem } from '~/composables/useToolTaskManager'

const props = withDefaults(defineProps<{
  items: ToolTaskItem[]
  total: number
  done: number
  running: number
  processing: boolean
  paused: boolean
  retries: number
  canStart?: boolean
  canPause?: boolean
  canStop?: boolean
  showActions?: boolean
}>(), {
  canStart: true,
  canPause: true,
  canStop: true,
  showActions: true
})

const emit = defineEmits<{
  start: []
  pause: []
  resume: []
  stopAll: []
  stopTask: [key: number]
  refresh: []
  openItem: [path: string]
  openFile: [path: string]
}>()

const { t } = useI18n()

const allDone = computed(() => props.total > 0 && props.done >= props.total)

// Destructive per-task action goes through the shared confirm modal.
const pendingStopKey = ref<number | null>(null)
const showStopConfirm = ref(false)

function itemPath(item: ToolTaskItem): string {
  const meta = item.task.meta || {}
  if (meta.output) return meta.output
  if (meta.outPath && meta.fileName) return `${meta.outPath}/${meta.fileName}`.replace(/\/+/g, '/')
  return ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    waiting: t('tools.waiting'),
    running: t('tools.running'),
    done: t('tools.done'),
    failed: t('tools.failed'),
    stopped: t('tools.stopped'),
    cancelled: t('tools.cancelled'),
    timeout: t('tools.timeout'),
    retrying: t('tools.retrying')
  }
  return map[status] || status
}

function itemActions(item: ToolTaskItem): DropdownMenuItem[][] {
  const path = itemPath(item)
  const primary: DropdownMenuItem[] = []

  if (item.status === 'done' && path) {
    primary.push({
      label: t('tools.openFile'),
      icon: 'i-lucide-play',
      onSelect: () => emit('openFile', path)
    })
    primary.push({
      label: t('tools.showInFolder'),
      icon: 'i-lucide-folder-search',
      onSelect: () => emit('openItem', path)
    })
  }

  const danger: DropdownMenuItem[] = [{
    label: t('tools.stop'),
    icon: 'i-lucide-square',
    color: 'error',
    disabled: !props.processing,
    onSelect: () => confirmStopTask(item.key)
  }]

  return [primary, danger].filter(group => group.length > 0)
}

function confirmStopTask(key: number) {
  pendingStopKey.value = key
  showStopConfirm.value = true
}

function doStopTask() {
  const key = pendingStopKey.value
  showStopConfirm.value = false
  pendingStopKey.value = null
  if (key !== null) emit('stopTask', key)
}

function statusColor(status: string): 'success' | 'error' | 'info' | 'warning' | 'neutral' {
  switch (status) {
    case 'done': return 'success'
    case 'failed':
    case 'timeout': return 'error'
    case 'running': return 'info'
    case 'retrying': return 'warning'
    default: return 'neutral'
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-list-checks" class="text-primary text-xl" />
          <div>
            <p class="font-semibold">
              {{ t('tools.taskManager') }}
              <UBadge
                v-if="paused"
                color="warning"
                variant="subtle"
                size="sm"
                :label="t('tools.paused')"
              />
              <UBadge
                v-else-if="processing"
                color="info"
                variant="subtle"
                size="sm"
                :label="t('tools.processing')"
              />
              <UBadge
                v-else-if="allDone"
                color="success"
                variant="subtle"
                size="sm"
                :label="t('tools.done')"
              />
              <UBadge
                v-else
                color="neutral"
                variant="subtle"
                size="sm"
                :label="t('tools.idle')"
              />
            </p>
            <p class="text-sm text-muted">
              {{ total }} {{ t('tools.total') }} · {{ done }} {{ t('tools.done') }} · {{ running }} {{
                t('tools.running') }}
              <span v-if="retries > 0" class="ml-1">· {{ retries }} {{ t('tools.retries') }}</span>
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('tools.refreshStatus')"
            @click="emit('refresh')"
          />
          <template v-if="showActions">
            <UButton
              v-if="!processing && !paused && canStart && total > 0"
              icon="i-lucide-play"
              :label="t('tools.start')"
              size="sm"
              variant="soft"
              @click="emit('start')"
            />
            <UButton
              v-if="processing && !paused && canPause"
              icon="i-lucide-pause"
              :label="t('tools.pause')"
              color="warning"
              variant="soft"
              size="sm"
              @click="emit('pause')"
            />
            <UButton
              v-if="paused && canPause"
              icon="i-lucide-play"
              :label="t('tools.resume')"
              color="success"
              size="sm"
              variant="soft"
              @click="emit('resume')"
            />
            <UButton
              v-if="(processing || paused) && canStop"
              icon="i-lucide-square"
              :label="t('tools.stopAll')"
              color="error"
              variant="soft"
              size="sm"
              @click="emit('stopAll')"
            />
          </template>
        </div>
      </div>
    </template>

    <div v-if="items.length === 0" class="flex flex-col items-center justify-center gap-2 py-8 text-muted">
      <UIcon name="i-lucide-inbox" class="text-3xl" />
      <p class="text-sm">
        {{ t('tools.noTasks') }}
      </p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <div v-for="item in items" :key="item.key" class="rounded-lg border border-dashed p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <UBadge variant="subtle" :label="`#${item.key}`" size="sm" />
            <p class="text-sm font-medium truncate">
              {{ item.task.meta?.fileName || item.task.meta?.output || item.task.meta?.input || `Task ${item.key}` }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :color="statusColor(item.status)"
              variant="subtle"
              :label="statusLabel(item.status)"
              size="sm"
            />
            <span v-if="item.retry > 0" class="text-xs text-warning">{{ item.retry }}</span>
            <UDropdownMenu :items="itemActions(item)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('common.actions')"
              />
            </UDropdownMenu>
          </div>
        </div>

        <div class="mt-2 flex items-center gap-3">
          <div class="flex-1">
            <UProgress
              :model-value="item.progress"
              :max="100"
              size="sm"
              :color="item.status === 'failed' || item.status === 'timeout' ? 'error' : 'primary'"
            />
          </div>
          <span class="text-xs text-muted tabular-nums w-12 text-right">
            {{ Math.round(item.progress) }}%
          </span>
          <span v-if="item.speed && item.status === 'running'" class="text-xs text-muted tabular-nums w-24 text-right">
            {{ item.speed }}
          </span>
        </div>

        <p v-if="item.error" class="mt-1 text-xs text-error wrap-break-word line-clamp-2">
          {{ item.error }}
        </p>
      </div>
    </div>

    <LazyBaseConfirmModal
      v-model:open="showStopConfirm"
      :title="t('tools.confirmStopTaskTitle')"
      :description="t('tools.confirmStopTaskDesc')"
      icon="i-lucide-square"
      confirm-icon="i-lucide-square"
      @confirm="doStopTask"
    />
  </UCard>
</template>
