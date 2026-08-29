<script setup lang="ts">
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
}>(), {
  canStart: true
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
              <UBadge v-if="paused" color="warning" variant="subtle" size="sm" :label="t('tools.paused')" />
              <UBadge v-else-if="processing" color="info" variant="subtle" size="sm" :label="t('tools.processing')" />
              <UBadge v-else-if="allDone" color="success" variant="subtle" size="sm" :label="t('tools.done')" />
              <UBadge v-else color="neutral" variant="subtle" size="sm" :label="t('tools.idle')" />
            </p>
            <p class="text-sm text-muted">
              {{ total }} {{ t('tools.total') }} · {{ done }} {{ t('tools.done') }} · {{ running }} {{
                t('tools.running') }}
              <span v-if="retries > 0" class="ml-1">· {{ retries }} {{ t('tools.retries') }}</span>
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm"
            :aria-label="t('tools.refreshStatus')" @click="emit('refresh')" />
          <UButton v-if="!processing && !paused && canStart && total > 0" icon="i-lucide-play" :label="t('tools.start')"
            size="sm" variant="soft" @click="emit('start')" />
          <UButton v-if="processing && !paused" icon="i-lucide-pause" :label="t('tools.pause')" color="warning"
            variant="soft" size="sm" @click="emit('pause')" />
          <UButton v-if="paused" icon="i-lucide-play" :label="t('tools.resume')" color="success" size="sm"
            variant="soft" @click="emit('resume')" />
          <UButton v-if="processing || paused" icon="i-lucide-square" :label="t('tools.stopAll')" color="error"
            variant="soft" size="sm" @click="emit('stopAll')" />
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
            <UBadge :color="statusColor(item.status)" variant="subtle" :label="statusLabel(item.status)" size="sm" />
            <span v-if="item.retry > 0" class="text-xs text-warning">{{ item.retry }}</span>
            <UButton v-if="item.status === 'done' && itemPath(item)" icon="i-lucide-play" color="primary"
              variant="ghost" size="xs" :aria-label="t('tools.openFile')" :title="t('tools.openFile')"
              @click="emit('openFile', itemPath(item))" />
            <UButton v-if="item.status === 'done' && itemPath(item)" icon="i-lucide-folder-search" color="primary"
              variant="ghost" size="xs" :aria-label="t('tools.showInFolder')" :title="t('tools.showInFolder')"
              @click="emit('openItem', itemPath(item))" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="t('tools.stop')"
              :disabled="!processing" @click="emit('stopTask', item.key)" />
          </div>
        </div>

        <div class="mt-2 flex items-center gap-3">
          <div class="flex-1">
            <UProgress :model-value="item.progress" :max="100" size="sm"
              :color="item.status === 'failed' || item.status === 'timeout' ? 'error' : 'primary'" />
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
  </UCard>
</template>
