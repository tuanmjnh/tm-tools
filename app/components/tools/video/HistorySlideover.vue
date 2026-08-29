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

// Deletion state
const showDeleteConfirm = ref(false)
const deleteTarget = ref<FfmpegHistory | null>(null)
const deleting = ref(false)

function confirmDelete(item: FfmpegHistory) {
  deleteTarget.value = item
  showDeleteConfirm.value = true
}

async function doDelete() {
  if (!deleteTarget.value || !props.api?.deleteFfmpegHistory) return
  deleting.value = true
  try {
    const rs = await props.api.deleteFfmpegHistory(deleteTarget.value.id)
    if (rs?.status) {
      toast.add({ title: t('tools.historyDeleted'), color: 'success' })
      await loadHistory()
    } else {
      toast.add({ title: t('tools.deleteHistoryFailed'), color: 'error' })
    }
  } catch (e) {
    console.error(e)
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
    deleteTarget.value = null
  }
}

// File opening helpers
async function openFileLocation(filePath: string | null) {
  if (!filePath) return
  await window.electronAPI?.openPath(filePath)
}

function showInFolder(fullPath: string | null) {
  if (window.electronAPI?.showItemInFolder && fullPath) {
    window.electronAPI.showItemInFolder(fullPath)
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
        <LazyGridList :items="history" :columns="columns" item-key="id" :loading="loading" :can-load-more="false"
          storage-key="tools-video-history" @refresh="loadHistory">
          <template #empty>
            <UEmpty icon="i-lucide-clock" :title="t('tools.noHistoryVideo')" :description="t('tools.noHistoryDesc')" />
          </template>

          <template #mobile-content="{ item: h }">
            <div class="flex items-start justify-between gap-2 min-w-0">
              <p class="text-sm font-semibold truncate flex-1" :title="h.input_file || ''">
                {{ h.input_file ? h.input_file.split('/').pop() : '-' }}
              </p>
              <UBadge :color="statusColor(h)" variant="soft" size="sm" class="shrink-0">
                {{ t('tools.' + h.status) }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-2 min-w-0">
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
                  color="primary" :title="t('tools.openFile')" @click="openFileLocation(h.output_file)" />
                <UButton v-if="h.output_file" icon="i-lucide-folder" size="xs" variant="ghost" color="neutral"
                  :title="t('tools.openFolder')" @click="showInFolder(h.output_file)" />
                <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error" @click="confirmDelete(h)" />
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
            <div class="flex items-center justify-end gap-1 shrink-0 w-12">
              <UButton v-if="h.status === 'completed' && h.output_file" icon="i-lucide-play" size="xs" variant="ghost"
                color="primary" :title="t('tools.openFile')" @click="openFileLocation(h.output_file)" />
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
      <div class="flex justify-between w-full">
        <UButton variant="ghost" color="neutral" :label="t('global.cancel')" @click="open = false" />
        <UButton icon="i-lucide-refresh-cw" :label="t('tools.refresh')" variant="soft" :loading="loading"
          @click="loadHistory" />
      </div>
    </template>
  </BaseResponsiveSlideover>

  <LazyBaseConfirmModal v-model:open="showDeleteConfirm" :title="t('tools.confirmDeleteHistoryTitle')"
    :description="t('tools.confirmDeleteHistoryDesc')" confirm-icon="i-lucide-trash-2" :loading="deleting"
    @confirm="doDelete" />
</template>
