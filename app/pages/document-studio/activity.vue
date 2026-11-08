<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DocumentArtifactView, DocumentJobView } from '#shared/types/document'
import { DOCUMENT_STUDIO_OPERATIONS, formatBytes } from '~/utils/documentStudio'
import {
  copyToClipboard,
  inlinePreviewPath,
  isDesktopRuntime,
  openLocalPath,
  revealLocalPath,
  triggerDownload
} from '~/utils/desktop'

type Filter = 'all' | 'running' | 'completed' | 'problem' | 'expired'

const { t, locale } = useI18n()
const api = useDocumentApi()
const notify = useNotify()
const { outputPath, load: loadRuntime } = useDocumentRuntime()

const jobs = ref<DocumentJobView[]>([])
const loading = ref(true)
const error = ref('')
const filter = ref<Filter>('all')
const busy = ref('')

const desktop = isDesktopRuntime()

const FILTERS: Filter[] = ['all', 'running', 'completed', 'problem', 'expired']

const FILTER_STATUS: Record<Exclude<Filter, 'all'>, DocumentJobView['status'][]> = {
  running: ['created', 'uploading', 'queued', 'running', 'cancel_requested', 'publishing'],
  completed: ['completed'],
  problem: ['partial', 'failed', 'cancelled'],
  expired: ['expired']
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    jobs.value = await api.jobs({ limit: '50' })
  } catch {
    error.value = t('document.errors.generic')
    jobs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  void loadRuntime()
})

const visible = computed(() => {
  if (filter.value === 'all') return jobs.value
  const allowed = FILTER_STATUS[filter.value]
  return jobs.value.filter(job => allowed.includes(job.status))
})

const counts = computed(() => ({
  all: jobs.value.length,
  running: jobs.value.filter(job => FILTER_STATUS.running.includes(job.status)).length,
  completed: jobs.value.filter(job => FILTER_STATUS.completed.includes(job.status)).length,
  problem: jobs.value.filter(job => FILTER_STATUS.problem.includes(job.status)).length,
  expired: jobs.value.filter(job => FILTER_STATUS.expired.includes(job.status)).length
}))

function operationLabel(operationId: string): string {
  const entry = DOCUMENT_STUDIO_OPERATIONS.find(item => item.id === operationId)
  return entry ? t(entry.titleKey) : operationId
}

function statusColor(status: DocumentJobView['status']): 'neutral' | 'info' | 'success' | 'warning' | 'error' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'partial' || status === 'cancelled') return 'warning'
  if (status === 'running' || status === 'publishing' || status === 'queued' || status === 'uploading') return 'info'
  return 'neutral'
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' })
}

/** Hours left before the artifacts stop being downloadable, or 0 once past. */
function hoursLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3_600_000))
}

function canCancel(job: DocumentJobView): boolean {
  return job.status === 'created'
    || job.status === 'uploading'
    || job.status === 'queued'
    || job.status === 'running'
    || job.status === 'cancel_requested'
}

function canRetry(job: DocumentJobView): boolean {
  return job.status === 'failed' || job.status === 'partial' || job.status === 'cancelled'
}

function deletable(job: DocumentJobView): boolean {
  return job.status !== 'running' && job.status !== 'publishing'
}

function downloadable(artifact: DocumentArtifactView): boolean {
  return artifact.status !== 'expired' && artifact.status !== 'deleted' && new Date(artifact.expiresAt).getTime() > Date.now()
}

function downloadableArtifacts(job: DocumentJobView): DocumentArtifactView[] {
  return job.artifacts.filter(downloadable)
}

/** `?inline=1` only renders PDFs and images; everything else needs the OS handler. */
const INLINE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain'
])

function canPreview(artifact: DocumentArtifactView): boolean {
  return downloadable(artifact) && (desktop || INLINE_MIME.has(artifact.mimeType))
}

function archivePath(jobId: string): string {
  return `/api/v1/documents/jobs/${encodeURIComponent(jobId)}/artifacts/archive`
}

function previewArtifact(artifact: DocumentArtifactView) {
  if (!import.meta.client) return
  const width = Math.min(1400, Math.max(900, Math.round(window.innerWidth * 0.8)))
  const height = Math.min(980, Math.max(640, Math.round(window.innerHeight * 0.85)))
  window.open(inlinePreviewPath(artifact.downloadPath), '_blank', `popup=yes,width=${width},height=${height}`)
}

async function copyValue(value: string) {
  const copied = await copyToClipboard(value)
  if (copied) notify.success(t('document.result.copyPath'), value)
  else notify.error(t('document.result.copyPath'), value)
}

function openOutputFolder() {
  openLocalPath(outputPath.value)
}

function retryJob(job: DocumentJobView) {
  const route = DOCUMENT_STUDIO_OPERATIONS.find(entry => entry.id === job.operationId)?.route ?? '/document-studio'
  void navigateTo(route)
}

