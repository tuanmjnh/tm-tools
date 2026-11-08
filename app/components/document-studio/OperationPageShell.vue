<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DocumentArtifactView, DocumentOperationDefinition, DocumentRuntimeCapabilities } from '#shared/types/document'
import type { DocumentErrorPayload } from '~/composables/useDocumentApi'
import { formatBytes } from '~/utils/documentStudio'
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
  accept?: string
  multiple?: boolean
}>(), {
  running: false,
  uploading: false,
  error: null,
  outputPath: '',
  artifacts: () => [],
  accept: '',
  multiple: false
})

const emit = defineEmits<{
  add: [files: File[]]
  remove: [id: string]
  move: [from: number, to: number]
  run: []
  reset: []
  deleted: [artifactId: string]
}>()

const { t } = useI18n()
const api = useDocumentApi()
const notify = useNotify()
const inputRef = ref<HTMLInputElement | null>(null)
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

/** `?inline=1` only renders PDFs and images; anything else needs the OS handler or a download. */
const INLINE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain'
])

function canPreview(artifact: DocumentArtifactView): boolean {
  if (artifact.inlineBase64) return true
  return desktop || INLINE_MIME.has(artifact.mimeType)
}

function previewArtifact(artifact: DocumentArtifactView) {
  if (artifact.inlineBase64) {
    const url = URL.createObjectURL(new Blob([inlineBytes(artifact.inlineBase64)], { type: artifact.mimeType }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  if (desktop && artifact.localPath) {
    const width = Math.min(1400, Math.max(900, Math.round(window.innerWidth * 0.8)))
    const height = Math.min(980, Math.max(640, Math.round(window.innerHeight * 0.85)))
    window.open(inlinePreviewPath(artifact.downloadPath), '_blank', `popup=yes,width=${width},height=${height}`)
    return
  }
  const width = Math.min(1400, Math.max(900, Math.round(window.innerWidth * 0.8)))
  const height = Math.min(980, Math.max(640, Math.round(window.innerHeight * 0.85)))
  window.open(inlinePreviewPath(artifact.downloadPath), '_blank', `popup=yes,width=${width},height=${height}`)
}

function downloadArtifact(artifact: DocumentArtifactView) {
  if (artifact.inlineBase64) {
    saveInline(artifact)
    return
  }
  triggerDownload(artifact.downloadPath)
}

async function copyValue(value: string) {
  const copied = await copyToClipboard(value)
  if (copied) notify.success(t('document.result.copyPath'), value)
  else notify.error(t('document.result.copyPath'), value)
}

function openOutputFolder() {
  openLocalPath(props.outputPath)
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

const progress = computed(() => {
  if (!props.running) return 0
  return props.uploading ? 15 : 60
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <DocumentStudioOperationStepHeader :operation="operation"
      :step="running ? 'process' : artifacts.length ? 'save' : 'choose'" :loading="running" />

    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="flex min-h-0 flex-col gap-3">
        <div
          class="panel flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-default'" @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
          <input ref="inputRef" type="file" class="hidden" :accept="accept || undefined" :multiple="multiple"
            @change="onPick">
          <UIcon name="i-lucide-cloud-upload" class="size-7 text-dimmed" />
          <p class="text-sm font-medium">
            {{ t(operation?.input.mode === 'single-file' ? 'document.input.dropSingle' : 'document.input.dropMany') }}
          </p>
          <p class="text-xs text-muted">
            {{ accept ? t('document.input.accepted', { types: accept }) : t('document.input.anyFile') }}
          </p>
          <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-folder-open"
            :label="t('document.input.browse')" @click="browse" />
        </div>

        <div v-if="files.length" class="rounded-lg border border-default/70">
          <div class="flex items-center justify-between border-b border-default/60 px-3 py-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ t('document.input.selected', { count: files.length }) }}
            </p>
            <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" :label="t('document.input.clear')"
              @click="emit('reset')" />
          </div>
          <ul class="max-h-64 divide-y divide-default/50 overflow-auto">
            <li v-for="(file, index) in files" :key="file.id" class="flex items-center gap-2 px-3 py-2">
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
                <UButton color="neutral" variant="ghost" size="xs" square icon="i-lucide-arrow-up"
                  :disabled="index === 0" :aria-label="t('document.input.moveUp')"
                  @click="emit('move', index, index - 1)" />
                <UButton color="neutral" variant="ghost" size="xs" square icon="i-lucide-arrow-down"
                  :disabled="index === files.length - 1" :aria-label="t('document.input.moveDown')"
                  @click="emit('move', index, index + 1)" />
              </div>
              <UButton color="neutral" variant="ghost" size="xs" square icon="i-lucide-trash-2"
                :aria-label="t('document.input.remove')" @click="emit('remove', file.id)" />
            </li>
          </ul>
        </div>

        <div v-if="artifacts.length" class="rounded-lg border border-default/70">
          <div class="flex items-center justify-between gap-2 border-b border-default/60 px-3 py-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ t('document.result.title', { count: artifacts.length }) }}
            </p>
            <div class="flex items-center gap-2">
              <UButton v-if="artifacts.length > 1 && hasInlineResults" color="neutral" variant="ghost" size="xs"
                icon="i-lucide-folder-down" :label="t('document.result.downloadAll')" @click="saveInlineArchive" />
              <UButton v-else-if="artifacts.length > 1 && artifacts[0]" color="neutral" variant="ghost" size="xs"
                icon="i-lucide-folder-down" :label="t('document.result.downloadAll')"
                @click="triggerDownload(archivePath(artifacts[0].jobId))" />
              <UButton v-if="desktop && outputPath" color="neutral" variant="ghost" size="xs"
                icon="i-lucide-folder-open" :label="t('document.activity.openOutputFolder')"
                @click="openOutputFolder" />
              <span class="text-xs text-muted">{{ destinationText }}</span>
            </div>
          </div>
          <ul class="max-h-64 divide-y divide-default/50 overflow-auto">
            <li v-for="artifact in artifacts" :key="artifact.id">
              <AppContextMenu :items="artifactMenu(artifact)">
                <div class="flex items-center gap-2 px-3 py-2">
                  <UIcon :name="fileIcon(artifact.fileName)" class="size-4 shrink-0 text-dimmed" />
                  <div class="min-w-0 flex-1">
                    <button v-if="canPreview(artifact)" type="button"
                      class="truncate text-start text-sm font-medium text-foreground hover:underline hover:text-primary cursor-pointer block max-w-full"
                      :title="artifact.fileName" @click="previewArtifact(artifact)">
                      {{ artifact.fileName }}
                    </button>
                    <p v-else class="truncate text-sm font-medium" :title="artifact.fileName">
                      {{ artifact.fileName }}
                    </p>
                    <p class="text-xs text-muted">
                      {{ formatBytes(artifact.size) }}
                    </p>
                  </div>
                  <UButton v-if="canPreview(artifact)" color="neutral" variant="ghost" size="xs"
                    icon="i-lucide-external-link" :aria-label="t('document.result.preview')"
                    @click="previewArtifact(artifact)" />
                  <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-download"
                    :label="t('document.result.download')" @click="downloadArtifact(artifact)" />
                  <UDropdownMenu :items="artifactMenu(artifact)">
                    <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical"
                      :aria-label="t('document.result.more')" />
                  </UDropdownMenu>
                </div>
              </AppContextMenu>
            </li>
          </ul>
        </div>
      </div>

      <div class="flex min-h-0 flex-col gap-3">
        <UCard :ui="{ root: 'panel', body: 'gap-3 p-4 sm:p-4' }">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon :name="operation?.icon ?? 'i-lucide-file-cog'" class="size-4 text-primary" />
              <p class="text-sm font-semibold">
                {{ t('document.shell.summary') }}
              </p>
            </div>
          </template>

          <dl class="space-y-2 text-sm">
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
                {{t('document.summary.files', { count: files.filter(file => file.status === 'selected').length })}}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-muted">
                {{ t('document.summary.output') }}
              </dt>
              <dd class="break-all text-end font-medium">
                {{ destinationText || '—' }}
              </dd>
            </div>
          </dl>

          <slot name="config" />

          <div v-if="running" class="space-y-1">
            <UProgress :model-value="progress" size="xs" />
            <p class="text-xs text-muted">
              {{ uploading ? t('document.progress.uploading') : t('document.progress.processing') }}
            </p>
          </div>

          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert"
            :title="t(`document.errors.${error.code}`)" />

          <UButton block color="primary" variant="soft" icon="i-lucide-play" :label="t('document.actions.run')"
            :loading="running" :disabled="!canRun && !running" @click="emit('run')" />
        </UCard>

        <slot name="advanced" />
      </div>
    </div>

    <BaseConfirmModal v-model:open="deleteOpen" :title="t('document.result.deleteTitle')"
      :description="pendingDelete ? t('document.result.deleteConfirm', { name: pendingDelete.fileName }) : ''"
      :loading="deleting" :confirm-label="t('global.delete')" @confirm="confirmDelete" @cancel="pendingDelete = null" />
  </div>
</template>
