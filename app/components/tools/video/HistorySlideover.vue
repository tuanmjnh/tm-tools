<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FfmpegHistory, ToolsNamespace } from '~/types'

defineOptions({ name: 'ToolsVideoHistorySlideover' })

const open = defineModel<boolean>({ default: false })

const props = defineProps<{
  api?: ToolsNamespace | null
}>()

const { t } = useI18n()
const toast = useToast()

const history = ref<FfmpegHistory[]>([])
const loading = ref(false)

const columns = computed(() => [
  { key: 'created_at', label: t('tools.date'), class: 'w-44 shrink-0' },
  { key: 'input_file', label: t('tools.input'), class: 'flex-1 min-w-32' },
  { key: 'output_file', label: t('tools.output'), class: 'flex-1 min-w-32' },
  { key: 'config_title', label: t('tools.configPreset'), class: 'w-28 shrink-0' },
  { key: 'file_size', label: t('tools.size'), class: 'w-24 shrink-0' },
  { key: 'duration', label: t('tools.duration'), class: 'w-20 shrink-0' },
  { key: 'status', label: t('tools.status'), class: 'w-24 shrink-0' }
])

async function loadHistory() {
  if (!props.api?.listFfmpegHistory) return
  loading.value = true
  try {
    const list = await props.api.listFfmpegHistory(100)
    history.value = list || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

watch(open, (newOpen) => {
  if (newOpen) {
    loadHistory()
  }
})

// Selection state
const selected = ref<FfmpegHistory[]>([])

function isSelected(item: FfmpegHistory): boolean {
  return selected.value.some(i => i.id === item.id)
}

function toggleSelect(item: FfmpegHistory, val: boolean | 'indeterminate') {
  if (val === true) {
    if (!isSelected(item)) {
      selected.value = [...selected.value, item]
    }
  } else {
    selected.value = selected.value.filter(i => i.id !== item.id)
  }
}

function toggleSelectAll() {
  if (selected.value.length === history.value.length) {
    selected.value = []
  } else {
    selected.value = [...history.value]
  }
}

// Deletion state
const showDeleteConfirm = ref(false)
const deleteTargets = ref<FfmpegHistory[]>([])
const deleting = ref(false)

const confirmTitle = computed(() => {
  return deleteTargets.value.length > 1
    ? t('tools.confirmBatchDeleteHistoryTitle')
    : t('tools.confirmDeleteHistoryTitle')
})

const confirmDesc = computed(() => {
  return deleteTargets.value.length > 1
    ? t('tools.confirmBatchDeleteHistoryDesc', { count: deleteTargets.value.length })
    : t('tools.confirmDeleteHistoryDesc')
})

function getHistoryFileName(item: FfmpegHistory): string {
  if (item.output_file) {
    return item.output_file.split('/').pop() || item.output_file
  }
  if (item.input_file) {
    return item.input_file.split('/').pop() || item.input_file
  }
  return item.config_title || item.id
}

function confirmDelete(item: FfmpegHistory) {
  deleteTargets.value = [item]
  showDeleteConfirm.value = true
}

function confirmBatchDelete() {
  if (!selected.value.length) return
  deleteTargets.value = [...selected.value]
  showDeleteConfirm.value = true
}

async function doDelete() {
  if (!deleteTargets.value.length || !props.api?.deleteFfmpegHistory) return
  deleting.value = true
  try {
    const ids = deleteTargets.value.map(i => i.id)
    const rs = await props.api.deleteFfmpegHistory(ids)
    if (rs?.status) {
      toast.add({ title: t('tools.historyDeleted'), color: 'success' })
      selected.value = selected.value.filter(s => !ids.includes(s.id))
      await loadHistory()
    } else {
      toast.add({ title: t('tools.deleteHistoryFailed'), color: 'error' })
    }
  } catch (e) {
    console.error(e)
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
    deleteTargets.value = []
  }
}

// File opening helpers
function openFile(filePath: string | null) {
  if (!filePath) return
  if (window.electronAPI?.openPath) {
    let normalizedPath = filePath
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    window.electronAPI.openPath(normalizedPath).catch((e: unknown) => console.log('openFile rejected:', e))
  }
}

function showInFolder(fullPath: string | null) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    let normalizedPath = fullPath
    if (window.electronAPI.platform === 'win32') {
      normalizedPath = normalizedPath.replace(/\//g, '\\')
    }
    window.electronAPI.showItemInFolder(normalizedPath)
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDuration(sec: number | null): string {
  if (!sec) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`
}

function statusColor(h: FfmpegHistory): 'success' | 'error' | 'warning' {
  return h.status === 'completed' ? 'success' : h.status === 'failed' ? 'error' : 'warning'
}
</script>

<template>
  <BaseResponsiveSlideover v-model:open="open" :title="t('tools.history')" icon="i-lucide-history" side="right"
    :ui="{ content: 'w-screen max-w-5xl' }">
    <template #body>
      <div class="h-[75vh]">
        <LazyGridList v-model:selected="selected" :items="history" :columns="columns" item-key="id" selectable
          :loading="loading" :can-load-more="false" storage-key="tools-video-history" @refresh="loadHistory">
          <template #empty>
            <UEmpty icon="i-lucide-clock" :title="t('tools.noHistoryVideo')" :description="t('tools.noHistoryDesc')" />
          </template>

          <template #mobile-content="{ item: h }">
            <div class="flex items-start justify-between gap-2 min-w-0">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <UCheckbox :model-value="isSelected(h)" @update:model-value="(val) => toggleSelect(h, val)"
                  @click.stop />
                <p class="text-sm font-semibold truncate flex-1" :title="h.input_file || ''">
                  {{ h.input_file ? h.input_file.split('/').pop() : '-' }}
                </p>
              </div>
              <UBadge :color="statusColor(h)" variant="soft" size="sm" class="shrink-0">
                {{ t('tools.' + h.status) }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-2 min-w-0 pl-6">
              <div class="flex flex-col">
                <p v-if="h.output_file" class="mt-1 text-xs text-muted truncate min-w-0 font-mono">
                  {{ h.output_file.split('/').pop() }}
                </p>
                <div class="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span>{{ h.config_title || '-' }}</span>
                  <span>{{ formatBytes(h.file_size) }}</span>
                  <span>{{ formatDuration(h.duration) }}</span>
                </div>
              </div>
              <div class="flex items-center justify-center gap-1">
                <UButton v-if="h.status === 'completed' && h.output_file" icon="i-lucide-play" size="xs" variant="ghost"
                  color="primary" :title="t('tools.openFile')" @click="openFile(h.output_file)" />
                <UButton v-if="h.output_file" icon="i-lucide-folder" size="xs" variant="ghost" color="neutral"
                  :title="t('tools.openFolder')" @click="showInFolder(h.output_file)" />
                <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error" :title="t('global.delete')"
                  @click="confirmDelete(h)" />
              </div>
            </div>
          </template>

          <template #created_at="{ item: h }">
            <span class="text-xs">{{ new Date(h.created_at).toLocaleString() }}</span>
          </template>

          <template #input_file="{ item: h }">
            <p class="truncate text-xs w-full" :title="h.input_file || ''">
              {{ h.input_file ? h.input_file.split('/').pop() : '-' }}
            </p>
          </template>

          <template #output_file="{ item: h }">
            <p class="truncate text-xs w-full" :title="h.output_file || ''">
              {{ h.output_file ? h.output_file.split('/').pop() : '-' }}
            </p>
          </template>

          <template #config_title="{ item: h }">
            <span class="text-xs">{{ h.config_title || '-' }}</span>
          </template>

          <template #file_size="{ item: h }">
            <span class="text-xs">{{ formatBytes(h.file_size) }}</span>
          </template>

          <template #duration="{ item: h }">
            <span class="text-xs">{{ formatDuration(h.duration) }}</span>
          </template>

          <template #status="{ item: h }">
            <UBadge :color="statusColor(h)" variant="soft" size="xs">
              {{ t('tools.' + h.status) }}
            </UBadge>
          </template>

          <template #actions="{ item: h }">
            <div class="flex items-center justify-end gap-1 shrink-0">
              <UButton v-if="h.status === 'completed' && h.output_file" icon="i-lucide-play" size="xs" variant="ghost"
                color="primary" :title="t('tools.openFile')" @click="openFile(h.output_file)" />
              <UButton v-if="h.output_file" icon="i-lucide-folder" size="xs" variant="ghost" color="neutral"
                :title="t('tools.openFolder')" @click="showInFolder(h.output_file)" />
              <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error" :title="t('global.delete')"
                @click="confirmDelete(h)" />
            </div>
          </template>
        </LazyGridList>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-between w-full gap-2">
        <div class="flex items-center gap-2">
          <UButton variant="ghost" color="neutral" :label="t('global.cancel')" @click="open = false" />
          <UButton v-if="selected.length" icon="i-lucide-trash" color="error" variant="subtle" :loading="deleting"
            @click="confirmBatchDelete">
            {{ t('global.delete') }}
            <template #trailing>
              <UKbd>{{ selected.length }}</UKbd>
            </template>
          </UButton>
        </div>
        <div class="flex items-center gap-2">
          <UButton v-if="history.length > 0" size="xs" variant="ghost" color="neutral" @click="toggleSelectAll">
            {{ selected.length === history.length ? t('tools.deselectAll') : t('tools.selectAll') }}
          </UButton>
          <UButton icon="i-lucide-refresh-cw" :label="t('tools.refresh')" variant="soft" :loading="loading"
            @click="loadHistory" />
        </div>
      </div>
    </template>
  </BaseResponsiveSlideover>

  <BaseConfirmModal v-model:open="showDeleteConfirm" :title="confirmTitle" confirm-icon="i-lucide-trash-2" color="error"
    :loading="deleting" @confirm="doDelete">
    <template #body>
      <div class="space-y-3 py-1">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-alert-triangle" class="text-xl shrink-0 mt-0.5 text-error" />
          <p class="text-sm text-muted">
            {{ confirmDesc }}
          </p>
        </div>

        <!-- Targeted files list -->
        <div v-if="deleteTargets.length > 0"
          class="max-h-36 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-2 space-y-1 text-xs font-mono">
          <div v-for="item in deleteTargets" :key="item.id"
            class="flex items-center gap-2 truncate text-neutral-700 dark:text-neutral-300">
            <UIcon name="i-lucide-file-video" class="size-3.5 shrink-0 text-primary" />
            <span class="truncate">{{ getHistoryFileName(item) }}</span>
          </div>
        </div>
      </div>
    </template>
  </BaseConfirmModal>
</template>