async function cancelJob(job: DocumentJobView) {
  busy.value = job.id
  try {
    await api.cancelJob(job.id)
    await load()
  } catch {
    error.value = t('document.errors.DOCUMENT_JOB_STATE_INVALID')
  } finally {
    busy.value = ''
  }
}

const pendingDelete = ref<{ job: DocumentJobView, artifact?: DocumentArtifactView } | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)

function askDeleteJob(job: DocumentJobView) {
  pendingDelete.value = { job }
  deleteOpen.value = true
}

function askDeleteArtifact(job: DocumentJobView, artifact: DocumentArtifactView) {
  pendingDelete.value = { job, artifact }
  deleteOpen.value = true
}

const deleteTitle = computed(() =>
  pendingDelete.value?.artifact
    ? t('document.activity.deleteArtifactTitle')
    : t('document.activity.deleteJobTitle')
)

const deleteDescription = computed(() => {
  const pending = pendingDelete.value
  if (!pending) return ''
  return pending.artifact
    ? t('document.activity.deleteArtifactConfirm', { name: pending.artifact.fileName })
    : t('document.activity.deleteJobConfirm', { operation: operationLabel(pending.job.operationId) })
})

async function confirmDelete() {
  const pending = pendingDelete.value
  if (!pending) return
  deleting.value = true
  try {
    if (pending.artifact) await api.deleteArtifact(pending.job.id, pending.artifact.id)
    else await api.deleteJob(pending.job.id)
    deleteOpen.value = false
    pendingDelete.value = null
    await load()
  } catch {
    error.value = pending.artifact
      ? t('document.errors.DOCUMENT_ARTIFACT_EXPIRED')
      : t('document.errors.DOCUMENT_CLEANUP_FAILED')
  } finally {
    deleting.value = false
  }
}

/** Same list feeds the row "…" dropdown and the right-click surface. */
function jobMenu(job: DocumentJobView): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []
  const primary: DropdownMenuItem[] = []

  if (downloadableArtifacts(job).length > 1) {
    primary.push({
      label: t('document.result.downloadAll'),
      icon: 'i-lucide-folder-down',
      onSelect: () => triggerDownload(archivePath(job.id))
    })
  }
  if (desktop && outputPath.value) {
    primary.push({
      label: t('document.activity.openOutputFolder'),
      icon: 'i-lucide-folder-open',
      onSelect: openOutputFolder
    })
  }
  if (primary.length) groups.push(primary)

  const state: DropdownMenuItem[] = []
  if (canCancel(job)) {
    state.push({
      label: t('document.activity.cancel'),
      icon: 'i-lucide-square',
      onSelect: () => void cancelJob(job)
    })
  }
  if (canRetry(job)) {
    state.push({
      label: t('document.activity.retry'),
      icon: 'i-lucide-rotate-ccw',
      onSelect: () => retryJob(job)
    })
  }
  if (state.length) groups.push(state)

  groups.push([{
    label: t('document.activity.copyJobId'),
    icon: 'i-lucide-clipboard',
    onSelect: () => void copyValue(job.id)
  }])

  if (deletable(job)) {
    groups.push([{
      label: t('document.activity.deleteJob'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => askDeleteJob(job)
    }])
  }

  return groups
}

function artifactMenu(job: DocumentJobView, artifact: DocumentArtifactView): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []

  if (downloadable(artifact)) {
    const primary: DropdownMenuItem[] = []
    if (canPreview(artifact)) {
      primary.push({
        label: t('document.result.preview'),
        icon: 'i-lucide-external-link',
        onSelect: () => previewArtifact(artifact)
      })
    }
    primary.push({
      label: t('document.result.download'),
      icon: 'i-lucide-download',
      onSelect: () => triggerDownload(artifact.downloadPath)
    })
    groups.push(primary)
  }

  if (desktop && artifact.localPath) {
    const localPath = artifact.localPath
    groups.push([
      {
        label: t('document.result.openFolder'),
        icon: 'i-lucide-folder-search',
        onSelect: () => revealLocalPath(localPath)
      },
      {
        label: t('document.result.copyPath'),
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => void copyValue(localPath)
      }
    ])
  }

  if (downloadable(artifact)) {
    groups.push([{
      label: t('document.activity.deleteArtifact'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => askDeleteArtifact(job, artifact)
    }])
  }

  return groups
}
</script>

