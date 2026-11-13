<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DocumentArtifactView } from '#shared/types/document'
import type { BatchItem, BatchStatus } from '~/composables/useDocumentBatch'
import { formatBytes } from '~/utils/formatBytes'
import {
  copyToClipboard,
  isDesktopRuntime,
  openLocalPath,
  revealLocalPath
} from '~/utils/desktop'

const props = withDefaults(defineProps<{
  items: BatchItem[]
  concurrency: number
  pauseMs: number
  maxRetry: number
  status: BatchStatus
  concurrencyCap: number
  disabled?: boolean
  outputPath?: string | null
  artifacts?: DocumentArtifactView[]
}>(), {
  disabled: false,
  outputPath: null,
  artifacts: () => []
})

const emit = defineEmits<{
  'update:concurrency': [value: number]
  'update:pauseMs': [value: number]
  'update:maxRetry': [value: number]
  'retry': [id: string]
  'retry-all': []
  'clear': []
  'preview-artifact': [artifact: DocumentArtifactView]
  'download-artifact': [artifact: DocumentArtifactView]
  'download-all': []
  'open-output-folder': []
}>()

const { t } = useI18n()

const showSettings = ref(false)
const searchQuery = ref('')
const activeFilter = ref<'all' | 'running' | 'done' | 'failed'>('all')

const concurrencyLocked = computed(() => props.concurrencyCap === 1)
const concurrencyHint = computed(() =>
  concurrencyLocked.value
    ? t('document.batch.extractLocked')
    : t('document.batch.concurrencyHint', { max: props.concurrencyCap })
)
const stopping = computed(() => props.status === 'stopping')
const canClear = computed(() =>
  !stopping.value && props.status !== 'running' && props.status !== 'paused' && props.items.length > 0
)

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

const runningCount = computed(() => props.items.filter(i => i.status === 'running').length)
const doneCount = computed(() => props.items.filter(i => i.status === 'done').length)
const failedCount = computed(() => props.items.filter(i => i.status === 'failed' || i.status === 'cancelled').length)

const filteredItems = computed(() => {
  let list = props.items
  if (activeFilter.value === 'running') {
    list = list.filter(i => i.status === 'running')
  } else if (activeFilter.value === 'done') {
    list = list.filter(i => i.status === 'done')
  } else if (activeFilter.value === 'failed') {
    list = list.filter(i => i.status === 'failed' || i.status === 'cancelled')
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter(i => i.name.toLowerCase().includes(query))
  }
  return list
})

const fileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'i-lucide-file-text'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'i-lucide-image'
  if (['xlsx', 'csv'].includes(ext)) return 'i-lucide-table-2'
  if (['docx', 'doc'].includes(ext)) return 'i-lucide-file-type-2'
  if (['json', 'yaml', 'yml'].includes(ext)) return 'i-lucide-braces'
  if (['xml', 'html'].includes(ext)) return 'i-lucide-code-xml'
  return 'i-lucide-file'
}

const INLINE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json'
])

const desktop = isDesktopRuntime()
const notify = useNotify()

const totalArtifactsCount = computed(() =>
  props.artifacts?.length || props.items.reduce((acc, i) => acc + (i.artifacts?.length || 0), 0)
)

function canOpenWithOs(artifact: DocumentArtifactView): boolean {
  return desktop && Boolean(artifact.localPath)
}

function canPreviewArtifact(artifact: DocumentArtifactView): boolean {
  if (artifact.inlineBase64) return true
  return Boolean(artifact.localPath) || INLINE_MIME.has(artifact.mimeType)
}

function artifactMenu(artifact: DocumentArtifactView): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []
  const primary: DropdownMenuItem[] = []

  if (canOpenWithOs(artifact) && artifact.localPath) {
    primary.push({
      label: t('document.result.openWithOs'),
      icon: 'i-lucide-app-window',
      onSelect: () => openLocalPath(artifact.localPath!)
    })
  }
  if (canPreviewArtifact(artifact)) {
    primary.push({
      label: t('document.result.preview'),
      icon: 'i-lucide-external-link',
      onSelect: () => emit('preview-artifact', artifact)
    })
  }
  primary.push({
    label: t('document.result.download'),
    icon: 'i-lucide-download',
    onSelect: () => emit('download-artifact', artifact)
  })
  groups.push(primary)

  if (desktop && artifact.localPath) {
    const p = artifact.localPath
    groups.push([
      {
        label: t('document.result.openFolder'),
        icon: 'i-lucide-folder-search',
        onSelect: () => revealLocalPath(p)
      },
      {
        label: t('document.result.copyPath'),
        icon: 'i-lucide-clipboard-copy',
        onSelect: async () => {
          const copied = await copyToClipboard(p)
          if (copied) notify.success(t('document.result.copyPath'), p)
          else notify.error(t('document.result.copyPath'), p)
        }
      }
    ])
  }
  return groups
}
</script>

