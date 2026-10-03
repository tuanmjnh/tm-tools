<script setup lang="ts">
import type { HubAuditLog } from 'tm-hub-client'
import { formatTimeAgo } from '@vueuse/core'
import { getErrorMessage } from '~/shared/utils/errors'

definePageMeta({
  middleware: () => {
    if (import.meta.client) {
      const a = useAuth()
      if (!a.isAuthenticated.value) return navigateTo('/login')
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const { logs: logsApi } = useHub()

const ALL = 'all'
const actionFilter = ref(ALL)
const selectedLog = ref<HubAuditLog | null>(null)
const isDetailOpen = ref(false)

const logsList = useCursorPagination<HubAuditLog>({
  limit: 50,
  fetch: async (cursor, limit) => {
    const res = await logsApi.list({ limit, cursor: cursor ? cursor.rowid : undefined })
    const items = res.data ?? []
    const next = res.nextCursor
    const hasMore = next != null && items.length > 0
    return { items, nextCursor: hasMore ? { ts: String(next), rowid: Number(next) } : null, hasMore }
  }
})
const { items: logs, loading, hasMore, refresh, loadMore } = logsList

const actionOptions = computed(() => {
  const actions = [...new Set(logs.value.map(l => l.action))].sort()
  return [
    { label: t('logs.allActions'), value: ALL },
    ...actions.map(a => ({ label: a, value: a }))
  ]
})

const filteredLogs = computed(() => {
  if (actionFilter.value === ALL) return logs.value
  return logs.value.filter(l => l.action === actionFilter.value)
})

const columns = computed(() => [
  { key: 'action', label: t('logs.action'), class: 'w-32' },
  { key: 'modelName', label: t('logs.model'), class: 'w-36' },
  { key: 'docId', label: t('logs.docId') },
  { key: 'actor', label: t('logs.actor'), class: 'w-40' },
  { key: 'source', label: t('logs.source'), class: 'w-32' },
  { key: 'at', label: t('logs.time'), class: 'w-36' }
])

const actionColor = (action: string): 'primary' | 'success' | 'error' | 'warning' | 'neutral' => {
  if (action.includes('delete') || action.includes('failed')) return 'error'
  if (action.includes('create') || action.includes('register')) return 'success'
  if (action.includes('pin')) return 'warning'
  if (action.includes('login') || action.includes('refresh')) return 'primary'
  return 'neutral'
}

function openDetail(item: HubAuditLog) {
  selectedLog.value = item
  isDetailOpen.value = true
}

function changeEntries(item: HubAuditLog) {
  if (!item.changes) return []
  return Object.entries(item.changes)
}

async function onRefresh() {
  try {
    actionFilter.value = ALL
    await refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  }
}

async function onLoadMore() {
  try {
    await loadMore()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  }
}

onMounted(onRefresh)
</script>

<template>
  <BasePage id="admin-logs" :title="$t('logs.title')">
    <template #right>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="soft"
        color="neutral"
        size="sm"
        :loading="loading"
        @click="onRefresh"
      />
    </template>

    <template #toolbar>
      <div class="flex items-center gap-2 px-4 pb-3">
        <USelectMenu
          v-model="actionFilter"
          :items="actionOptions"
          value-key="value"
          :placeholder="t('logs.allActions')"
          size="sm"
          class="w-full sm:w-52"
        />
        <span class="text-xs text-muted whitespace-nowrap">{{ filteredLogs.length }}</span>
      </div>
    </template>

    <template #default>
      <div class="flex-1 min-h-0 relative h-full">
        <LazyGridList
          :items="filteredLogs"
          :columns="columns"
          :loading="loading"
          item-key="_id"
          :can-load-more="hasMore"
          @load-more="onLoadMore"
          @refresh="onRefresh"
          @click="openDetail"
        >
          <template #action="{ item }">
            <UBadge
              :label="item.action"
              :color="actionColor(item.action)"
              variant="subtle"
              size="sm"
              class="font-mono"
            />
          </template>

          <template #modelName="{ item }">
            <span class="font-medium text-xs text-highlighted truncate">{{ item.modelName }}</span>
          </template>

          <template #docId="{ item }">
            <code class="text-[11px] text-muted font-mono truncate">{{ item.docId }}</code>
          </template>

          <template #actor="{ item }">
            <span class="text-[11px] truncate">{{ item.by?.name || item.by?.email || 'system' }}</span>
          </template>

          <template #source="{ item }">
            <span class="text-[11px] text-muted truncate">{{ item.source || '-' }}</span>
          </template>

          <template #at="{ item }">
            <time :datetime="new Date(item.at).toISOString()" class="text-[11px] text-muted">
              {{ formatTimeAgo(new Date(item.at)) }}
            </time>
          </template>

          <template #mobile-content="{ item }">
            <div class="flex items-start gap-3">
              <UBadge
                :label="item.action"
                :color="actionColor(item.action)"
                variant="subtle"
                size="sm"
                class="font-mono shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-semibold text-highlighted truncate">{{ item.modelName }}</span>
                  <span class="text-muted truncate font-mono">{{ item.docId }}</span>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-dimmed mt-0.5">
                  <span>{{ item.by?.name || item.by?.email || 'system' }}</span>
                  <span v-if="item.ip">{{ item.ip }}</span>
                </div>
              </div>
              <time :datetime="new Date(item.at).toISOString()" class="text-[11px] text-muted shrink-0">
                {{ formatTimeAgo(new Date(item.at)) }}
              </time>
            </div>
          </template>

          <template #empty>
            <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <UIcon name="i-lucide-scroll-text" class="size-10 text-muted" />
              <p class="text-sm text-muted">
                {{ $t('logs.empty') }}
              </p>
            </div>
          </template>
        </LazyGridList>
      </div>

      <BaseResponsiveSlideover
        v-if="selectedLog"
        v-model:open="isDetailOpen"
        :title="$t('logs.detail')"
        :description="`${selectedLog.modelName} · ${selectedLog.docId}`"
        icon="i-lucide-scroll-text"
        :ui="{ content: 'w-screen max-w-2xl' }"
      >
        <template #body>
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <UBadge
                :label="selectedLog.action"
                :color="actionColor(selectedLog.action)"
                variant="subtle"
                size="sm"
                class="font-mono"
              />
              <UBadge
                :label="selectedLog.source || '-'"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>

            <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span class="text-muted">{{ $t('logs.model') }}</span>
              <span class="font-medium">{{ selectedLog.modelName }}</span>
              <span class="text-muted">{{ $t('logs.docId') }}</span>
              <code class="text-xs font-mono break-all">{{ selectedLog.docId }}</code>
              <span class="text-muted">{{ $t('logs.actor') }}</span>
              <span>{{ selectedLog.by?.name || selectedLog.by?.email || 'system' }}</span>
              <span class="text-muted">{{ $t('logs.source') }}</span>
              <span>{{ selectedLog.source || '-' }}</span>
              <span v-if="selectedLog.ip" class="text-muted">IP</span>
              <span v-if="selectedLog.ip" class="font-mono text-xs">{{ selectedLog.ip }}</span>
              <span class="text-muted">{{ $t('logs.time') }}</span>
              <time :datetime="new Date(selectedLog.at).toISOString()" class="text-xs">
                {{ new Date(selectedLog.at).toLocaleString() }}
              </time>
            </div>

            <USeparator />

            <div>
              <p class="text-[11px] font-semibold text-dimmed uppercase mb-1.5">
                {{ $t('logs.changes') }}
              </p>
              <p v-if="!selectedLog.changes" class="text-xs text-muted italic">
                {{ $t('logs.noChanges') }}
              </p>
              <div v-else class="space-y-1.5">
                <div
                  v-for="[field, change] in changeEntries(selectedLog)"
                  :key="field"
                  class="rounded-lg border border-default p-2 text-xs font-mono"
                >
                  <p class="font-semibold text-highlighted mb-1">
                    {{ field }}
                  </p>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="rounded bg-error/10 p-1.5 break-all">
                      <span class="text-[10px] text-error font-sans">old</span>
                      <pre class="whitespace-pre-wrap">{{ JSON.stringify(change.old, null, 1) }}</pre>
                    </div>
                    <div class="rounded bg-success/10 p-1.5 break-all">
                      <span class="text-[10px] text-success font-sans">new</span>
                      <pre class="whitespace-pre-wrap">{{ JSON.stringify(change.new, null, 1) }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </BaseResponsiveSlideover>
    </template>
  </BasePage>
</template>
