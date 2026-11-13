<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DocumentArtifactView, DocumentOperationDefinition, DocumentRuntimeCapabilities } from '#shared/types/document'
import type { DocumentErrorPayload } from '~/composables/useDocumentApi'
import type { BatchViewModel } from '~/composables/useDocumentBatch'
import { formatBytes } from '~/utils/formatBytes'
import { createInlineZip } from '~/utils/zip'
import {
  copyToClipboard,
  inlinePreviewPath,
  isDesktopRuntime,
  openLocalPath,
  revealLocalPath,
  triggerDownload
} from '~/utils/desktop'

const props = withDefaults(defineProps<{
  operation: DocumentOperationDefinition | null
  capabilities: DocumentRuntimeCapabilities | null
  files: import('#shared/types/document').SelectedDocumentFile[]
  ready: boolean
  running?: boolean
  uploading?: boolean
  error?: DocumentErrorPayload | null
  outputPath?: string
  artifacts?: DocumentArtifactView[]
  /** Setup error from the runtime probe: renders the Hub-connection alert. */
  connectionCode?: string | null
  accept?: string
  multiple?: boolean
  /** Present only for per-file batch operations; switches the action bar to pool controls. */
  batch?: BatchViewModel | null
}>(), {
  running: false,
  uploading: false,
  error: null,
  outputPath: '',
  artifacts: () => [],
  connectionCode: null,
  accept: '',
  multiple: false,
  batch: null
})

const emit = defineEmits<{
  'add': [files: File[]]
  'remove': [id: string]
  'move': [from: number, to: number]
  'run': []
  'reload': []
  'reset': []
  'deleted': [artifactId: string]
  'update:outputPath': [path: string]
  'batch-start': []
  'batch-pause': []
  'batch-resume': []
  'batch-stop': []
  'batch-retry': [id: string]
  'batch-retry-all': []
  'batch-clear': []
  'update:concurrency': [value: number]
  'update:pauseMs': [value: number]
  'update:maxRetry': [value: number]
}>()

const { t } = useI18n()
const api = useDocumentApi()
const notify = useNotify()
const { pickFolder } = useFileSystem()
const inputRef = ref<HTMLInputElement | null>(null)
const folderInputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const desktop = isDesktopRuntime()

function onDrop(event: DragEvent) {
  dragging.value = false
  const dropped = Array.from(event.dataTransfer?.files ?? [])
  if (dropped.length) emit('add', dropped)
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  if (picked.length) emit('add', picked)
  input.value = ''
}

function browse() {
  inputRef.value?.click()
}

function browseFolder() {
  folderInputRef.value?.click()
}

const fileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'i-lucide-file-text'
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'i-lucide-image'
  if (['xlsx', 'csv'].includes(ext)) return 'i-lucide-table-2'
  if (ext === 'docx') return 'i-lucide-file-type-2'
  if (ext === 'json') return 'i-lucide-braces'
  if (ext === 'xml') return 'i-lucide-code-xml'
  return 'i-lucide-file'
}

const canRun = computed(() => props.ready && !props.running)

const summaryInputCount = computed(() => {
  if (props.batch && props.batch.total > 0) return props.batch.total
  return props.files.filter(file => file.status === 'selected').length
})

const archivePath = (jobId: string): string =>
  `/api/v1/documents/jobs/${encodeURIComponent(jobId)}/artifacts/archive`

/** Ephemeral runs have no readable URL, so the bytes already arrived inline. */
const hasInlineResults = computed(() => props.artifacts.some(artifact => artifact.inlineBase64))

function inlineBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function saveBytes(bytes: Uint8Array<ArrayBuffer>, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function saveInline(artifact: DocumentArtifactView) {
  if (!artifact.inlineBase64) return
  saveBytes(inlineBytes(artifact.inlineBase64), artifact.fileName, artifact.mimeType)
}

function saveInlineArchive() {
  const inline = props.artifacts.filter(artifact => artifact.inlineBase64)
  if (!inline.length) return
  const zip = createInlineZip(inline.map(artifact => ({
    name: artifact.fileName,
    data: inlineBytes(artifact.inlineBase64!)
  })))
  saveBytes(zip, 'document-results.zip', 'application/zip')
}

/** `?inline=1` renders browser-compatible formats directly; anything else falls back to OS opener or download. */
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

function canPreview(artifact: DocumentArtifactView): boolean {
  if (artifact.inlineBase64) return true
  return Boolean(artifact.localPath) || INLINE_MIME.has(artifact.mimeType)
}

function previewArtifact(artifact: DocumentArtifactView) {
  if (artifact.inlineBase64) {
    const url = URL.createObjectURL(new Blob([inlineBytes(artifact.inlineBase64)], { type: artifact.mimeType }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  // If the format is inline-renderable by the browser/app, open the preview popup window
  if (INLINE_MIME.has(artifact.mimeType)) {
    const width = Math.min(1400, Math.max(900, Math.round(window.innerWidth * 0.8)))
    const height = Math.min(980, Math.max(640, Math.round(window.innerHeight * 0.85)))
    window.open(inlinePreviewPath(artifact.downloadPath), '_blank', `popup=yes,width=${width},height=${height}`)
    return
  }
  // Otherwise open via the OS handler (Electron or Local Web)
  if (artifact.localPath) {
    openLocalPath(artifact.localPath)
    return
  }
  // Fallback to direct download
  downloadArtifact(artifact)
}

function downloadArtifact(artifact: DocumentArtifactView) {
  if (artifact.inlineBase64) {
    saveInline(artifact)
    return
  }
  triggerDownload(artifact.downloadPath)
}

async function downloadAllArtifacts() {
  if (hasInlineResults.value) {
    saveInlineArchive()
    return
  }
  if (!multiJobArtifacts.value && props.artifacts[0]) {
    triggerDownload(archivePath(props.artifacts[0].jobId))
    return
  }
  for (const artifact of props.artifacts) {
    downloadArtifact(artifact)
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

async function copyValue(value: string) {
  const copied = await copyToClipboard(value)
  if (copied) notify.success(t('document.result.copyPath'), value)
  else notify.error(t('document.result.copyPath'), value)
}

function openOutputFolder() {
  openLocalPath(props.outputPath)
}

const showChangeOutputModal = ref(false)
const customOutputPathInput = ref(props.outputPath)

watch(() => props.outputPath, (val) => {
  customOutputPathInput.value = val
})

async function onPickCustomOutput() {
  if (desktop) {
    const picked = await pickFolder({ defaultPath: props.outputPath })
    if (picked) {
      customOutputPathInput.value = picked
      emit('update:outputPath', picked)
    }
  } else {
    showChangeOutputModal.value = true
  }
}

function saveCustomOutput() {
  emit('update:outputPath', customOutputPathInput.value.trim())
  showChangeOutputModal.value = false
}

const pendingDelete = ref<DocumentArtifactView | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)

function askDelete(artifact: DocumentArtifactView) {
  pendingDelete.value = artifact
  deleteOpen.value = true
}

async function confirmDelete() {
  const artifact = pendingDelete.value
  if (!artifact) return
  deleting.value = true
  try {
    await api.deleteArtifact(artifact.jobId, artifact.id)
    emit('deleted', artifact.id)
    deleteOpen.value = false
    pendingDelete.value = null
  } catch {
    notify.error(t('document.errors.DOCUMENT_ARTIFACT_EXPIRED'), artifact.fileName)
  } finally {
    deleting.value = false
  }
}

/** One list drives the row "…" dropdown and the right-click surface. */
function artifactMenu(artifact: DocumentArtifactView): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []
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
    onSelect: () => downloadArtifact(artifact)
  })
  groups.push(primary)

  if (artifact.localPath) {
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

  if (!artifact.inlineBase64) {
    groups.push([{
      label: t('document.activity.deleteArtifact'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => askDelete(artifact)
    }])
  }

  return groups
}
const destinationText = computed(() => {
  if (!props.capabilities) return ''
  if (props.capabilities.ephemeralResults) return t('document.output.ephemeralHint')
  if (props.capabilities.requiresDownloadDelivery) return t('document.output.downloadHint')
  return props.outputPath || t('document.output.defaultFolder')
})

const batchActive = computed(() => {
  const status = props.batch?.status
  return status === 'running' || status === 'paused' || status === 'stopping'
})

/** A per-job archive only covers one job, so batch results spanning jobs download individually. */
const multiJobArtifacts = computed(() => new Set(props.artifacts.map(artifact => artifact.jobId)).size > 1)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <DocumentStudioOperationStepHeader
      :operation="operation"
      :step="(running || batchActive) ? 'process' : artifacts.length ? 'save' : 'choose'"
      :loading="running || batchActive"
    />

    <DocumentStudioConnectionAlert v-if="connectionCode" :code="connectionCode" @retry="emit('reload')" />

    <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <div class="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
        <!-- Contextual Dropzone: full when empty, compact when files/batch exist -->
        <div
          v-if="!files.length && (!batch || batch.total === 0)"
          class="panel-flat flex min-h-36 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-default/70 p-6 text-center transition-colors shrink-0"
          :class="dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/40'"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="inputRef"
            type="file"
            class="hidden"
            :accept="accept || undefined"
            :multiple="multiple"
            @change="onPick"
          >
          <input
            ref="folderInputRef"
            type="file"
            class="hidden"
            webkitdirectory
            directory
            @change="onPick"
          >
          <UIcon name="i-lucide-cloud-upload" class="size-7 text-dimmed" />
          <p class="text-sm font-medium">
            {{ t(operation?.input.mode === 'single-file' ? 'document.input.dropSingle' : 'document.input.dropMany') }}
          </p>
          <p class="text-xs text-muted">
            {{ accept ? t('document.input.accepted', { types: accept }) : t('document.input.anyFile') }}
          </p>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-file-plus"
              :label="t('document.input.browse')"
              @click="browse"
            />
            <UButton
              v-if="multiple"
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-folder-open"
              :label="t('document.input.browseFolder')"
              @click="browseFolder"
            />
          </div>
        </div>

        <div
          v-else
          class="panel-flat flex items-center justify-between rounded-md border border-dashed border-default/70 px-4 py-2.5 text-xs transition-colors shrink-0"
          :class="dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/40'"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <input
            ref="inputRef"
            type="file"
            class="hidden"
            :accept="accept || undefined"
            :multiple="multiple"
            @change="onPick"
          >
          <input
            ref="folderInputRef"
            type="file"
            class="hidden"
            webkitdirectory
            directory
            @change="onPick"
          >
          <div class="flex items-center gap-2 min-w-0">
            <UIcon name="i-lucide-cloud-upload" class="size-4 shrink-0 text-primary" />
            <span class="truncate text-muted">
              {{ t(operation?.input.mode === 'single-file' ? 'document.input.dropSingle' : 'document.input.dropMany') }}
            </span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-file-plus"
              :label="t('document.input.browse')"
              @click="browse"
            />
            <UButton
              v-if="multiple"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-folder-open"
              :label="t('document.input.browseFolder')"
              @click="browseFolder"
            />
          </div>
        </div>

        <!-- Selected files (before batch start or in non-batch mode) -->
        <div v-if="files.length && (!batch || batch.total === 0)" class="panel-flat rounded-md shrink-0 overflow-hidden">
          <div class="flex items-center justify-between border-b border-default/60 px-3 py-2 bg-muted/5">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ t('document.input.selected', { count: files.length }) }}
            </p>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              :label="t('document.input.clear')"
              @click="emit('reset')"
            />
          </div>
          <ul class="max-h-64 divide-y divide-default/50 overflow-auto">
            <li
              v-for="(file, index) in files"
              :key="file.id"
              class="flex items-center gap-2 px-3 py-2 hover:bg-muted/10 transition-colors"
            >
              <UIcon :name="fileIcon(file.name)" class="size-4 shrink-0 text-dimmed" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ file.name }}
                </p>
                <p class="text-xs" :class="file.status === 'invalid' ? 'text-error' : 'text-muted'">
                  <template v-if="file.status === 'invalid'">
                    {{ t('document.errors.DOCUMENT_INPUT_TYPE_NOT_SUPPORTED') }}
                  </template>
                  <template v-else>
                    {{ formatBytes(file.size) }}
                  </template>
                </p>
              </div>
              <div v-if="multiple" class="flex shrink-0 items-center gap-0.5">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  icon="i-lucide-arrow-up"
                  :disabled="index === 0"
                  :aria-label="t('document.input.moveUp')"
                  @click="emit('move', index, index - 1)"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  icon="i-lucide-arrow-down"
                  :disabled="index === files.length - 1"
                  :aria-label="t('document.input.moveDown')"
                  @click="emit('move', index, index + 1)"
                />
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-trash-2"
                :aria-label="t('document.input.remove')"
                @click="emit('remove', file.id)"
              />
            </li>
          </ul>
        </div>

        <!-- Unified Batch Work Area (Left Column) when batch has items -->
        <DocumentStudioBatchPanel
          v-if="batch && batch.total > 0"
          :items="batch.items"
          :concurrency="batch.concurrency"
          :pause-ms="batch.pauseMs"
          :max-retry="batch.maxRetry"
          :status="batch.status"
          :concurrency-cap="batch.concurrencyCap"
          :disabled="batch.status === 'stopping'"
          :output-path="outputPath"
          :artifacts="artifacts"
          @update:concurrency="emit('update:concurrency', $event)"
          @update:pause-ms="emit('update:pauseMs', $event)"
          @update:max-retry="emit('update:maxRetry', $event)"
          @retry="emit('batch-retry', $event)"
          @retry-all="emit('batch-retry-all')"
          @clear="emit('batch-clear')"
          @preview-artifact="previewArtifact"
          @download-artifact="downloadArtifact"
          @download-all="downloadAllArtifacts"
          @open-output-folder="openOutputFolder"
        />

        <div v-if="artifacts.length && (!batch || batch.total === 0)" class="panel-flat rounded-md shrink-0 overflow-hidden">
          <div class="flex items-center justify-between gap-2 border-b border-default/60 px-3 py-2 bg-muted/5">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ t('document.result.title', { count: artifacts.length }) }}
            </p>
            <div class="flex items-center gap-2">
              <UButton
                v-if="artifacts.length > 1 && hasInlineResults"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-folder-down"
                :label="t('document.result.downloadAll')"
                @click="saveInlineArchive"
              />
              <UButton
                v-else-if="artifacts.length > 1 && artifacts[0] && !multiJobArtifacts"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-folder-down"
                :label="t('document.result.downloadAll')"
                @click="triggerDownload(archivePath(artifacts[0].jobId))"
              />
              <UButton
                v-else-if="artifacts.length > 1"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-folder-down"
                :label="t('document.result.downloadAll')"
                @click="downloadAllArtifacts"
              />
              <UButton
                v-if="outputPath"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-folder-open"
                :label="t('document.activity.openOutputFolder')"
                @click="openOutputFolder"
              />
              <span class="text-xs text-muted">{{ destinationText }}</span>
            </div>
          </div>
          <ul class="max-h-64 divide-y divide-default/50 overflow-auto">
            <li v-for="artifact in artifacts" :key="artifact.id">
              <AppContextMenu :items="artifactMenu(artifact)">
                <div class="flex items-center gap-2 px-3 py-2 hover:bg-muted/10 transition-colors">
                  <UIcon :name="fileIcon(artifact.fileName)" class="size-4 shrink-0 text-dimmed" />
                  <div class="min-w-0 flex-1">
                    <button
                      v-if="canPreview(artifact)"
                      type="button"
                      class="truncate text-start text-sm font-medium text-foreground hover:underline hover:text-primary cursor-pointer block max-w-full"
                      :title="artifact.fileName"
                      @click="previewArtifact(artifact)"
                    >
                      {{ artifact.fileName }}
                    </button>
                    <p v-else class="truncate text-sm font-medium" :title="artifact.fileName">
                      {{ artifact.fileName }}
                    </p>
                    <p class="text-xs text-muted">
                      {{ formatBytes(artifact.size) }}
                    </p>
                  </div>
                  <UButton
                    v-if="canPreview(artifact)"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-external-link"
                    :aria-label="t('document.result.preview')"
                    @click="previewArtifact(artifact)"
                  />
                  <UButton
                    color="neutral"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-download"
                    :label="t('document.result.download')"
                    @click="downloadArtifact(artifact)"
                  />
                  <UDropdownMenu :items="artifactMenu(artifact)">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-ellipsis-vertical"
                      :aria-label="t('document.result.more')"
                    />
                  </UDropdownMenu>
                </div>
              </AppContextMenu>
            </li>
          </ul>
        </div>
      </div>

      <div class="flex min-h-0 flex-col gap-3">
        <div class="min-h-0 flex-1 flex-col overflow-y-auto space-y-3 lg:pr-1">
          <UCard :ui="{ root: 'panel-flat ring-0', body: 'gap-3 p-4 sm:p-4' }">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon :name="operation?.icon ?? 'i-lucide-file-cog'" class="size-4 text-primary" />
                <p class="text-sm font-semibold">
                  {{ t('document.shell.summary') }}
                </p>
              </div>
            </template>

            <dl class="space-y-2 text-sm mb-2">
              <div class="flex items-start justify-between gap-3">
                <dt class="text-muted">
                  {{ t('document.summary.operation') }}
                </dt>
                <dd class="text-end font-medium">
                  {{ operation ? t(operation.titleKey) : '—' }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-muted">
                  {{ t('document.summary.input') }}
                </dt>
                <dd class="text-end font-medium">
                  {{ t('document.summary.files', { count: summaryInputCount }) }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-3">
                <dt class="text-muted">
                  {{ t('document.summary.output') }}
                </dt>
                <dd class="flex flex-col items-end gap-1">
                  <div class="flex items-center gap-1.5 flex-wrap justify-end">
                    <UBadge
                      v-if="artifacts.length > 0"
                      color="primary"
                      variant="subtle"
                      size="xs"
                    >
                      {{ artifacts.length }} {{ t('document.result.title', { count: artifacts.length }) }}
                    </UBadge>
                    <span class="break-all text-end font-medium">{{ destinationText || '—' }}</span>
                  </div>
                  <UButton
                    v-if="capabilities?.runtime === 'local' || capabilities?.runtime === 'electron'"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-folder-cog"
                    :label="t('document.output.changeFolder')"
                    @click="onPickCustomOutput"
                  />
                </dd>
              </div>
            </dl>

            <slot name="config" />
          </UCard>

          <slot name="advanced" />

          <DocumentStudioBatchPanel
            v-if="batch && batch.total === 0"
            :items="batch.items"
            :concurrency="batch.concurrency"
            :pause-ms="batch.pauseMs"
            :max-retry="batch.maxRetry"
            :status="batch.status"
            :concurrency-cap="batch.concurrencyCap"
            :disabled="batch.status === 'stopping'"
            :output-path="outputPath"
            :artifacts="artifacts"
            @update:concurrency="emit('update:concurrency', $event)"
            @update:pause-ms="emit('update:pauseMs', $event)"
            @update:max-retry="emit('update:maxRetry', $event)"
            @retry="emit('batch-retry', $event)"
            @retry-all="emit('batch-retry-all')"
            @clear="emit('batch-clear')"
            @preview-artifact="previewArtifact"
            @download-artifact="downloadArtifact"
            @download-all="downloadAllArtifacts"
            @open-output-folder="openOutputFolder"
          />
        </div>

        <div class="shrink-0 space-y-2 rounded-md border border-default/60 bg-elevated/40 p-3">
          <div v-if="batch ? (batchActive || batch.total > 0) : running" class="space-y-1">
            <UProgress :model-value="batch ? batch.overallProgress : null" size="xs" />
            <p class="text-xs text-muted">
              <template v-if="batch">
                {{ t('document.batch.overall', { done: batch.done, total: batch.total }) }}
              </template>
              <template v-else>
                {{ uploading ? t('document.progress.uploading') : t('document.progress.processing') }}
              </template>
            </p>
          </div>

          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="t(`document.errors.${error.code}`)"
          />

          <div v-if="batch" class="flex items-center gap-2">
            <UButton
              v-if="batch.status === 'running'"
              class="flex-1"
              color="neutral"
              variant="ghost"
              icon="i-lucide-pause"
              :label="t('document.batch.pause')"
              @click="emit('batch-pause')"
            />
            <UButton
              v-else-if="batch.status === 'paused'"
              class="flex-1"
              color="primary"
              variant="soft"
              icon="i-lucide-play"
              :label="t('document.batch.resume')"
              @click="emit('batch-resume')"
            />
            <UButton
              v-else
              class="flex-1"
              color="primary"
              variant="soft"
              icon="i-lucide-play"
              :label="t('document.batch.start')"
              :disabled="!canRun"
              @click="emit('batch-start')"
            />
            <UButton
              v-if="batchActive"
              color="error"
              variant="soft"
              icon="i-lucide-square"
              :label="t('document.batch.stop')"
              :loading="batch.status === 'stopping'"
              :disabled="batch.status === 'stopping'"
              @click="emit('batch-stop')"
            />
            <UButton
              v-if="!batchActive && batch.total > 0"
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              :label="t('document.batch.clearList')"
              @click="emit('batch-clear')"
            />
          </div>

          <UButton
            v-else
            block
            color="primary"
            variant="soft"
            icon="i-lucide-play"
            :label="t('document.actions.run')"
            :loading="running"
            :disabled="!canRun && !running"
            @click="emit('run')"
          />
        </div>
      </div>
    </div>

    <BaseConfirmModal
      v-model:open="deleteOpen"
      :title="t('document.result.deleteTitle')"
      :description="pendingDelete ? t('document.result.deleteConfirm', { name: pendingDelete.fileName }) : ''"
      :loading="deleting"
      :confirm-label="t('global.delete')"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />

    <LazyBaseResponsiveModal v-model:open="showChangeOutputModal" :title="t('document.output.changeFolderTitle')">
      <template #body>
        <div class="space-y-3 p-4">
          <p class="text-xs text-muted">
            {{ t('document.output.changeFolderHint') }}
          </p>
          <UInput v-model="customOutputPathInput" class="w-full" :placeholder="t('document.output.folderPlaceholder')" />
        </div>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2 p-3">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('global.cancel')"
            @click="showChangeOutputModal = false"
          />
          <UButton
            color="primary"
            variant="soft"
            :label="t('global.save')"
            @click="saveCustomOutput"
          />
        </div>
      </template>
    </LazyBaseResponsiveModal>
  </div>
</template>