<template>
  <BasePage id="document-studio-activity" :title="t('document.activity.title')"
    :description="t('document.activity.description')">
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-1">
          <UButton v-for="entry in FILTERS" :key="entry" size="xs" :color="filter === entry ? 'primary' : 'neutral'"
            :variant="filter === entry ? 'soft' : 'ghost'"
            :label="`${t(`document.activity.filters.${entry}`)} (${counts[entry]})`" @click="filter = entry" />
        </div>
        <div class="flex items-center gap-1">
          <UButton v-if="desktop && outputPath" icon="i-lucide-folder-open" color="neutral" variant="ghost" size="xs"
            :label="t('document.activity.openOutputFolder')" @click="openOutputFolder" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :loading="loading"
            :label="t('document.activity.refresh')" @click="load" />
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :title="error" />

      <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </div>

      <p v-else-if="!visible.length"
        class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ t('document.activity.empty') }}
      </p>

      <ul v-else
        class="panel max-h-[calc(100vh-14rem)] divide-y divide-default/50 overflow-auto rounded-lg border border-default/70">
        <li v-for="job in visible" :key="job.id" class="p-3">
          <AppContextMenu :items="jobMenu(job)">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="statusColor(job.status)" variant="soft" size="sm">
                  {{ t(`document.status.${job.status}`) }}
                </UBadge>
                <span class="min-w-0 flex-1 truncate text-sm font-medium">
                  {{ operationLabel(job.operationId) }}
                </span>
                <span class="text-xs text-muted">
                  {{ formatWhen(job.createdAt) }}
                </span>
                <span class="text-xs text-muted">
                  {{ t('document.summary.files', { count: job.inputCount }) }} · {{ formatBytes(job.totalInputBytes) }}
                </span>
                <UDropdownMenu :items="jobMenu(job)">
                  <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical"
                    :aria-label="t('document.result.more')" />
                </UDropdownMenu>
              </div>

              <div v-if="job.status === 'running' || job.status === 'publishing' || job.status === 'queued'"
                class="flex items-center gap-2">
                <UProgress :model-value="job.progress.totalUnits
                  ? Math.round((job.progress.completedUnits / job.progress.totalUnits) * 100)
                  : 0" size="xs" class="flex-1" />
                <span class="text-xs text-muted">
                  {{ job.progress.completedUnits }}/{{ job.progress.totalUnits }}
                </span>
              </div>

              <div v-if="job.errorCode" class="text-xs text-error">
                {{ t(`document.errors.${job.errorCode}`) }}
              </div>

              <ul v-if="job.artifacts.length" class="space-y-1">
                <li v-for="artifact in job.artifacts" :key="artifact.id">
                  <AppContextMenu :items="artifactMenu(job, artifact)">
                    <div class="flex flex-wrap items-center gap-2 rounded-md bg-elevated/40 px-2 py-1">
                      <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-dimmed" />
                      <button v-if="canPreview(artifact)" type="button"
                        class="min-w-0 flex-1 truncate text-start text-xs font-medium text-foreground hover:underline hover:text-primary cursor-pointer"
                        :title="artifact.fileName" @click="previewArtifact(artifact)">
                        {{ artifact.fileName }}
                      </button>
                      <span v-else class="min-w-0 flex-1 truncate text-xs" :title="artifact.fileName">
                        {{ artifact.fileName }}
                      </span>
                      <span class="text-xs text-muted">{{ formatBytes(artifact.size) }}</span>
                      <span v-if="downloadable(artifact)" class="text-xs text-muted">
                        {{ t('document.activity.expiresIn', { hours: hoursLeft(artifact.expiresAt) }) }}
                      </span>
                      <span v-else class="text-xs text-warning">
                        {{ t('document.activity.expired') }}
                      </span>
                      <UButton v-if="canPreview(artifact)" color="neutral" variant="ghost" size="xs"
                        icon="i-lucide-external-link" :aria-label="t('document.result.preview')"
                        @click="previewArtifact(artifact)" />
                      <UButton v-if="downloadable(artifact)" color="neutral" variant="ghost" size="xs"
                        icon="i-lucide-download" :label="t('document.result.download')"
                        @click="triggerDownload(artifact.downloadPath)" />
                      <UDropdownMenu :items="artifactMenu(job, artifact)">
                        <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical"
                          :aria-label="t('document.result.more')" />
                      </UDropdownMenu>
                    </div>
                  </AppContextMenu>
                </li>
              </ul>

              <div class="flex flex-wrap items-center gap-1">
                <UButton v-if="downloadableArtifacts(job).length > 1" color="neutral" variant="ghost" size="xs"
                  icon="i-lucide-folder-down" :label="t('document.result.downloadAll')"
                  @click="triggerDownload(archivePath(job.id))" />
                <UButton v-if="canCancel(job)" color="neutral" variant="ghost" size="xs" icon="i-lucide-square"
                  :label="t('document.activity.cancel')" :loading="busy === job.id" @click="cancelJob(job)" />
                <UButton v-if="canRetry(job)" color="primary" variant="ghost" size="xs" icon="i-lucide-rotate-ccw"
                  :label="t('document.activity.retry')" @click="retryJob(job)" />
                <UButton v-if="deletable(job)" color="neutral" variant="ghost" size="xs" icon="i-lucide-trash-2"
                  :label="t('document.activity.deleteJob')" @click="askDeleteJob(job)" />
              </div>
            </div>
          </AppContextMenu>
        </li>
      </ul>

      <BaseConfirmModal v-model:open="deleteOpen" :title="deleteTitle" :description="deleteDescription"
        :loading="deleting" :confirm-label="t('global.delete')" @confirm="confirmDelete"
        @cancel="pendingDelete = null" />
    </div>
  </BasePage>
</template>