<template>
  <div class="space-y-3">
    <!-- Collapsible Settings Header -->
    <div class="panel-flat rounded-md overflow-hidden border border-default/60">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2.5 bg-muted/5 text-start hover:bg-muted/10 transition-colors cursor-pointer"
        @click="showSettings = !showSettings"
      >
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4 shrink-0 text-primary" />
          <span class="text-xs font-semibold uppercase tracking-wide text-muted truncate">
            {{ t('document.batch.settings') }}
          </span>
          <UBadge
            v-if="concurrencyLocked"
            color="warning"
            variant="subtle"
            size="xs"
            class="shrink-0"
          >
            1x
          </UBadge>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs text-muted">
            {{ concurrency }} | {{ pauseMs }}ms
          </span>
          <UIcon
            :name="showSettings ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="size-4 text-dimmed transition-transform duration-150"
          />
        </div>
      </button>

      <div v-show="showSettings" class="p-3 border-t border-default/50 bg-background/50 space-y-3">
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

        <div class="grid grid-cols-2 gap-2.5">
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
      </div>
    </div>

    <!-- Main Queue and Results Table -->
    <div v-if="items.length > 0" class="panel-flat rounded-md overflow-hidden flex flex-col border border-default/60">
      <!-- Global Results Actions Bar (when artifacts are ready) -->
      <div
        v-if="totalArtifactsCount > 0"
        class="border-b border-default/60 px-3 py-2 bg-primary/5 flex flex-wrap items-center justify-between gap-2"
      >
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="i-lucide-folder-check" class="size-4 shrink-0 text-primary" />
          <span class="text-xs font-semibold text-foreground">
            {{ t('document.result.title', { count: totalArtifactsCount }) }}
          </span>
          <span v-if="outputPath" class="text-xs text-muted truncate max-w-xs sm:max-w-md hidden md:inline" :title="outputPath">
            · {{ outputPath }}
          </span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <UButton
            v-if="totalArtifactsCount > 1"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-folder-down"
            :label="t('document.result.downloadAll')"
            @click="emit('download-all')"
          />
          <UButton
            v-if="outputPath"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-folder-open"
            :label="t('document.activity.openOutputFolder')"
            @click="emit('open-output-folder')"
          />
        </div>
      </div>

      <!-- Toolbar: Title, Counters, Filter Tabs and Search -->
      <div class="border-b border-default/60 px-3 py-2 bg-muted/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t('document.batch.title') }}
          </p>
          <span class="text-xs font-medium text-foreground">
            {{ t('document.batch.overall', { done: doneCount, total: items.length }) }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Filter Tabs -->
          <div class="flex items-center rounded-md bg-muted/20 p-0.5 text-xs">
            <button
              type="button"
              class="rounded px-2 py-0.5 font-medium transition-colors cursor-pointer"
              :class="activeFilter === 'all' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-foreground'"
              @click="activeFilter = 'all'"
            >
              {{ t('document.batch.filterAll') }} ({{ items.length }})
            </button>
            <button
              v-if="runningCount > 0"
              type="button"
              class="rounded px-2 py-0.5 font-medium transition-colors cursor-pointer"
              :class="activeFilter === 'running' ? 'bg-primary/15 text-primary' : 'text-muted hover:text-foreground'"
              @click="activeFilter = 'running'"
            >
              {{ t('document.batch.filterRunning') }} ({{ runningCount }})
            </button>
            <button
              v-if="doneCount > 0"
              type="button"
              class="rounded px-2 py-0.5 font-medium transition-colors cursor-pointer"
              :class="activeFilter === 'done' ? 'bg-success/15 text-success' : 'text-muted hover:text-foreground'"
              @click="activeFilter = 'done'"
            >
              {{ t('document.batch.filterDone') }} ({{ doneCount }})
            </button>
            <button
              v-if="failedCount > 0"
              type="button"
              class="rounded px-2 py-0.5 font-medium transition-colors cursor-pointer"
              :class="activeFilter === 'failed' ? 'bg-error/15 text-error' : 'text-muted hover:text-foreground'"
              @click="activeFilter = 'failed'"
            >
              {{ t('document.batch.filterFailed') }} ({{ failedCount }})
            </button>
          </div>

          <!-- Retry All Button -->
          <UButton
            v-if="failedCount > 0 && !stopping"
            color="warning"
            variant="soft"
            size="xs"
            icon="i-lucide-rotate-cw"
            :label="t('document.batch.retryAll')"
            @click="emit('retry-all')"
          />

          <!-- Clear List Button -->
          <UButton
            v-if="canClear"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            :label="t('document.batch.clearList')"
            @click="emit('clear')"
          />
        </div>
      </div>

      <!-- Quick Search (when items > 5) -->
      <div v-if="items.length > 5" class="border-b border-default/40 px-3 py-1.5 bg-muted/5">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          size="xs"
          class="w-full"
          :placeholder="t('document.batch.search')"
        />
      </div>

      <!-- Queue and Results Items List -->
      <ul
        v-if="filteredItems.length"
        class="max-h-64 sm:max-h-80 md:max-h-[32rem] divide-y divide-default/50 overflow-auto scroll-thin"
      >
        <li
          v-for="item in filteredItems"
          :key="item.id"
          class="p-3 transition-colors duration-150 ease-out hover:bg-muted/10 space-y-2"
        >
          <!-- Item Master Row -->
          <div class="flex items-center gap-2">
            <UIcon
              :name="meta(item).icon"
              class="size-4 shrink-0 transition-colors duration-150 ease-out"
              :class="[meta(item).text, item.status === 'running' ? 'animate-pulse' : '']"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-medium" :title="item.name">
                  {{ item.name }}
                </p>
                <span class="shrink-0 text-xs text-muted">{{ formatBytes(item.size) }}</span>
              </div>
              <div v-if="item.status === 'running' || item.progress > 0" class="mt-1">
                <UProgress
                  :model-value="item.progress"
                  size="xs"
                  class="w-full"
                />
              </div>
              <p
                v-if="item.error"
                class="mt-1 truncate text-xs text-error font-medium"
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
          </div>

          <!-- Item Detail / Nested Artifacts Row -->
          <div
            v-if="item.artifacts && item.artifacts.length"
            class="ml-6 space-y-1.5 pt-1 border-t border-default/30"
          >
            <div class="flex items-center justify-between text-[11px] text-muted pb-0.5">
              <span>{{ t('document.result.title', { count: item.artifacts.length }) }}</span>
            </div>
            <div class="space-y-1.5 max-h-60 overflow-y-auto scroll-thin pr-0.5">
              <AppContextMenu
                v-for="artifact in item.artifacts"
                :key="artifact.id"
                :items="artifactMenu(artifact)"
              >
                <div
                  class="flex items-center justify-between rounded bg-muted/20 px-2.5 py-1.5 text-xs border border-default/40 hover:bg-muted/40 transition-colors"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <UIcon :name="fileIcon(artifact.fileName)" class="size-3.5 shrink-0 text-primary" />
                    <button
                      v-if="canPreviewArtifact(artifact)"
                      type="button"
                      class="truncate font-medium text-foreground hover:underline hover:text-primary cursor-pointer text-start block max-w-full"
                      :title="artifact.fileName"
                      @click="emit('preview-artifact', artifact)"
                    >
                      {{ artifact.fileName }}
                    </button>
                    <span v-else class="truncate font-medium text-foreground" :title="artifact.fileName">
                      {{ artifact.fileName }}
                    </span>
                    <span class="shrink-0 text-[11px] text-muted">{{ formatBytes(artifact.size) }}</span>
                  </div>
                  <div class="flex items-center gap-0.5 shrink-0 ml-2">
                    <UButton
                      v-if="canOpenWithOs(artifact) && artifact.localPath"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-app-window"
                      :aria-label="t('document.result.openWithOs')"
                      :title="t('document.result.openWithOs')"
                      @click="openLocalPath(artifact.localPath)"
                    />
                    <UButton
                      v-if="desktop && artifact.localPath"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-folder-search"
                      :aria-label="t('document.result.openFolder')"
                      :title="t('document.result.openFolder')"
                      @click="revealLocalPath(artifact.localPath)"
                    />
                    <UButton
                      v-if="canPreviewArtifact(artifact)"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-external-link"
                      :aria-label="t('document.result.preview')"
                      :title="t('document.result.preview')"
                      @click="emit('preview-artifact', artifact)"
                    />
                    <UButton
                      color="neutral"
                      variant="soft"
                      size="xs"
                      icon="i-lucide-download"
                      :label="t('document.result.download')"
                      @click="emit('download-artifact', artifact)"
                    />
                  </div>
                </div>
              </AppContextMenu>
            </div>
          </div>
        </li>
      </ul>

      <div v-else class="px-3 py-6 text-center text-sm text-muted">
        {{ t('document.batch.empty') }}
      </div>
    </div>
  </div>
</template>
